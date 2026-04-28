#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const EXECUTABLE_NAMES = process.platform === "win32" ? ["bun.exe", "bun"] : ["bun"];

function expandHome(value) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function normalizeCandidate(candidate) {
  if (!candidate) return null;
  const expanded = expandHome(candidate);
  if (!existsSync(expanded)) return null;
  try {
    return realpathSync(expanded);
  } catch {
    return expanded;
  }
}

function getVersion(candidate) {
  try {
    return execFileSync(candidate, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function parseVersion(version) {
  return version
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function collectPathCandidates() {
  const pathEnv = process.env.PATH || process.env.Path || process.env.path || "";
  return pathEnv
    .split(delimiter)
    .filter(Boolean)
    .flatMap((dir) => EXECUTABLE_NAMES.map((name) => join(dir, name)));
}

function resolveBunExecutable() {
  const explicitCandidates = [
    process.env.NAVI_BUN_PATH,
    process.env.BUN_PATH,
    process.env.BUN_EXECUTABLE,
  ]
    .map((value) => normalizeCandidate(value))
    .filter(Boolean);

  if (explicitCandidates.length > 0) {
    return { path: explicitCandidates[0], version: getVersion(explicitCandidates[0]) };
  }

  const seen = new Set();
  const discovered = [
    ...collectPathCandidates(),
    ...[
      join(homedir(), ".bun", "bin", EXECUTABLE_NAMES[0]),
      join(homedir(), ".local", "bin", EXECUTABLE_NAMES[0]),
      join(homedir(), "bin", EXECUTABLE_NAMES[0]),
      process.platform === "win32" ? null : "/opt/homebrew/bin/bun",
      process.platform === "win32" ? null : "/usr/local/bin/bun",
    ],
  ]
    .map((value) => normalizeCandidate(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map((candidate) => ({
      path: candidate,
      version: getVersion(candidate),
    }));

  const withVersions = discovered.filter((candidate) => candidate.version);
  if (withVersions.length > 0) {
    withVersions.sort((left, right) => compareVersions(right.version, left.version));
    return withVersions[0];
  }

  if (discovered.length > 0) {
    return discovered[0];
  }

  return { path: "bun", version: null };
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: run-with-bun.mjs <bun-args...>");
  process.exit(1);
}

const bun = resolveBunExecutable();
const env = {
  ...process.env,
  NAVI_BUN_PATH: bun.path,
  BUN_PATH: bun.path,
  BUN_EXECUTABLE: bun.path,
};

if (bun.version) {
  console.error(`[run-with-bun] Using ${bun.path} (${bun.version})`);
} else {
  console.error(`[run-with-bun] Using ${bun.path}`);
}

const child = spawn(bun.path, args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`[run-with-bun] Failed to launch Bun: ${error.message}`);
  process.exit(1);
});
