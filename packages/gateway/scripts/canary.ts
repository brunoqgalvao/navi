#!/usr/bin/env bun
/**
 * canary.ts — live integration smoke-test for all installed backends.
 *
 * Runs a one-prompt mini-session per backend (file creation task).
 * Asserts:
 *   - ≥1 text-delta event
 *   - done{reason:"complete"} event
 *   - usage event (claude and codex only; gemini skips — reports no usage)
 *
 * Backends not installed are SKIP, not FAIL.
 * Exits 1 if any installed backend fails.
 *
 * Usage:
 *   bun run packages/gateway/scripts/canary.ts
 */

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { createDefaultRegistry } from "../src/default-registry.js";
import type { GatewayEvent } from "../src/events.js";
import type { AgentSession } from "../src/types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const PROMPT = "Create a file called canary-test.txt containing exactly: canary";
const TIMEOUT_MS = 180_000;

/** Backends that report usage events. Gemini does not. */
const REPORTS_USAGE = new Set(["claude", "codex"]);

// ── ANSI ──────────────────────────────────────────────────────────────────────

const isTty = process.stdout.isTTY;
function green(s: string): string { return isTty ? `\x1b[32m${s}\x1b[0m` : s; }
function red(s: string): string   { return isTty ? `\x1b[31m${s}\x1b[0m` : s; }
function yellow(s: string): string { return isTty ? `\x1b[33m${s}\x1b[0m` : s; }
function dim(s: string): string   { return isTty ? `\x1b[2m${s}\x1b[0m` : s; }
function bold(s: string): string  { return isTty ? `\x1b[1m${s}\x1b[0m` : s; }

// ── Types ─────────────────────────────────────────────────────────────────────

type BackendResult =
  | { status: "pass"; durationMs: number }
  | { status: "fail"; reason: string; durationMs: number }
  | { status: "skip"; reason: string };

// ── Main ──────────────────────────────────────────────────────────────────────

async function runCanary(backendId: string, session: AgentSession): Promise<void> {
  const events: GatewayEvent[] = [];

  await Promise.race([
    (async () => {
      for await (const evt of session.send({ text: PROMPT })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          session.respondToPermission(evt.requestId, "allow");
        }
      }
    })(),
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error(`timeout after ${TIMEOUT_MS / 1000}s`)),
        TIMEOUT_MS
      )
    ),
  ]);

  // Assertions
  const textDeltas = events.filter((e) => e.type === "text-delta");
  if (textDeltas.length === 0) {
    throw new Error("no text-delta events received");
  }

  const doneEvt = events.find((e) => e.type === "done");
  if (!doneEvt) {
    throw new Error("no done event received");
  }
  if (doneEvt.type === "done" && doneEvt.reason !== "complete") {
    throw new Error(`done event reason was "${doneEvt.reason}" (expected "complete")`);
  }

  if (REPORTS_USAGE.has(backendId)) {
    const usageEvt = events.find((e) => e.type === "usage");
    if (!usageEvt) {
      throw new Error(`no usage event received (${backendId} is expected to report usage)`);
    }
  }

  // Check for fatal errors
  const errorEvts = events.filter((e) => e.type === "error" && (e as { fatal?: boolean }).fatal);
  if (errorEvts.length > 0) {
    const firstErr = errorEvts[0] as { message: string };
    throw new Error(`fatal error: ${firstErr.message}`);
  }
}

async function runBackend(backendId: string): Promise<BackendResult> {
  const registry = createDefaultRegistry();

  // Check if installed
  const detected = await registry.detectInstalled();
  const det = detected.get(backendId as "claude" | "codex" | "gemini");

  if (!det) {
    return { status: "skip", reason: "not in registry" };
  }
  if (!det.installed) {
    return { status: "skip", reason: det.fixHint ?? "not installed" };
  }
  if (!det.authed) {
    return { status: "skip", reason: "installed but not authenticated" };
  }

  const cwd = join(tmpdir(), `navi-canary-${randomUUID()}`);
  mkdirSync(cwd, { recursive: true });

  const startMs = Date.now();
  try {
    const backend = registry.get(backendId as "claude" | "codex" | "gemini");
    const session = backend.createSession({
      cwd,
      permissionMode: "prompt",
    });

    await runCanary(backendId, session);
    const durationMs = Date.now() - startMs;
    return { status: "pass", durationMs };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const reason = err instanceof Error ? err.message : String(err);
    return { status: "fail", reason, durationMs };
  } finally {
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const backends = ["claude", "codex", "gemini"] as const;
const results = new Map<string, BackendResult>();

process.stdout.write(bold("\n=== Navi Gateway Canary ===\n\n"));

for (const backendId of backends) {
  process.stdout.write(`  ${dim("running")} ${backendId}...`);
  const result = await runBackend(backendId);
  results.set(backendId, result);

  if (result.status === "pass") {
    process.stdout.write(
      `\r  ${green("PASS")}    ${backendId} ${dim(`(${(result.durationMs / 1000).toFixed(1)}s)`)}\n`
    );
  } else if (result.status === "fail") {
    process.stdout.write(
      `\r  ${red("FAIL")}    ${backendId} ${dim(`(${(result.durationMs / 1000).toFixed(1)}s)`)} — ${result.reason}\n`
    );
  } else {
    process.stdout.write(
      `\r  ${yellow("SKIP")}    ${backendId} — ${result.reason}\n`
    );
  }
}

// ── Summary table ─────────────────────────────────────────────────────────────

process.stdout.write(bold("\n--- Summary ---\n"));
process.stdout.write(
  `${"Backend".padEnd(10)}${"Status".padEnd(8)}Details\n`
);
process.stdout.write("-".repeat(50) + "\n");

let anyFail = false;
for (const backendId of backends) {
  const r = results.get(backendId)!;
  let statusStr: string;
  let detail = "";

  if (r.status === "pass") {
    statusStr = green("PASS");
    detail = dim(`${(r.durationMs / 1000).toFixed(1)}s`);
  } else if (r.status === "fail") {
    statusStr = red("FAIL");
    detail = r.reason;
    anyFail = true;
  } else {
    statusStr = yellow("SKIP");
    detail = r.reason;
  }

  process.stdout.write(
    `${backendId.padEnd(10)}${statusStr.padEnd(8 + (isTty ? 9 : 0))}${detail}\n`
  );
}

process.stdout.write("\n");

if (anyFail) {
  process.stdout.write(red("CANARY FAILED — see FAIL rows above\n\n"));
  process.exit(1);
} else {
  process.stdout.write(green("All checked backends passed.\n\n"));
}
