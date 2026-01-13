/**
 * Runtime Detector
 *
 * Detects available container runtimes (Colima, Docker, OrbStack)
 * and provides utilities to ensure they're running.
 */
import { exec } from "child_process";
import { promisify } from "util";

import type { ContainerRuntime, RuntimeInfo } from "./types";

const execAsync = promisify(exec);

/**
 * Execute a command and return stdout, or null on error
 */
async function tryExec(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Check if OrbStack is installed and running
 */
async function checkOrbStack(): Promise<RuntimeInfo | null> {
  const version = await tryExec("orb version 2>/dev/null");
  if (!version) return null;

  // Check if running by listing machines
  const running = await tryExec("orb list 2>/dev/null");
  return {
    runtime: "orbstack",
    version,
    running: running !== null,
  };
}

/**
 * Check if Colima is installed and running
 */
async function checkColima(): Promise<RuntimeInfo | null> {
  const version = await tryExec("colima version 2>/dev/null");
  if (!version) return null;

  // Parse version string
  const versionMatch = version.match(/colima version ([\d.]+)/);
  const parsedVersion = versionMatch ? versionMatch[1] : version;

  // Check status
  const status = await tryExec("colima status 2>/dev/null");
  const running = status?.includes("Running") ?? false;

  return {
    runtime: "colima",
    version: parsedVersion,
    running,
  };
}

/**
 * Check if Docker is installed and running
 */
async function checkDocker(): Promise<RuntimeInfo | null> {
  const version = await tryExec("docker --version 2>/dev/null");
  if (!version) return null;

  // Check if daemon is running
  const running = await tryExec("docker ps 2>/dev/null");

  return {
    runtime: "docker",
    version,
    running: running !== null,
  };
}

/**
 * Detect available container runtime
 * Priority: OrbStack > Colima > Docker Desktop
 */
export async function detectRuntime(): Promise<RuntimeInfo> {
  // Check in order of preference
  const orbstack = await checkOrbStack();
  if (orbstack) {
    return orbstack;
  }

  const colima = await checkColima();
  if (colima) {
    return colima;
  }

  const docker = await checkDocker();
  if (docker) {
    return docker;
  }

  return { runtime: "none", running: false };
}

/**
 * Start Colima with recommended settings for preview
 */
export async function startColima(): Promise<boolean> {
  try {
    await execAsync("colima start --cpu 4 --memory 4 --disk 60", {
      timeout: 120000, // 2 minutes timeout for startup
    });
    return true;
  } catch (error: any) {
    console.error("[Preview] Failed to start Colima:", error.message);
    return false;
  }
}

/**
 * Ensure the detected runtime is running
 * For Colima, will attempt to start it automatically
 */
export async function ensureRuntimeRunning(runtime: RuntimeInfo): Promise<RuntimeInfo> {
  if (runtime.running) {
    return runtime;
  }

  if (runtime.runtime === "colima") {
    const started = await startColima();
    if (started) {
      return { ...runtime, running: true };
    }
    throw new Error("Failed to start Colima. Please run: colima start");
  }

  if (runtime.runtime === "docker") {
    throw new Error(
      "Docker is installed but not running.\n" +
        "Please start Docker Desktop or run: open -a Docker"
    );
  }

  if (runtime.runtime === "orbstack") {
    throw new Error(
      "OrbStack is installed but not running.\n" +
        "Please start OrbStack or run: open -a OrbStack"
    );
  }

  throw new Error(
    "No container runtime found.\n\n" +
      "Install Colima (recommended, free):\n" +
      "  brew install colima docker\n" +
      "  colima start --cpu 4 --memory 4 --disk 60\n\n" +
      "Or install Docker Desktop or OrbStack."
  );
}

/**
 * Get installation instructions for container runtime
 */
export function getInstallInstructions(): string {
  return `
To enable containerized previews, install Colima (recommended):

  brew install colima docker
  colima start --cpu 4 --memory 4 --disk 60

Colima is free and lightweight (~400MB RAM when idle).

Alternatives:
- Docker Desktop: https://docker.com/products/docker-desktop
- OrbStack ($8/mo): https://orbstack.dev
`.trim();
}
