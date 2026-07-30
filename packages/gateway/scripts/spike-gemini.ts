/**
 * spike-gemini.ts — Raw ACP spike against `gemini --experimental-acp`
 *
 * Purpose: establish ground truth about Gemini CLI 0.24.4 ACP behavior before
 * writing the adapter. Dumps all JSON-RPC traffic raw.
 *
 * Usage:
 *   NAVI_GATEWAY_DEBUG=1 bun run packages/gateway/scripts/spike-gemini.ts [cwd]
 *
 * Probes:
 *   a) Does session/request_permission arrive as a server-initiated request? → callback or modes-only
 *   b) Do agent_thought_chunk notifications stream? → thinkingStream true/false
 *   c) Session resume: session/load or session/resume? → resume mechanism
 *   d) Usage/token reporting: UsageUpdate shape
 */

import { spawn } from "node:child_process";

const DEBUG = process.env["NAVI_GATEWAY_DEBUG"] === "1";
const CWD = process.argv[2] ?? "/tmp/navi-spike-gemini";

// Ensure directory exists
import { mkdirSync } from "node:fs";
try { mkdirSync(CWD, { recursive: true }); } catch {}

function log(label: string, data: unknown): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${label}] ${JSON.stringify(data, null, 2)}\n`);
}

function logRaw(label: string, line: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${label}] ${line}\n`);
}

// ── Spawn gemini in ACP mode ──────────────────────────────────────────────────

// Pass -m to override any stale default model in settings
const proc = spawn("gemini", ["--experimental-acp", "-m", "gemini-2.5-flash"], {
  cwd: CWD,
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    TERM: "dumb",
  },
});

proc.on("error", (err) => {
  log("PROC_ERROR", { message: err.message });
  process.exit(1);
});

proc.on("close", (code, signal) => {
  log("PROC_CLOSE", { code, signal });
});

// Drain stderr and log it
proc.stderr.on("data", (chunk: Buffer) => {
  const text = chunk.toString("utf-8").trim();
  if (text) logRaw("STDERR", text);
});

// ── Line-buffered stdout parser ───────────────────────────────────────────────

let lineBuffer = "";
const receivedMessages: unknown[] = [];

proc.stdout.on("data", (chunk: Buffer) => {
  lineBuffer += chunk.toString("utf-8");
  let nl: number;
  while ((nl = lineBuffer.indexOf("\n")) !== -1) {
    const line = lineBuffer.slice(0, nl).trim();
    lineBuffer = lineBuffer.slice(nl + 1);
    if (!line) continue;

    logRaw("RECV", line);

    try {
      const msg = JSON.parse(line);
      receivedMessages.push(msg);
      onMessage(msg);
    } catch {
      logRaw("NON_JSON", line);
    }
  }
});

// ── Message handling ──────────────────────────────────────────────────────────

let nextId = 1;
let acpSessionId: string | null = null;
let initDone = false;
let sessionCreated = false;
let promptSent = false;
let permissionRequestSeen = false;
let thoughtChunkSeen = false;
let usageSeen = false;
let resumeAttempted = false;

const pendingRequests = new Map<number | string, { method: string; resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function send(obj: unknown): void {
  const line = JSON.stringify(obj) + "\n";
  logRaw("SEND", line.trim());
  proc.stdin.write(line);
}

function request(method: string, params?: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { method, resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function notify(method: string, params?: unknown): void {
  send({ jsonrpc: "2.0", method, params });
}

async function onMessage(msg: Record<string, unknown>): Promise<void> {
  const hasId = "id" in msg && msg["id"] !== undefined && msg["id"] !== null;
  const hasMethod = typeof msg["method"] === "string";
  const hasResult = "result" in msg;
  const hasError = "error" in msg;

  if (hasId && hasMethod && !hasResult && !hasError) {
    // Server-initiated request
    await handleServerRequest(msg);
  } else if (!hasId && hasMethod) {
    // Notification
    handleNotification(msg);
  } else if (hasId && (hasResult || hasError)) {
    // Response to our request
    const id = msg["id"] as number | string;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    pendingRequests.delete(id);
    if (hasError) {
      const err = msg["error"] as { message?: string; code?: number };
      pending.reject(new Error(`JSON-RPC error ${err.code}: ${err.message}`));
    } else {
      pending.resolve(msg["result"]);
    }
  }
}

async function handleServerRequest(msg: Record<string, unknown>): Promise<void> {
  const method = msg["method"] as string;
  const id = msg["id"] as number | string;
  const params = msg["params"] as Record<string, unknown>;

  log("SERVER_REQUEST", { method, id, params });

  if (method === "session/request_permission" || method === "requestPermission") {
    permissionRequestSeen = true;
    log("PERMISSION_REQUEST_SEEN", { method, params });

    // Try to respond with "allow" (selected outcome with first option)
    const options = (params?.["options"] as Array<{ id?: string; title?: string }>) ?? [];
    log("PERMISSION_OPTIONS", options);

    // Send allow response
    const allowOption = options.find((o) => {
      const t = (o.title ?? o.id ?? "").toLowerCase();
      return t.includes("allow") || t.includes("yes") || t.includes("accept");
    }) ?? options[0];

    const response = {
      outcome: allowOption
        ? { outcome: "selected", optionId: (allowOption as Record<string, string>)["optionId"] ?? (allowOption as Record<string, string>)["id"] }
        : { outcome: "cancelled" },
    };

    log("PERMISSION_RESPONSE", response);
    send({ jsonrpc: "2.0", id, result: response });
    return;
  }

  if (method === "client/createTerminal" || method === "createTerminal") {
    // Gemini may route shell commands through terminals — handle with a stub
    log("CREATE_TERMINAL_REQUEST", params);
    send({
      jsonrpc: "2.0",
      id,
      result: { terminalId: "terminal-stub-1" },
    });
    return;
  }

  if (method === "client/terminalOutput" || method === "terminalOutput") {
    log("TERMINAL_OUTPUT_REQUEST", params);
    send({
      jsonrpc: "2.0",
      id,
      result: { output: "", exitCode: null },
    });
    return;
  }

  if (method === "client/releaseTerminal" || method === "releaseTerminal") {
    log("RELEASE_TERMINAL_REQUEST", params);
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "client/waitForTerminalExit" || method === "waitForTerminalExit") {
    log("WAIT_FOR_TERMINAL_EXIT_REQUEST", params);
    // Simulate immediate exit
    send({ jsonrpc: "2.0", id, result: { exitCode: 0, signal: null } });
    return;
  }

  if (method === "client/killTerminal" || method === "killTerminal") {
    log("KILL_TERMINAL_REQUEST", params);
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "client/writeTextFile" || method === "writeTextFile") {
    log("WRITE_FILE_REQUEST", params);
    // Write the file ourselves
    const path = params?.["path"] as string;
    const content = params?.["content"] as string;
    if (path && content !== undefined) {
      try {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(path, content, "utf-8");
        log("WRITE_FILE_SUCCESS", { path });
      } catch (err) {
        log("WRITE_FILE_ERROR", { path, error: String(err) });
      }
    }
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "client/readTextFile" || method === "readTextFile") {
    log("READ_FILE_REQUEST", params);
    const path = params?.["path"] as string;
    let content = "";
    try {
      const { readFileSync } = await import("node:fs");
      content = readFileSync(path, "utf-8");
    } catch {
      content = "";
    }
    send({ jsonrpc: "2.0", id, result: { content } });
    return;
  }

  // Unknown — log and send method not found
  log("UNKNOWN_SERVER_REQUEST", { method, params });
  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

function handleNotification(msg: Record<string, unknown>): void {
  const method = msg["method"] as string;
  const params = msg["params"] as Record<string, unknown>;

  log("NOTIFICATION", { method, params });

  if (method === "session/update" || method === "sessionUpdate") {
    const update = (params?.["update"] as Record<string, unknown>) ?? params;
    const sessionUpdate = update?.["sessionUpdate"] as string;

    log("SESSION_UPDATE_TYPE", { sessionUpdate });

    if (sessionUpdate === "agent_thought_chunk") {
      thoughtChunkSeen = true;
      log("THOUGHT_CHUNK_SEEN", update);
    }

    if (sessionUpdate === "usage_update") {
      usageSeen = true;
      log("USAGE_UPDATE_SEEN", update);
    }

    if (sessionUpdate === "tool_call") {
      log("TOOL_CALL_SEEN", update);
    }

    if (sessionUpdate === "tool_call_update") {
      log("TOOL_CALL_UPDATE_SEEN", update);
    }
  }
}

// ── Main spike flow ───────────────────────────────────────────────────────────

async function spike(): Promise<void> {
  log("SPIKE_START", { cwd: CWD, geminiVersion: "0.24.4" });

  // 1. Initialize — protocolVersion is required (number, 1 = current)
  log("STEP", "initialize");
  let initResult: unknown;
  try {
    initResult = await request("initialize", {
      protocolVersion: 1,
      clientInfo: {
        name: "navi-gateway-spike",
        version: "0.1.0",
      },
      clientCapabilities: {
        // Advertise terminal + fs so Gemini can route through us
        // (terminal needed for shell commands)
      },
    });
    log("INIT_RESULT", initResult);
    initDone = true;
  } catch (err) {
    log("INIT_ERROR", { message: String(err) });
    proc.kill("SIGTERM");
    return;
  }

  // 2. Create session — mcpServers is required (may be empty array)
  log("STEP", "session/new");
  let sessionResult: unknown;
  try {
    sessionResult = await request("session/new", {
      cwd: CWD,
      mcpServers: [],
    });
    log("SESSION_NEW_RESULT", sessionResult);

    const sr = sessionResult as { sessionId?: string; id?: string };
    acpSessionId = sr.sessionId ?? sr.id ?? null;
    log("SESSION_ID", { acpSessionId });
    sessionCreated = true;
  } catch (err) {
    log("SESSION_NEW_ERROR", { message: String(err) });
    proc.kill("SIGTERM");
    return;
  }

  if (!acpSessionId) {
    log("NO_SESSION_ID", "cannot continue");
    proc.kill("SIGTERM");
    return;
  }

  // 3. Send prompt — simple question, no tool invocation, to observe streaming shape
  log("STEP", "session/prompt (simple)");
  let promptResult: unknown;
  try {
    promptResult = await Promise.race([
      request("session/prompt", {
        sessionId: acpSessionId,
        // ContentBlock = TextContent & { type: "text" }
        prompt: [{ type: "text", text: "Say hello and tell me what 2+2 equals. Keep your response very short." }],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("prompt timeout 60s")), 60_000)),
    ]);
    log("PROMPT_RESULT", promptResult);
    promptSent = true;
  } catch (err) {
    log("PROMPT_ERROR", { message: String(err) });
  }

  // 3b. Send file-creation prompt to probe tool calls + permissions
  if (promptSent && acpSessionId) {
    log("STEP", "session/prompt (tool-invoking)");
    try {
      const toolResult = await Promise.race([
        request("session/prompt", {
          sessionId: acpSessionId,
          prompt: [{ type: "text", text: `Create a file named hello.txt in ${CWD} containing exactly: hello` }],
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("tool prompt timeout 60s")), 60_000)),
      ]);
      log("TOOL_PROMPT_RESULT", toolResult);
    } catch (err) {
      log("TOOL_PROMPT_ERROR", { message: String(err) });
    }
  }

  // 4. Attempt session/load (resume) — check capability
  log("STEP", "session/load or session/resume");
  if (acpSessionId) {
    try {
      const loadResult = await request("session/load", {
        sessionId: acpSessionId,
        mcpServers: [],
      });
      log("SESSION_LOAD_RESULT", loadResult);
      resumeAttempted = true;
    } catch (err) {
      log("SESSION_LOAD_ERROR", { message: String(err) });
      // Try session/resume instead
      try {
        const resumeResult = await request("session/resume", {
          sessionId: acpSessionId,
          mcpServers: [],
        });
        log("SESSION_RESUME_RESULT", resumeResult);
        resumeAttempted = true;
      } catch (err2) {
        log("SESSION_RESUME_ERROR", { message: String(err2) });
      }
    }
  }

  // 5. Summary
  log("SPIKE_SUMMARY", {
    initDone,
    sessionCreated,
    acpSessionId,
    promptSent,
    permissionRequestSeen,
    thoughtChunkSeen,
    usageSeen,
    resumeAttempted,
    totalMessages: receivedMessages.length,
  });

  // Findings
  log("FINDINGS_A_PERMISSIONS", permissionRequestSeen
    ? "session/request_permission arrived as server-initiated request → callback tier"
    : "No permission request observed → modes-only tier (or no tools invoked)"
  );
  log("FINDINGS_B_THINKING", thoughtChunkSeen
    ? "agent_thought_chunk notifications observed → thinkingStream: true"
    : "No agent_thought_chunk observed → thinkingStream: false (or not enabled)"
  );
  log("FINDINGS_D_USAGE", usageSeen
    ? "usage_update notification observed → emit usage events"
    : "No usage_update observed → omit usage events"
  );

  proc.kill("SIGTERM");
}

// Run
spike().catch((err) => {
  log("FATAL", { message: String(err) });
  proc.kill("SIGTERM");
  process.exit(1);
});
