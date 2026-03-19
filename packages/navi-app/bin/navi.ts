#!/usr/bin/env bun
/**
 * Navi CLI — start Navi on localhost
 *
 * Usage:
 *   bun run start
 *   navi
 *   navi --port 3001
 */

import { spawn, type SpawnOptions, type Subprocess } from "bun";
import { existsSync } from "fs";
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

// Parse args
const args = process.argv.slice(2);
const command = args[0];

// ── navi update ──────────────────────────────────────────────
if (command === "update") {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  console.log(dim("\n  Updating Navi...\n"));

  // Check if this is a git repo (installed via install-cli.sh)
  const isGitRepo = existsSync(resolve(ROOT, ".git")) || existsSync(resolve(ROOT, "..", ".git"));
  const gitRoot = existsSync(resolve(ROOT, ".git")) ? ROOT : resolve(ROOT, "..");

  if (!isGitRepo) {
    console.log(yellow("  Not a git-based install. Re-run the install script:"));
    console.log(cyan("  curl -fsSL https://raw.githubusercontent.com/brunoqgalvao/navi/main/scripts/install-cli.sh | bash\n"));
    process.exit(0);
  }

  // Fetch + pull
  const fetch = Bun.spawnSync(["git", "fetch", "origin", "main"], { cwd: gitRoot, stdout: "pipe", stderr: "pipe" });
  if (fetch.exitCode !== 0) {
    console.error("  Failed to fetch from origin:", fetch.stderr.toString());
    process.exit(1);
  }

  // Check if there are updates
  const localHash = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: gitRoot, stdout: "pipe" }).stdout.toString().trim();
  const remoteHash = Bun.spawnSync(["git", "rev-parse", "origin/main"], { cwd: gitRoot, stdout: "pipe" }).stdout.toString().trim();

  if (localHash === remoteHash) {
    console.log(green("  Already up to date!\n"));
    process.exit(0);
  }

  // Show what's new
  const logResult = Bun.spawnSync(["git", "log", "--oneline", `${localHash}..${remoteHash}`], { cwd: gitRoot, stdout: "pipe" });
  const newCommits = logResult.stdout.toString().trim().split("\n").filter(Boolean);
  console.log(dim(`  ${newCommits.length} new commit${newCommits.length === 1 ? "" : "s"}:`));
  for (const line of newCommits.slice(0, 10)) {
    console.log(`    ${dim(line)}`);
  }
  if (newCommits.length > 10) console.log(dim(`    ... and ${newCommits.length - 10} more`));
  console.log("");

  // Pull
  const pull = Bun.spawnSync(["git", "reset", "--hard", "origin/main"], { cwd: gitRoot, stdout: "pipe", stderr: "pipe" });
  if (pull.exitCode !== 0) {
    console.error("  Failed to update:", pull.stderr.toString());
    process.exit(1);
  }

  // Reinstall deps
  console.log(dim("  Installing dependencies..."));
  const install = Bun.spawnSync(["bun", "install"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (install.exitCode !== 0) {
    console.error("  Failed to install dependencies:", install.stderr.toString());
    process.exit(1);
  }

  // Read new version
  try {
    const pkg = await Bun.file(resolve(ROOT, "package.json")).json();
    console.log(green(`  Updated to Navi v${pkg.version}!\n`));
  } catch {
    console.log(green("  Updated successfully!\n"));
  }

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

const portIndex = args.indexOf("--port");
const requestedBackendPort = portIndex !== -1 ? args[portIndex + 1] : "3001";
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
  const bunCheck = Bun.spawnSync(["bun", "--version"], { stdout: "ignore", stderr: "ignore" });
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
    const result = Bun.spawnSync(["bun", "install"], {
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
  startServer("backend", ["bun", "run", "server/index.ts"], {
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
    ["bun", "run", "dev", "--", "--host", "127.0.0.1", "--port", frontendPort, "--strictPort"],
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
