/**
 * Accounts & usage routes — Claude Code multi-account status/control via the
 * ccx CLI, plus Codex usage parsed from ~/.codex session logs.
 *
 * ccx stays the source of truth; we only shell out and cache.
 */
import { homedir } from "os";
import { join } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import { json, error } from "../utils/response";

const STATUS_TTL_MS = 30_000;
const USAGE_TTL_MS = 5 * 60_000;
const CCX_TIMEOUT_MS = 20_000;

interface CacheEntry<T> {
  data: T;
  ts: number;
}

let statusCache: CacheEntry<unknown> | null = null;
let usageCache: CacheEntry<unknown> | null = null;

async function runCommand(
  cmd: string[],
  timeoutMs = CCX_TIMEOUT_MS,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const timeout = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timeout);
    return { ok: exitCode === 0, stdout, stderr };
  } catch (e) {
    return { ok: false, stdout: "", stderr: String(e) };
  }
}

// ── ccx ───────────────────────────────────────────────────────

async function getCcxStatus(force = false): Promise<unknown> {
  if (!force && statusCache && Date.now() - statusCache.ts < STATUS_TTL_MS) {
    return statusCache.data;
  }
  const res = await runCommand(["ccx", "status", "--json"]);
  if (!res.ok) {
    return { available: false, error: res.stderr.trim() || "ccx not available" };
  }
  try {
    const parsed = JSON.parse(res.stdout);
    const data = { available: true, ...parsed };
    statusCache = { data, ts: Date.now() };
    return data;
  } catch {
    return { available: false, error: "ccx status returned invalid JSON" };
  }
}

interface StatsGauge {
  kind: string;
  scopeModel: string | null;
  now: number;
  avg: number;
  peak: number;
  sparkline: string | null;
}

/** Parse `ccx stats` fixed-format text output into structured data. */
function parseCcxStats(text: string): { header: string; accounts: Record<string, StatsGauge[]> } {
  const accounts: Record<string, StatsGauge[]> = {};
  let header = "";
  let current: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("last ")) {
      header = line.trim();
      continue;
    }
    const gauge = line.match(
      /^\s+(\S+)(?:\s+\[([^\]]+)\])?\s+now\s+(\d+)%\s+avg\s+(\d+)%\s+peak\s+(\d+)%(?:\s+(\S+))?\s*$/,
    );
    if (gauge && current) {
      accounts[current].push({
        kind: gauge[1],
        scopeModel: gauge[2] || null,
        now: parseInt(gauge[3], 10),
        avg: parseInt(gauge[4], 10),
        peak: parseInt(gauge[5], 10),
        sparkline: gauge[6] || null,
      });
    } else if (/^\S/.test(line)) {
      current = line.trim();
      accounts[current] = [];
    }
  }
  return { header, accounts };
}

// ── Codex ─────────────────────────────────────────────────────

interface CodexUsage {
  available: boolean;
  fetchedAt?: string;
  planType?: string;
  primary?: { usedPercent: number; windowMinutes: number; resetsAt: number };
  secondary?: { usedPercent: number; windowMinutes: number; resetsAt: number } | null;
  totalTokens?: number;
  sessionFile?: string;
}

/** Newest token_count event across recent Codex session rollout files. */
async function getCodexUsage(): Promise<CodexUsage> {
  const sessionsDir = join(homedir(), ".codex", "sessions");
  if (!existsSync(sessionsDir)) return { available: false };

  // Collect candidate .jsonl files from the last few day-directories, newest first
  const files: { path: string; mtime: number }[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (name.endsWith(".jsonl") && Date.now() - st.mtimeMs < 14 * 86_400_000) {
        files.push({ path: p, mtime: st.mtimeMs });
      }
    }
  };
  walk(sessionsDir, 0);
  files.sort((a, b) => b.mtime - a.mtime);

  for (const f of files.slice(0, 10)) {
    try {
      const text = await Bun.file(f.path).text();
      const lines = text.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"token_count"')) continue;
        const parsed = JSON.parse(lines[i]);
        const info = parsed?.payload?.info;
        const limits = parsed?.payload?.rate_limits;
        if (!limits) continue;
        return {
          available: true,
          fetchedAt: parsed.timestamp,
          planType: limits.plan_type ?? undefined,
          primary: limits.primary
            ? {
                usedPercent: limits.primary.used_percent,
                windowMinutes: limits.primary.window_minutes,
                resetsAt: limits.primary.resets_at,
              }
            : undefined,
          secondary: limits.secondary
            ? {
                usedPercent: limits.secondary.used_percent,
                windowMinutes: limits.secondary.window_minutes,
                resetsAt: limits.secondary.resets_at,
              }
            : null,
          totalTokens: info?.total_token_usage?.total_tokens ?? undefined,
          sessionFile: f.path,
        };
      }
    } catch {
      // unreadable/corrupt file — try the next one
    }
  }
  return { available: false };
}

// ── Routes ────────────────────────────────────────────────────

export async function handleAccountsRoutes(
  url: URL,
  method: string,
  req: Request,
): Promise<Response | null> {
  if (url.pathname === "/api/accounts/status" && method === "GET") {
    const force = url.searchParams.get("force") === "1";
    return json(await getCcxStatus(force));
  }

  if (url.pathname === "/api/accounts/usage" && method === "GET") {
    if (usageCache && Date.now() - usageCache.ts < USAGE_TTL_MS && url.searchParams.get("force") !== "1") {
      return json(usageCache.data);
    }
    const since = url.searchParams.get("since") || "7d";
    if (!/^\d+[dwh]$/.test(since)) return error("Invalid since parameter", 400);
    const [statsRes, codex] = await Promise.all([
      runCommand(["ccx", "stats", "--since", since]),
      getCodexUsage(),
    ]);
    const data = {
      claude: statsRes.ok
        ? { available: true, ...parseCcxStats(statsRes.stdout) }
        : { available: false, error: statsRes.stderr.trim() || "ccx not available" },
      codex,
    };
    usageCache = { data, ts: Date.now() };
    return json(data);
  }

  if (url.pathname === "/api/accounts/swap" && method === "POST") {
    let account: string;
    try {
      const body = (await req.json()) as { account?: string };
      account = body.account || "";
    } catch {
      return error("Invalid JSON body", 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(account)) return error("Invalid account name", 400);
    const res = await runCommand(["ccx", "swap", account], 60_000);
    statusCache = null;
    if (!res.ok) return error(res.stderr.trim() || res.stdout.trim() || "swap failed", 500);
    return json({ ok: true, account, output: res.stdout.trim() });
  }

  return null;
}
