#!/usr/bin/env bun
/**
 * record-fixtures.ts — records raw backend payloads to test/fixtures/<backend>/basic.jsonl
 *
 * Usage:
 *   bun run packages/gateway/scripts/record-fixtures.ts [--backend claude|codex|gemini|all]
 *
 * Each fixture file is a newline-delimited JSON file (JSONL):
 *   - Line 1: {"_meta": {"cliVersion": "...", "recordedAt": "<ISO>", "recorder": "..."}}
 *   - Subsequent lines: raw backend payloads (SDKMessages for claude; JSON-RPC lines for codex/gemini)
 *
 * The session runs a single prompt that creates a file, then exits.
 * Permissions are auto-approved via respondToPermission (not acceptAll).
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";

import {
  query as sdkQuery,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { JsonRpcClient } from "../src/adapters/jsonrpc.js";
import { CodexSession } from "../src/adapters/codex.js";
import { GeminiSession } from "../src/adapters/gemini.js";
import type { SessionOptions } from "../src/types.js";
import type { GatewayEvent } from "../src/events.js";

// ── Config ────────────────────────────────────────────────────────────────────

const FIXTURES_ROOT = new URL("../test/fixtures", import.meta.url).pathname;
const RECORDER_PATH = "scripts/record-fixtures.ts";
const PROMPT = "Create a file called fixture-test.txt containing exactly: fixture";
const TIMEOUT_MS = 180_000;

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const backendArg = args.find((a) => a.startsWith("--backend="))?.slice("--backend=".length)
  ?? (args[args.indexOf("--backend") + 1] ?? "all");
const BACKENDS_TO_RECORD: string[] = backendArg === "all"
  ? ["claude", "codex", "gemini"]
  : [backendArg];

// ── Version helpers ───────────────────────────────────────────────────────────

async function getCLIVersion(cmd: string): Promise<string> {
  try {
    const proc = Bun.spawn([cmd, "--version"], { stdout: "pipe", stderr: "pipe" });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text.trim().split("\n")[0] ?? text.trim();
  } catch {
    return "unknown";
  }
}

// ── Temp dir management ───────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `navi-fixture-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Fixture writer ────────────────────────────────────────────────────────────

function writeFixtureFile(backend: string, lines: unknown[]): void {
  const dir = join(FIXTURES_ROOT, backend);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, "basic.jsonl");
  const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  writeFileSync(outPath, content, "utf-8");
  process.stderr.write(`[record] wrote ${lines.length} lines to ${outPath}\n`);
}

// ── Claude recorder ───────────────────────────────────────────────────────────

async function recordClaude(): Promise<void> {
  process.stderr.write("[record:claude] starting...\n");

  const version = await getCLIVersion("claude");
  const meta = {
    _meta: {
      cliVersion: version,
      recordedAt: new Date().toISOString(),
      recorder: RECORDER_PATH,
      backend: "claude",
    },
  };

  const rawMessages: unknown[] = [];
  const cwd = makeTmpDir();

  try {
    // Wrap the SDK query to intercept SDKMessages
    const recordingQuery: typeof sdkQuery = async function* (params) {
      const gen = sdkQuery(params);
      for await (const msg of gen) {
        rawMessages.push(msg);
        yield msg;
      }
    };

    const session = new (await import("../src/adapters/claude.js")).ClaudeSession(
      randomUUID(),
      {
        cwd,
        permissionMode: "prompt",
      } satisfies SessionOptions,
      undefined,
      recordingQuery
    );

    // Run session with timeout
    await Promise.race([
      runSession(session),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("claude fixture timeout")), TIMEOUT_MS)
      ),
    ]);
  } finally {
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
  }

  const lines: unknown[] = [meta, ...rawMessages];
  writeFixtureFile("claude", lines);
  process.stderr.write(`[record:claude] captured ${rawMessages.length} SDKMessages\n`);
}

// ── Codex recorder ────────────────────────────────────────────────────────────

async function recordCodex(): Promise<void> {
  process.stderr.write("[record:codex] starting...\n");

  const version = await getCLIVersion("codex");
  const meta = {
    _meta: {
      cliVersion: version,
      recordedAt: new Date().toISOString(),
      recorder: RECORDER_PATH,
      backend: "codex",
    },
  };

  const rawLines: unknown[] = [];
  const cwd = makeTmpDir();

  // Recording spawn function that attaches onRaw
  function recordingSpawnAppServer(workDir: string): JsonRpcClient {
    const proc = nodeSpawn("codex", ["app-server", "--config", "service_tier=fast"], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const client = new JsonRpcClient(proc);
    client.onRaw((_direction, line) => {
      try {
        rawLines.push(JSON.parse(line));
      } catch {
        // skip non-JSON lines
      }
    });
    return client;
  }

  try {
    const session = new CodexSession(
      randomUUID(),
      {
        cwd,
        permissionMode: "prompt",
      } satisfies SessionOptions,
      undefined,
      recordingSpawnAppServer
    );

    await Promise.race([
      runSession(session),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("codex fixture timeout")), TIMEOUT_MS)
      ),
    ]);
  } finally {
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
  }

  const lines: unknown[] = [meta, ...rawLines];
  writeFixtureFile("codex", lines);
  process.stderr.write(`[record:codex] captured ${rawLines.length} JSON-RPC lines\n`);
}

// ── Gemini recorder ───────────────────────────────────────────────────────────

async function recordGemini(): Promise<void> {
  process.stderr.write("[record:gemini] starting...\n");

  const version = await getCLIVersion("gemini");
  const meta = {
    _meta: {
      cliVersion: version,
      recordedAt: new Date().toISOString(),
      recorder: RECORDER_PATH,
      backend: "gemini",
    },
  };

  const rawLines: unknown[] = [];
  const cwd = makeTmpDir();

  function recordingSpawnGeminiAcp(workDir: string, model?: string): JsonRpcClient {
    const resolvedModel = model ?? "gemini-2.5-flash";
    const proc = nodeSpawn(
      "gemini",
      ["--experimental-acp", "-m", resolvedModel],
      {
        cwd: workDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      }
    );
    const client = new JsonRpcClient(proc);
    client.onRaw((_direction, line) => {
      try {
        rawLines.push(JSON.parse(line));
      } catch {
        // skip non-JSON lines
      }
    });
    return client;
  }

  try {
    const session = new GeminiSession(
      randomUUID(),
      {
        cwd,
        permissionMode: "prompt",
      } satisfies SessionOptions,
      recordingSpawnGeminiAcp
    );

    await Promise.race([
      runSession(session),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("gemini fixture timeout")), TIMEOUT_MS)
      ),
    ]);
  } finally {
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
  }

  const lines: unknown[] = [meta, ...rawLines];
  writeFixtureFile("gemini", lines);
  process.stderr.write(`[record:gemini] captured ${rawLines.length} JSON-RPC lines\n`);
}

// ── Session runner ────────────────────────────────────────────────────────────

async function runSession(session: { send(input: { text: string }): AsyncIterable<GatewayEvent>; respondToPermission(id: string, decision: "allow" | "allow-session" | "deny"): void }): Promise<void> {
  for await (const evt of session.send({ text: PROMPT })) {
    switch (evt.type) {
      case "permission-request":
        process.stderr.write(`[record] auto-approving permission: ${evt.tool}\n`);
        session.respondToPermission(evt.requestId, "allow");
        break;
      case "error":
        process.stderr.write(`[record] error event: ${evt.message}\n`);
        break;
      case "done":
        process.stderr.write(`[record] done: ${evt.reason}\n`);
        break;
      case "text-delta":
        process.stderr.write(evt.text);
        break;
      default:
        break;
    }
  }
  process.stderr.write("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const errors: string[] = [];

for (const backend of BACKENDS_TO_RECORD) {
  try {
    if (backend === "claude") {
      await recordClaude();
    } else if (backend === "codex") {
      await recordCodex();
    } else if (backend === "gemini") {
      await recordGemini();
    } else {
      process.stderr.write(`[record] unknown backend: ${backend}\n`);
      errors.push(`unknown backend: ${backend}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[record:${backend}] FAILED: ${msg}\n`);
    errors.push(`${backend}: ${msg}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`\n[record] ERRORS:\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
  process.exit(1);
}

process.stderr.write("\n[record] all fixtures recorded successfully\n");
