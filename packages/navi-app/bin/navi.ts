#!/usr/bin/env bun
/**
 * Navi CLI — start and control Navi on localhost
 *
 * Usage:
 *   navi                        Start all servers
 *   navi --port 3021            Start with a custom backend port
 *   navi ws list|create|rm      Manage workspaces (projects)
 *   navi session new|ls         Manage chat sessions
 *   navi run <cmd>              Run a command through the backend (streamed)
 *   navi term new|ls|kill       Manage PTY terminals
 *   navi service ...            Run as a background LaunchAgent (macOS)
 *   navi update                 Update to the latest release
 */

import { spawn, type SpawnOptions, type Subprocess } from "bun";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const NAVI = `
  ╔═══════════════════════════════════╗
  ║                                   ║
  ║   ███╗   ██╗ █████╗ ██╗   ██╗██╗  ║
  ║   ████╗  ██║██╔══██╗██║   ██║██║  ║
  ║   ██╔██╗ ██║███████║██║   ██║██║  ║
  ║   ██║╚██╗██║██╔══██║╚██╗ ██╔╝██║  ║
  ║   ██║ ╚████║██║  ██║ ╚████╔╝ ██║  ║
  ║   ╚═╝  ╚═══╝╚═╝  ╚═╝  ╚═══╝ ╚═╝  ║
  ║                                   ║
  ║       Already on it.              ║
  ║                                   ║
  ╚═══════════════════════════════════╝
`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREFERRED_BUN_BIN =
  process.env.NAVI_BUN_PATH ||
  process.env.BUN_PATH ||
  process.env.BUN_EXECUTABLE ||
  "bun";

// Parse args
const args = process.argv.slice(2);
const command = args[0];

// ── navi update ──────────────────────────────────────────────
if (command === "update") {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

  console.log(dim("\n  Checking for updates...\n"));

  const REPO = "brunoqgalvao/navi";
  const INSTALL_DIR = resolve(ROOT, "..");

  // Get current version
  let currentVersion = "0.0.0";
  try {
    const pkg = await Bun.file(resolve(ROOT, "package.json")).json();
    currentVersion = pkg.version;
  } catch {}

  // Fetch latest release
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!res.ok) {
    console.error("  Failed to check for updates.");
    process.exit(1);
  }
  const release = await res.json() as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
  const latestVersion = release.tag_name.replace(/^v/, "");

  if (currentVersion === latestVersion) {
    console.log(green(`  Already on the latest version (v${currentVersion})!\n`));
    process.exit(0);
  }

  console.log(dim(`  Current: v${currentVersion}`));
  console.log(cyan(`  Latest:  v${latestVersion}\n`));

  // Find the CLI tarball asset
  const tarballAsset = release.assets.find((a: { name: string }) => a.name.startsWith("navi-cli-") && a.name.endsWith(".tar.gz"));
  if (!tarballAsset) {
    console.error("  No CLI tarball found in release. Try reinstalling:");
    console.error(cyan("  curl -fsSL https://raw.githubusercontent.com/brunoqgalvao/navi/main/scripts/install-cli.sh | bash\n"));
    process.exit(1);
  }

  // Download and extract
  console.log(dim("  Downloading..."));
  const download = Bun.spawnSync(
    ["curl", "-fsSL", tarballAsset.browser_download_url, "-o", "/tmp/navi-cli-update.tar.gz"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (download.exitCode !== 0) {
    console.error("  Download failed:", download.stderr.toString());
    process.exit(1);
  }

  // Extract over existing install (preserves node_modules)
  console.log(dim("  Extracting..."));
  const extract = Bun.spawnSync(
    ["tar", "-xzf", "/tmp/navi-cli-update.tar.gz", "-C", INSTALL_DIR, "--strip-components=0"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (extract.exitCode !== 0) {
    console.error("  Extract failed:", extract.stderr.toString());
    process.exit(1);
  }

  // Reinstall deps
  console.log(dim("  Installing dependencies..."));
  const install = Bun.spawnSync([PREFERRED_BUN_BIN, "install"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (install.exitCode !== 0) {
    console.error("  Failed to install dependencies:", install.stderr.toString());
    process.exit(1);
  }

  // Cleanup
  Bun.spawnSync(["rm", "-f", "/tmp/navi-cli-update.tar.gz"]);

  console.log(green(`\n  Updated to Navi v${latestVersion}!\n`));
  process.exit(0);
}

// ── navi version ─────────────────────────────────────────────
if (command === "version" || command === "--version" || command === "-v") {
  try {
    const pkg = await Bun.file(resolve(ROOT, "package.json")).json();
    console.log(`Navi v${pkg.version}`);
  } catch {
    console.log("Navi (unknown version)");
  }
  process.exit(0);
}

// ── navi service ─────────────────────────────────────────────
if (command === "service") {
  await handleService(args.slice(1));
  process.exit(0);
}

async function handleService(serviceArgs: string[]) {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

  const SERVICE_LABEL = "com.navi.app";
  const HOME = process.env.HOME || "";
  const PLIST_PATH = resolve(HOME, "Library/LaunchAgents", `${SERVICE_LABEL}.plist`);
  const LOG_DIR = resolve(HOME, ".claude-code-ui/logs");
  const STDOUT_LOG = resolve(LOG_DIR, "navi-service.out.log");
  const STDERR_LOG = resolve(LOG_DIR, "navi-service.err.log");
  const UID = process.getuid?.() ?? 501;
  const DOMAIN = `gui/${UID}`;
  const TARGET = `${DOMAIN}/${SERVICE_LABEL}`;

  if (process.platform !== "darwin") {
    console.error(red("  navi service is only supported on macOS right now."));
    console.error(dim("  PRs welcome for systemd/Linux."));
    process.exit(1);
  }

  function printHelp() {
    console.log(`
  ${cyan("navi service")} — run Navi as a background LaunchAgent on macOS

  ${dim("Subcommands:")}
    install [--dev]   Install LaunchAgent and start at login
    uninstall         Stop and remove the LaunchAgent
    start             Load (start) an installed service
    stop              Unload (stop) without removing the plist
    restart           Restart the running service
    status            Show service state and PID
    logs [--no-follow]  Tail service stdout/stderr logs

  ${dim("Flags:")}
    --dev             Point service at this source repo (default: ${cyan("~/.navi")})

  ${dim("Examples:")}
    navi service install
    navi service install --dev
    navi service status
    navi service logs
`);
  }

  function resolveTarget(isDev: boolean): { script: string; cwd: string } {
    if (isDev) {
      return { script: resolve(ROOT, "bin/navi.ts"), cwd: ROOT };
    }
    const installRoot = resolve(HOME, ".navi/packages/navi-app");
    const script = resolve(installRoot, "bin/navi.ts");
    if (!existsSync(script)) {
      console.error(red(`  Installed Navi not found at ${installRoot}.`));
      console.error(dim("  Install first:"));
      console.error(
        cyan("  curl -fsSL https://raw.githubusercontent.com/brunoqgalvao/navi/main/scripts/install-cli.sh | bash"),
      );
      console.error(dim("  …or pass --dev to use this source repo."));
      process.exit(1);
    }
    return { script, cwd: installRoot };
  }

  function buildPlist(opts: { bunPath: string; script: string; cwd: string }): string {
    const bunDir = dirname(opts.bunPath);
    const nodePath = process.env.NAVI_NODE_PATH || "";
    const pathEntries = [
      bunDir,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      `${HOME}/.bun/bin`,
      `${HOME}/.cargo/bin`,
      `${HOME}/.local/bin`,
    ];
    const PATH = Array.from(new Set(pathEntries)).join(":");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.bunPath}</string>
    <string>${opts.script}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${opts.cwd}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${STDERR_LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH}</string>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>NAVI_BUN_PATH</key>
    <string>${opts.bunPath}</string>
    <key>NAVI_NODE_PATH</key>
    <string>${nodePath}</string>
    <key>NAVI_MANAGED_BY</key>
    <string>launchd</string>
  </dict>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;
  }

  function isLoaded(): boolean {
    const r = Bun.spawnSync(["launchctl", "print", TARGET], { stdout: "ignore", stderr: "ignore" });
    return r.exitCode === 0;
  }

  function bootstrap() {
    const r = Bun.spawnSync(["launchctl", "bootstrap", DOMAIN, PLIST_PATH], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (r.exitCode !== 0) {
      const stderr = r.stderr.toString().trim();
      // bootstrap errors with "service already loaded" — treat as soft success.
      if (/already (loaded|bootstrapped)/i.test(stderr)) return;
      throw new Error(`launchctl bootstrap failed: ${stderr || `exit ${r.exitCode}`}`);
    }
  }

  function bootout(): { ok: boolean; stderr: string } {
    const r = Bun.spawnSync(["launchctl", "bootout", TARGET], { stdout: "pipe", stderr: "pipe" });
    return { ok: r.exitCode === 0, stderr: r.stderr.toString().trim() };
  }

  function kickstart() {
    Bun.spawnSync(["launchctl", "kickstart", "-k", TARGET], { stdout: "ignore", stderr: "pipe" });
  }

  function ensureDirs() {
    mkdirSync(LOG_DIR, { recursive: true });
    mkdirSync(dirname(PLIST_PATH), { recursive: true });
  }

  async function doInstall(isDev: boolean) {
    const { script, cwd } = resolveTarget(isDev);
    const bunPath = process.execPath;

    ensureDirs();
    const plist = buildPlist({ bunPath, script, cwd });

    if (isLoaded()) {
      console.log(dim("  Service already loaded — replacing…"));
      bootout();
    }

    writeFileSync(PLIST_PATH, plist, "utf8");
    console.log(dim(`  Wrote ${PLIST_PATH}`));

    bootstrap();
    console.log(green(`  Navi service installed and started.`));
    console.log("");
    console.log(`  ${dim("Mode:")}    ${isDev ? yellow("dev (this source repo)") : cyan("installed (~/.navi)")}`);
    console.log(`  ${dim("Script:")}  ${script}`);
    console.log(`  ${dim("Logs:")}    ${STDOUT_LOG}`);
    console.log("");
    console.log(`  ${dim("Tail logs:")}    ${cyan("navi service logs")}`);
    console.log(`  ${dim("Check status:")} ${cyan("navi service status")}`);
    console.log(`  ${dim("Open UI:")}      ${cyan("http://localhost:1420")}`);
  }

  function doUninstall() {
    if (isLoaded()) {
      const { ok, stderr } = bootout();
      if (!ok && !/could not find|not loaded/i.test(stderr)) {
        console.error(red(`  bootout failed: ${stderr}`));
        process.exit(1);
      }
    }
    if (existsSync(PLIST_PATH)) {
      unlinkSync(PLIST_PATH);
      console.log(dim(`  Removed ${PLIST_PATH}`));
    }
    console.log(green("  Navi service uninstalled."));
  }

  function doStart() {
    if (!existsSync(PLIST_PATH)) {
      console.error(red("  Service is not installed. Run `navi service install` first."));
      process.exit(1);
    }
    if (isLoaded()) {
      console.log(dim("  Already running."));
      return;
    }
    bootstrap();
    console.log(green("  Navi service started."));
  }

  function doStop() {
    if (!isLoaded()) {
      console.log(dim("  Service is not loaded."));
      return;
    }
    const { ok, stderr } = bootout();
    if (!ok && !/could not find|not loaded/i.test(stderr)) {
      console.error(red(`  bootout failed: ${stderr}`));
      process.exit(1);
    }
    console.log(green("  Navi service stopped."));
  }

  function doRestart() {
    if (!isLoaded()) {
      doStart();
      return;
    }
    kickstart();
    console.log(green("  Navi service restarted."));
  }

  function doStatus() {
    const installed = existsSync(PLIST_PATH);
    const loaded = isLoaded();

    console.log("");
    console.log(`  ${dim("Service:")}   ${SERVICE_LABEL}`);
    console.log(`  ${dim("Installed:")} ${installed ? green("yes") : red("no")}`);
    console.log(`  ${dim("Loaded:")}    ${loaded ? green("yes") : red("no")}`);

    if (loaded) {
      const r = Bun.spawnSync(["launchctl", "print", TARGET], { stdout: "pipe", stderr: "ignore" });
      const out = r.stdout.toString();
      const pid = out.match(/pid\s*=\s*(\d+)/)?.[1];
      const state = out.match(/state\s*=\s*(\w+)/)?.[1];
      const lastExit = out.match(/last exit code\s*=\s*(-?\d+)/)?.[1];
      console.log(`  ${dim("State:")}     ${state ?? "unknown"}`);
      console.log(`  ${dim("PID:")}       ${pid ?? "—"}`);
      if (lastExit) console.log(`  ${dim("Last exit:")} ${lastExit}`);
    }

    console.log(`  ${dim("Plist:")}     ${PLIST_PATH}`);
    console.log(`  ${dim("Logs:")}      ${STDOUT_LOG}`);
    console.log("");
  }

  async function doLogs(logArgs: string[]) {
    const follow = !logArgs.includes("--no-follow");
    if (!existsSync(STDOUT_LOG) && !existsSync(STDERR_LOG)) {
      console.log(dim(`  No logs yet at ${LOG_DIR}.`));
      return;
    }
    const tailArgs = follow ? ["-F", "-n", "100"] : ["-n", "200"];
    const targets = [STDOUT_LOG, STDERR_LOG].filter((p) => existsSync(p));
    const proc = spawn(["tail", ...tailArgs, ...targets], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    process.on("SIGINT", () => proc.kill());
    await proc.exited;
  }

  const sub = serviceArgs[0];
  const isDev = serviceArgs.includes("--dev");

  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    printHelp();
    return;
  }

  try {
    switch (sub) {
      case "install":
        await doInstall(isDev);
        break;
      case "uninstall":
      case "remove":
        doUninstall();
        break;
      case "start":
        doStart();
        break;
      case "stop":
        doStop();
        break;
      case "restart":
        doRestart();
        break;
      case "status":
        doStatus();
        break;
      case "logs":
        await doLogs(serviceArgs.slice(1));
        break;
      default:
        console.error(red(`  Unknown subcommand: ${sub}`));
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    console.error(red(`  Error: ${err?.message ?? err}`));
    process.exit(1);
  }
}

// ── navi ws / session / run / term (API commands) ────────────
if (command === "ws" || command === "session" || command === "run" || command === "term") {
  await handleApiCommand(command, args.slice(1));
  process.exit(0);
}

if (command === "help" || command === "--help" || command === "-h") {
  console.log(`
  \x1b[36mnavi\x1b[0m — local UI for coding agents

  \x1b[2mStart:\x1b[0m
    navi [--port 3021]              Start backend, PTY server, and frontend

  \x1b[2mWorkspaces (projects):\x1b[0m
    navi ws list                    List workspaces
    navi ws create <name> [path]    Create workspace (path defaults to cwd)
    navi ws rm <id|name>            Delete a workspace

  \x1b[2mSessions:\x1b[0m
    navi session new <ws> [--title t] [--prompt p]   New chat (optionally send a prompt)
    navi session ls <ws>            List sessions in a workspace

  \x1b[2mTerminal:\x1b[0m
    navi run <cmd...> [--cwd dir]   Run a command via the backend, stream output
    navi term new [--cwd dir]       Create a PTY terminal
    navi term ls                    List PTY terminals
    navi term kill <id>             Kill a PTY terminal

  \x1b[2mOther:\x1b[0m
    navi service <sub>              Background LaunchAgent (macOS)
    navi update                     Update to latest release
    navi version                    Show version

  \x1b[2mAPI commands target http://localhost:3021 — override with --port or NAVI_PORT.\x1b[0m
`);
  process.exit(0);
}

async function handleApiCommand(cmd: string, rest: string[]) {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  function die(msg: string): never {
    console.error(red(`  ${msg}`));
    process.exit(1);
  }

  // Pull `--flag value` out of the arg list; returns the value or undefined.
  function takeFlag(name: string): string | undefined {
    const i = rest.indexOf(name);
    if (i === -1) return undefined;
    const value = rest[i + 1];
    rest.splice(i, 2);
    return value;
  }

  const apiPort = takeFlag("--port") || process.env.NAVI_PORT || "3021";
  const BASE = `http://localhost:${apiPort}`;

  async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
    } catch {
      die(`Could not reach the Navi backend at ${BASE}. Start it with ${cyan("navi")} or ${cyan("navi service start")}.`);
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) die(body?.error || `Request failed: ${res.status} ${path}`);
    return body as T;
  }

  interface Project {
    id: string;
    name: string;
    path: string;
  }

  async function resolveProject(idOrName: string): Promise<Project> {
    const all = await api<Project[]>("/api/projects");
    const matches = all.filter(
      (p) => p.id === idOrName || p.name === idOrName || p.id.startsWith(idOrName),
    );
    if (matches.length === 0) die(`No workspace matching "${idOrName}". Try ${cyan("navi ws list")}.`);
    if (matches.length > 1) die(`"${idOrName}" is ambiguous (${matches.length} matches). Use the full id.`);
    return matches[0];
  }

  const shortId = (id: string) => id.slice(0, 8);
  const sub = rest[0];

  // ── navi ws ────────────────────────────────────────────────
  if (cmd === "ws") {
    if (sub === "list" || sub === "ls" || !sub) {
      const all = await api<Project[]>("/api/projects");
      if (all.length === 0) {
        console.log(dim("  No workspaces yet. Create one: navi ws create <name> [path]"));
        return;
      }
      for (const p of all) {
        console.log(`  ${cyan(shortId(p.id))}  ${p.name}  ${dim(p.path)}`);
      }
      return;
    }
    if (sub === "create") {
      const name = rest[1];
      if (!name) die("Usage: navi ws create <name> [path]");
      const path = resolve(rest[2] || process.cwd());
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, path }),
      });
      console.log(green(`  Created workspace ${project.name}`));
      console.log(`  ${dim("id:")}   ${cyan(project.id)}`);
      console.log(`  ${dim("path:")} ${project.path}`);
      return;
    }
    if (sub === "rm" || sub === "remove" || sub === "delete") {
      if (!rest[1]) die("Usage: navi ws rm <id|name>");
      const project = await resolveProject(rest[1]);
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      console.log(green(`  Removed workspace ${project.name} (${shortId(project.id)})`));
      return;
    }
    die(`Unknown subcommand: navi ws ${sub}. Try: list, create, rm`);
  }

  // ── navi session ───────────────────────────────────────────
  if (cmd === "session") {
    if (sub === "new") {
      const title = takeFlag("--title");
      const prompt = takeFlag("--prompt");
      if (!rest[1]) die("Usage: navi session new <ws> [--title t] [--prompt p]");
      const project = await resolveProject(rest[1]);
      const session = await api<{ id: string; title: string }>(
        `/api/projects/${project.id}/sessions`,
        { method: "POST", body: JSON.stringify({ title: title || "New conversation" }) },
      );
      console.log(green(`  Created session "${session.title}" in ${project.name}`));
      console.log(`  ${dim("id:")} ${cyan(session.id)}`);
      if (prompt) {
        const res = await fetch(`${BASE}/api/sessions/${session.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt }),
        }).catch(() => null);
        if (res?.ok) {
          console.log(green("  Prompt sent — Claude is on it."));
        } else if (res?.status === 503) {
          console.log(yellow("  Session created, but the prompt was not dispatched:"));
          console.log(dim("  queries run through a connected Navi UI — open the app and resend."));
        } else {
          const body: any = res ? await res.json().catch(() => ({})) : {};
          console.log(yellow(`  Session created, but sending the prompt failed: ${body?.error || res?.status || "backend unreachable"}`));
        }
      }
      return;
    }
    if (sub === "ls" || sub === "list") {
      if (!rest[1]) die("Usage: navi session ls <ws>");
      const project = await resolveProject(rest[1]);
      const list = await api<{ id: string; title: string; updated_at: number }[]>(
        `/api/projects/${project.id}/sessions`,
      );
      if (list.length === 0) {
        console.log(dim(`  No sessions in ${project.name}.`));
        return;
      }
      for (const s of list) {
        const when = new Date(s.updated_at).toLocaleString();
        console.log(`  ${cyan(shortId(s.id))}  ${s.title}  ${dim(when)}`);
      }
      return;
    }
    die(`Unknown subcommand: navi session ${sub}. Try: new, ls`);
  }

  // ── navi run ───────────────────────────────────────────────
  if (cmd === "run") {
    const cwd = takeFlag("--cwd");
    const commandLine = rest.join(" ").trim();
    if (!commandLine) die('Usage: navi run <cmd...> [--cwd dir]  (quote pipes: navi run "ls | wc -l")');

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/terminal/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: commandLine, cwd: cwd ? resolve(cwd) : process.cwd() }),
      });
    } catch {
      die(`Could not reach the Navi backend at ${BASE}. Start it with ${cyan("navi")}.`);
    }
    if (!res.ok || !res.body) die(`Exec request failed: ${res.status}`);

    let execId: string | null = null;
    process.on("SIGINT", async () => {
      if (execId) {
        await fetch(`${BASE}/api/terminal/exec/${execId}`, { method: "DELETE" }).catch(() => {});
      }
      process.exit(130);
    });

    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (!raw.startsWith("data: ")) continue;
        let event: any;
        try {
          event = JSON.parse(raw.slice(6));
        } catch {
          continue;
        }
        switch (event.type) {
          case "started":
            execId = event.execId;
            break;
          case "stdout":
            process.stdout.write(event.data);
            break;
          case "stderr":
            process.stderr.write(event.data);
            break;
          case "exit":
            process.exit(event.code ?? 0);
          case "error":
            die(event.message || "Exec failed");
        }
      }
    }
    // Stream ended without an exit event — treat as failure.
    die("Stream ended unexpectedly.");
  }

  // ── navi term ──────────────────────────────────────────────
  if (cmd === "term") {
    if (sub === "new") {
      const cwd = takeFlag("--cwd");
      const sessionId = takeFlag("--session");
      const term = await api<{ terminalId: string; pid: number; cwd: string; shell: string }>(
        "/api/terminal/pty",
        {
          method: "POST",
          body: JSON.stringify({ cwd: cwd ? resolve(cwd) : process.cwd(), sessionId }),
        },
      );
      console.log(green(`  Created terminal ${cyan(term.terminalId)}`));
      console.log(`  ${dim("pid:")}   ${term.pid}`);
      console.log(`  ${dim("shell:")} ${term.shell}`);
      console.log(`  ${dim("cwd:")}   ${term.cwd}`);
      console.log(dim(`  Input goes over the main WebSocket (terminal_input) — see the navi-cli skill.`));
      return;
    }
    if (sub === "ls" || sub === "list") {
      const list = await api<{ terminalId: string; pid: number; cwd: string; sessionId?: string }[]>(
        "/api/terminal/pty",
      );
      if (list.length === 0) {
        console.log(dim("  No PTY terminals running."));
        return;
      }
      for (const t of list) {
        const session = t.sessionId ? `  ${dim(`session ${shortId(t.sessionId)}`)}` : "";
        console.log(`  ${cyan(t.terminalId)}  ${yellow(String(t.pid))}  ${dim(t.cwd)}${session}`);
      }
      return;
    }
    if (sub === "kill") {
      if (!rest[1]) die("Usage: navi term kill <terminalId>");
      await api(`/api/terminal/pty/${rest[1]}`, { method: "DELETE" });
      console.log(green(`  Killed terminal ${rest[1]}`));
      return;
    }
    die(`Unknown subcommand: navi term ${sub}. Try: new, ls, kill`);
  }
}

const portIndex = args.indexOf("--port");
const requestedBackendPort = portIndex !== -1 ? args[portIndex + 1] : "3021";
const backendPort = requestedBackendPort;
const frontendPort = "1420";
const ptyPort = String(parseInt(requestedBackendPort, 10) + 1);

// Colors
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ── Preflight checks ──────────────────────────────────────────
function checkDeps() {
  const bunCheck = Bun.spawnSync([PREFERRED_BUN_BIN, "--version"], { stdout: "ignore", stderr: "ignore" });
  if (bunCheck.exitCode !== 0) {
    console.error("  Bun is required. Install it: curl -fsSL https://bun.sh/install | bash");
    process.exit(1);
  }

  const nodeCheck = Bun.spawnSync(["node", "--version"], { stdout: "ignore", stderr: "ignore" });
  if (nodeCheck.exitCode !== 0) {
    console.error("  Node.js is required for the terminal server.");
    console.error("  Install it: https://nodejs.org");
    process.exit(1);
  }
}

// ── Install deps if needed ────────────────────────────────────
async function ensureDeps() {
  const nodeModules = resolve(ROOT, "node_modules");
  if (!existsSync(nodeModules)) {
    log(dim("Installing dependencies..."));
    const result = Bun.spawnSync([PREFERRED_BUN_BIN, "install"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      console.error("  Failed to install dependencies");
      console.error(result.stderr.toString());
      process.exit(1);
    }
    log(green("Dependencies installed."));
  }
}

// ── Start servers ─────────────────────────────────────────────
const children: Subprocess[] = [];

function startServer(
  name: string,
  cmd: string[],
  env: Record<string, string> = {},
  options: Partial<SpawnOptions.OptionsObject> = {},
): Subprocess {
  const proc = spawn(cmd, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "ignore",
    stderr: "inherit",
    stdin: "ignore",
    ...options,
  });
  children.push(proc);
  return proc;
}

async function waitForUrl(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      return res.ok;
    } catch {
      await Bun.sleep(300);
    }
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(cyan(NAVI));

  checkDeps();
  await ensureDeps();

  log(dim("Starting Navi..."));
  log("");

  // Start backend
  log(`${dim("Backend")}    → ${cyan(`http://localhost:${backendPort}`)}`);
  startServer("backend", [PREFERRED_BUN_BIN, "run", "server/index.ts"], {
    PORT: backendPort,
  });

  // Start PTY server
  log(`${dim("Terminal")}   → ${cyan(`http://localhost:${ptyPort}`)}`);
  startServer("pty", ["node", "server/pty-server.cjs"], {
    PTY_PORT: ptyPort,
  });

  // Start frontend with Vite so runtime port overrides work without a rebuild.
  log(`${dim("Frontend")}  → ${cyan(`http://localhost:${frontendPort}`)}`);
  startServer(
    "frontend",
    [PREFERRED_BUN_BIN, "run", "dev", "--", "--host", "127.0.0.1", "--port", frontendPort, "--strictPort"],
    {
      PORT: frontendPort,
      VITE_NAVI_SERVER_PORT: backendPort,
      VITE_NAVI_PTY_PORT: ptyPort,
    },
  );

  // Wait for services to be ready
  log("");
  log(dim("Waiting for servers..."));

  const [backendReady, ptyReady, frontendReady] = await Promise.all([
    waitForUrl(`http://localhost:${backendPort}/health`),
    waitForUrl(`http://localhost:${ptyPort}/health`),
    waitForUrl(`http://localhost:${frontendPort}`),
  ]);

  if (!backendReady) {
    log(yellow("Backend took a while to start — it might still be loading."));
  }
  if (!ptyReady) {
    log(yellow("Terminal server took a while to start — terminal features may lag briefly."));
  }
  if (!frontendReady) {
    log(yellow("Frontend did not become ready in time."));
  }

  log("");
  log(bold(green("Navi is running!")));
  log("");
  log(`  ${bold("Open in browser:")}  ${cyan(`http://localhost:${frontendPort}`)}`);
  log("");
  log(dim("  Press Ctrl+C to stop all servers."));
  log("");

  // Handle graceful shutdown
  let isCleaningUp = false;
  const cleanup = (exitCode = 0) => {
    if (isCleaningUp) {
      return;
    }
    isCleaningUp = true;
    log(dim("\nShutting down Navi..."));
    for (const child of children) {
      try {
        child.kill();
      } catch {}
    }
    process.exit(exitCode);
  };

  process.on("SIGINT", () => cleanup(0));
  process.on("SIGTERM", () => cleanup(0));

  const exited = await Promise.race(
    children.map(async (child) => ({
      child,
      exitCode: await child.exited,
    })),
  );

  if (!isCleaningUp) {
    const exitCode = exited.exitCode ?? 1;
    log(yellow(`A Navi process exited unexpectedly with code ${exitCode}.`));
    cleanup(exitCode);
  }
}

main().catch((err) => {
  console.error("Failed to start Navi:", err);
  process.exit(1);
});
