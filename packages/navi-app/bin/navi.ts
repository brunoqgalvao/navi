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
  const install = Bun.spawnSync(["bun", "install"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
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
