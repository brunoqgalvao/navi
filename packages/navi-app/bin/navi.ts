#!/usr/bin/env bun
/**
 * Navi CLI — start Navi on localhost
 *
 * Usage:
 *   bun run start
 *   navi
 *   navi --port 3021
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

  // Try to open browser
  try {
    const openCmd =
      process.platform === "darwin"
        ? ["open", `http://localhost:${frontendPort}`]
        : process.platform === "win32"
          ? ["cmd", "/c", "start", `http://localhost:${frontendPort}`]
          : ["xdg-open", `http://localhost:${frontendPort}`];

    spawn(openCmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // silently fail — user can open manually
  }

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
