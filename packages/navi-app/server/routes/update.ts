/**
 * Self-update routes — git-based OTA for source installs.
 *
 * Navi runs as a launchd service (com.navi.app) pointed at the source repo.
 * Update = git pull --ff-only + bun install + `launchctl kickstart -k`,
 * which kills the whole service tree and lets launchd relaunch it.
 */
import { resolve } from "path";
import { json, error } from "../utils/response";

const APP_ROOT = resolve(import.meta.dir, "../..");
const STATUS_TTL_MS = 5 * 60_000;
const PERIODIC_CHECK_MS = 30 * 60_000;

interface UpdateStatus {
  version: string;
  branch: string;
  commit: string;
  behind: number;
  commits: { hash: string; subject: string }[];
  managedByLaunchd: boolean;
  checkedAt: number;
  error?: string;
}

let statusCache: UpdateStatus | null = null;
let applying = false;

async function run(
  cmd: string[],
  timeoutMs = 30_000,
  cwd = APP_ROOT,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
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

async function checkForUpdates(force = false): Promise<UpdateStatus> {
  if (!force && statusCache && Date.now() - statusCache.checkedAt < STATUS_TTL_MS) {
    return statusCache;
  }

  let version = "unknown";
  try {
    version = (await Bun.file(resolve(APP_ROOT, "package.json")).json()).version;
  } catch {}

  const managedByLaunchd = process.env.NAVI_MANAGED_BY === "launchd";
  const base: UpdateStatus = {
    version,
    branch: "",
    commit: "",
    behind: 0,
    commits: [],
    managedByLaunchd,
    checkedAt: Date.now(),
  };

  const [branchRes, commitRes] = await Promise.all([
    run(["git", "branch", "--show-current"]),
    run(["git", "rev-parse", "--short", "HEAD"]),
  ]);
  base.branch = branchRes.stdout.trim();
  base.commit = commitRes.stdout.trim();

  const fetchRes = await run(["git", "fetch", "origin", "main"], 60_000);
  if (!fetchRes.ok) {
    base.error = `fetch failed: ${fetchRes.stderr.trim().slice(0, 200)}`;
    statusCache = base;
    return base;
  }

  const countRes = await run(["git", "rev-list", "--count", "HEAD..origin/main"]);
  base.behind = parseInt(countRes.stdout.trim(), 10) || 0;

  if (base.behind > 0) {
    const logRes = await run(["git", "log", "--format=%h%x09%s", "HEAD..origin/main", "-20"]);
    base.commits = logRes.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.split("\t");
        return { hash, subject: rest.join("\t") };
      });
  }

  statusCache = base;
  return base;
}

// Background check so the UI badge appears without the user polling hard.
setInterval(() => {
  checkForUpdates(true).catch(() => {});
}, PERIODIC_CHECK_MS);

function scheduleRestart() {
  const uid = process.getuid?.() ?? 501;
  // Detached-ish: launchd completes the restart once launchctl has issued
  // the request, even though this child dies with the service tree.
  Bun.spawn(
    ["sh", "-c", `sleep 1 && exec launchctl kickstart -k gui/${uid}/com.navi.app`],
    { stdout: "ignore", stderr: "ignore", stdin: "ignore" },
  );
}

export async function handleUpdateRoutes(
  url: URL,
  method: string,
  _req: Request,
): Promise<Response | null> {
  if (url.pathname === "/api/update/status" && method === "GET") {
    const force = url.searchParams.get("force") === "1";
    return json(await checkForUpdates(force));
  }

  if (url.pathname === "/api/update/apply" && method === "POST") {
    if (applying) return error("Update already in progress", 409);
    applying = true;
    try {
      const status = await checkForUpdates(true);
      if (status.branch !== "main") {
        return error(`Not on main (on '${status.branch}') — update manually`, 400);
      }
      if (status.behind === 0) return error("Already up to date", 400);

      const pullRes = await run(["git", "pull", "--ff-only", "origin", "main"], 120_000);
      if (!pullRes.ok) {
        return error(`git pull failed: ${pullRes.stderr.trim().slice(0, 300)}`, 500);
      }

      const installRes = await run(["bun", "install"], 300_000);
      if (!installRes.ok) {
        return error(`bun install failed: ${installRes.stderr.trim().slice(0, 300)}`, 500);
      }

      statusCache = null;
      if (status.managedByLaunchd) {
        scheduleRestart();
        return json({ ok: true, restarting: true });
      }
      return json({
        ok: true,
        restarting: false,
        message: "Updated. Restart Navi manually to finish.",
      });
    } finally {
      applying = false;
    }
  }

  return null;
}
