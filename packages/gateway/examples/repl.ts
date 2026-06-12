#!/usr/bin/env bun
/**
 * repl.ts — terminal REPL for the navi agent gateway (Claude backend)
 *
 * Usage:
 *   bun run examples/repl.ts [options]
 *
 * Options:
 *   --backend <id>      Backend to use (default: claude)
 *   --resume <id>       Resume a prior backend session by ID
 *   --cwd <dir>         Working directory (default: process.cwd())
 *   --model <model>     Model to use
 *   --script <file>     Non-interactive script mode: newline-separated prompts
 *
 * Script mode:
 *   Reads prompts line by line from <file>. Auto-approves all permission
 *   requests (via respondToPermission, not by setting acceptAll — this proves
 *   the callback wiring). Exits non-zero on any error event.
 *
 * Interactive mode:
 *   Readline prompt loop. Streams events inline. Permission requests ask y/n/s.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { ClaudeBackend, ClaudeSession } from "../src/adapters/claude.js";
import type { GatewayEvent } from "../src/events.js";
import type { SessionOptions } from "../src/types.js";

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags: Record<string, string | null> = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = null;
    }
  }
}

const backendId = flags.backend ?? "claude";
const resumeId = flags.resume ?? undefined;
const cwdOpt = flags.cwd ?? process.cwd();
const modelOpt = flags.model ?? undefined;
const scriptFile = flags.script ?? undefined;

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const isTty = process.stdout.isTTY;

function dim(s: string): string {
  return isTty ? `\x1b[2m${s}\x1b[0m` : s;
}
function yellow(s: string): string {
  return isTty ? `\x1b[33m${s}\x1b[0m` : s;
}
function red(s: string): string {
  return isTty ? `\x1b[31m${s}\x1b[0m` : s;
}
function cyan(s: string): string {
  return isTty ? `\x1b[36m${s}\x1b[0m` : s;
}
function green(s: string): string {
  return isTty ? `\x1b[32m${s}\x1b[0m` : s;
}

// ── Session setup ─────────────────────────────────────────────────────────────

if (backendId !== "claude") {
  console.error(red(`[repl] Backend '${backendId}' not supported yet. Only 'claude' is available.`));
  process.exit(1);
}

const backend = new ClaudeBackend();

const sessionOpts: SessionOptions = {
  cwd: path.resolve(cwdOpt),
  model: modelOpt,
  // Script mode uses "prompt" + auto-approve via respondToPermission (not acceptAll)
  // This proves the callback wiring is live.
  permissionMode: "prompt",
};

const session = resumeId
  ? (backend.resumeSession(resumeId, sessionOpts) as ClaudeSession)
  : (backend.createSession(sessionOpts) as ClaudeSession);

// ── Script mode ───────────────────────────────────────────────────────────────

async function runScript(filePath: string): Promise<void> {
  const src = filePath === "/dev/stdin" ? await readStdin() : fs.readFileSync(filePath, "utf-8");
  const prompts = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let exitCode = 0;

  for (const prompt of prompts) {
    process.stderr.write(dim(`[script] > ${prompt}\n`));
    let hasError = false;

    for await (const evt of session.send({ text: prompt })) {
      handleEvent(evt, {
        scriptMode: true,
        onError: () => {
          hasError = true;
          exitCode = 1;
        },
        onPermissionRequest: (requestId) => {
          // Auto-approve all permissions in script mode via the callback path
          session.respondToPermission(requestId, "allow");
        },
      });
    }
  }

  process.exit(exitCode);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ── Interactive mode ──────────────────────────────────────────────────────────

async function runInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((res) => rl.question(q, res));

  console.log(cyan("[repl] Claude gateway REPL. Type your message, Ctrl+C to exit."));
  if (resumeId) {
    console.log(dim(`[repl] Resuming session: ${resumeId}`));
  }

  while (true) {
    let prompt: string;
    try {
      prompt = await ask(cyan("> "));
    } catch {
      break;
    }
    if (!prompt.trim()) continue;
    if (prompt.trim() === "/exit" || prompt.trim() === "/quit") break;

    process.stdout.write("\n");

    for await (const evt of session.send({ text: prompt })) {
      await handleEventInteractive(evt, session, ask, rl);
    }

    process.stdout.write("\n");
  }

  rl.close();
  process.exit(0);
}

// ── Event handler ─────────────────────────────────────────────────────────────

type HandlerOptions = {
  scriptMode: boolean;
  onError?: () => void;
  onPermissionRequest?: (requestId: string) => void;
};

function handleEvent(evt: GatewayEvent, opts: HandlerOptions): void {
  switch (evt.type) {
    case "session-meta":
      if (evt.backendSessionId) {
        process.stderr.write(
          green(`[session] backendSessionId=${evt.backendSessionId} model=${evt.model ?? "?"}\n`)
        );
      }
      break;

    case "text-delta":
      if (opts.scriptMode) {
        process.stdout.write(evt.text);
      } else {
        process.stdout.write(evt.text);
      }
      break;

    case "thinking-delta":
      if (opts.scriptMode) {
        process.stderr.write(dim(`[thinking] ${evt.text}\n`));
      } else {
        process.stdout.write(dim(`[thinking] ${evt.text}`));
      }
      break;

    case "tool-start":
      if (opts.scriptMode) {
        process.stderr.write(dim(`[tool: ${evt.tool}]\n`));
      } else {
        process.stdout.write(`\n${yellow(`[tool: ${evt.tool}]`)}\n`);
      }
      break;

    case "tool-end":
      if (evt.isError) {
        if (opts.scriptMode) {
          process.stderr.write(red(`[tool-error: ${evt.toolId}]\n`));
        } else {
          process.stdout.write(red(`[tool-error: ${evt.toolId}]\n`));
        }
      }
      break;

    case "permission-request":
      if (opts.scriptMode && opts.onPermissionRequest) {
        opts.onPermissionRequest(evt.requestId);
      }
      break;

    case "usage": {
      const u = evt.usage;
      const cost = u.costUsd !== undefined ? ` cost=$${u.costUsd.toFixed(5)}` : "";
      const cacheR = u.cacheReadTokens !== undefined ? ` cacheRead=${u.cacheReadTokens}` : "";
      const msg = `[usage] in=${u.inputTokens} out=${u.outputTokens}${cacheR}${cost} model=${u.model}`;
      if (opts.scriptMode) {
        process.stderr.write(dim(msg + "\n"));
      } else {
        process.stdout.write("\n" + dim(msg) + "\n");
      }
      break;
    }

    case "error":
      process.stderr.write(red(`[error] ${evt.message}\n`));
      opts.onError?.();
      break;

    case "done":
      if (opts.scriptMode) {
        process.stdout.write("\n");
      }
      break;

    case "tool-output":
    case "agent-spawned":
      // not used by claude backend currently
      break;
  }
}

async function handleEventInteractive(
  evt: GatewayEvent,
  sess: ClaudeSession,
  ask: (q: string) => Promise<string>,
  rl: readline.Interface
): Promise<void> {
  if (evt.type === "permission-request") {
    process.stdout.write("\n");
    process.stdout.write(yellow(`[permission] ${evt.description}\n`));
    process.stdout.write(yellow(`  tool: ${evt.tool}  input: ${JSON.stringify(evt.input)}\n`));
    const answer = await ask(yellow("  approve? y/n/s(ession) > "));
    const a = answer.trim().toLowerCase();
    if (a === "y" || a === "yes") {
      sess.respondToPermission(evt.requestId, "allow");
    } else if (a === "s" || a === "session") {
      sess.respondToPermission(evt.requestId, "allow-session");
    } else {
      sess.respondToPermission(evt.requestId, "deny");
    }
    return;
  }

  handleEvent(evt, {
    scriptMode: false,
    onError: () => {
      // error already printed by handleEvent
    },
    onPermissionRequest: () => {
      // handled above
    },
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (scriptFile) {
  runScript(scriptFile).catch((err) => {
    console.error(red(`[repl] Fatal: ${err?.message ?? err}`));
    process.exit(1);
  });
} else {
  runInteractive().catch((err) => {
    console.error(red(`[repl] Fatal: ${err?.message ?? err}`));
    process.exit(1);
  });
}
