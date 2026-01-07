import { json, corsHeaders } from "../utils/response";
import { spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import WebSocket from "ws";

// Terminal constants
const TERMINAL_MAX_BUFFER_LINES = 500;
const PTY_SERVER_RECONNECT_INTERVAL_MS = 3000;
const PTY_SERVER_CREATION_TIMEOUT_MS = 5000;
const TERMINAL_DEFAULT_COLS = 80;
const TERMINAL_DEFAULT_ROWS = 24;
const DEFAULT_PTY_SERVER_WS_URL = "ws://localhost:3002";
const DEFAULT_PTY_SERVER_HTTP_URL = "http://localhost:3002";

// Stale process timeout (30 minutes of inactivity)
const STALE_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;
// Cleanup interval (check every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Patterns to detect errors in terminal output */
const TERMINAL_ERROR_PATTERNS = [
  /error:/i,
  /ERR!/,
  /failed/i,
  /exception/i,
  /ENOENT/,
  /Cannot find module/,
  /command not found/,
  /permission denied/i,
  /EACCES/,
  /ECONNREFUSED/,
  /TypeError:/,
  /SyntaxError:/,
  /ReferenceError:/,
] as const;

interface TerminalProcess {
  process: ChildProcess;
  cwd: string;
  startedAt: number;
}

interface ProxiedTerminal {
  terminalId: string;
  cwd: string;
  createdAt: number;
  pid: number;
  sessionId?: string;
  attachedClients: Set<any>;
  outputBuffer: string[];
}

const execProcesses = new Map<string, TerminalProcess>();

interface WsExecProcess {
  process: ChildProcess;
  cwd: string;
  startedAt: number;
  lastActivityAt: number;
  ws: any;
}
const wsExecProcesses = new Map<string, WsExecProcess>();

// Track last activity for HTTP SSE exec processes too
interface ExecProcessActivity {
  lastActivityAt: number;
}
const execProcessActivity = new Map<string, ExecProcessActivity>();

const proxiedTerminals = new Map<string, ProxiedTerminal>();

const PTY_SERVER_URL = process.env.PTY_SERVER_URL || DEFAULT_PTY_SERVER_WS_URL;
const PTY_SERVER_HTTP = process.env.PTY_SERVER_HTTP || DEFAULT_PTY_SERVER_HTTP_URL;

let ptyServerWs: WebSocket | null = null;
let ptyServerConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connectToPtyServer() {
  if (ptyServerWs?.readyState === WebSocket.OPEN) return;

  console.log("[Terminal] Connecting to PTY server:", PTY_SERVER_URL);
  ptyServerWs = new WebSocket(PTY_SERVER_URL);

  ptyServerWs.on("open", () => {
    console.log("[Terminal] Connected to PTY server");
    ptyServerConnected = true;
  });

  ptyServerWs.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      handlePtyServerMessage(msg);
    } catch (e) {
      console.warn("[Terminal] Failed to parse PTY server message:", e);
    }
  });

  ptyServerWs.on("close", () => {
    console.log("[Terminal] PTY server connection closed");
    ptyServerConnected = false;
    ptyServerWs = null;
    scheduleReconnect();
  });

  ptyServerWs.on("error", (err) => {
    console.warn("[Terminal] PTY server connection error:", err.message);
    ptyServerConnected = false;
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToPtyServer();
  }, PTY_SERVER_RECONNECT_INTERVAL_MS);
}

function handlePtyServerMessage(msg: any) {
  const { terminalId } = msg;
  const terminal = terminalId ? proxiedTerminals.get(terminalId) : null;

  switch (msg.type) {
    case "output":
      if (terminal) {
        const lines = (msg.data || "").split('\n');
        terminal.outputBuffer.push(...lines);
        while (terminal.outputBuffer.length > TERMINAL_MAX_BUFFER_LINES) {
          terminal.outputBuffer.shift();
        }

        const outMsg = JSON.stringify({
          type: "terminal_output",
          terminalId,
          data: msg.data,
        });
        for (const client of terminal.attachedClients) {
          try {
            client.send(outMsg);
          } catch {
            terminal.attachedClients.delete(client);
          }
        }

        if (TERMINAL_ERROR_PATTERNS.some(p => p.test(msg.data || ""))) {
          const errMsg = JSON.stringify({
            type: "terminal_error_detected",
            terminalId,
            context: terminal.outputBuffer.slice(-30).join('\n'),
          });
          for (const client of terminal.attachedClients) {
            try { client.send(errMsg); } catch {}
          }
        }
      }
      break;

    case "exit":
      if (terminal) {
        const exitMsg = JSON.stringify({
          type: "terminal_exit",
          terminalId,
          exitCode: msg.exitCode,
          signal: msg.signal,
        });
        for (const client of terminal.attachedClients) {
          try { client.send(exitMsg); } catch {}
        }
        proxiedTerminals.delete(terminalId);
      }
      break;

    case "error_detected":
      if (terminal) {
        const errDetected = JSON.stringify({
          type: "terminal_error_detected",
          terminalId,
          context: msg.context,
        });
        for (const client of terminal.attachedClients) {
          try { client.send(errDetected); } catch {}
        }
      }
      break;

    case "attached":
      break;

    case "buffer":
      break;

    case "pong":
      break;

    case "error":
      console.warn("[Terminal] PTY server error:", msg.message);
      break;
  }
}

async function createPtyViaServer(cwd: string, cols: number, rows: number, sessionId?: string): Promise<ProxiedTerminal | null> {
  if (!ptyServerConnected || !ptyServerWs) {
    connectToPtyServer();
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!ptyServerConnected || !ptyServerWs) {
      return null;
    }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      ptyServerWs?.off("message", handler);
      resolve(null);
    }, PTY_SERVER_CREATION_TIMEOUT_MS);

    const handler = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "created") {
          clearTimeout(timeout);
          ptyServerWs?.off("message", handler);

          const terminal: ProxiedTerminal = {
            terminalId: msg.terminalId,
            cwd: msg.cwd,
            createdAt: Date.now(),
            pid: msg.pid,
            sessionId,
            attachedClients: new Set(),
            outputBuffer: [],
          };
          proxiedTerminals.set(msg.terminalId, terminal);

          ptyServerWs?.send(JSON.stringify({
            type: "attach",
            terminalId: msg.terminalId,
          }));

          resolve(terminal);
        } else if (msg.type === "error") {
          clearTimeout(timeout);
          ptyServerWs?.off("message", handler);
          resolve(null);
        }
      } catch {}
    };

    ptyServerWs!.on("message", handler);
    ptyServerWs!.send(JSON.stringify({
      type: "create",
      cwd,
      cols,
      rows,
      sessionId,
    }));
  });
}

setTimeout(() => connectToPtyServer(), 1000);

export function getExecProcesses() {
  return execProcesses;
}

export function getPtyTerminals() {
  return proxiedTerminals;
}

export async function handleTerminalRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // Terminal AI command generation
  if (url.pathname === "/api/terminal/generate-command" && method === "POST") {
    return handleTerminalGenerateCommand(req);
  }

  if (url.pathname === "/api/terminal/exec" && method === "POST") {
    const body = await req.json();
    const { command, cwd = homedir(), env } = body;

    if (!command) {
      return json({ error: "Command required" }, 400);
    }

    const execId = crypto.randomUUID();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            try {
              controller.enqueue(data);
            } catch {
              isClosed = true;
            }
          }
        };

        const safeClose = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch {}
          }
        };

        try {
          const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
          const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

          const proc = spawn(shell, shellArgs, {
            cwd,
            env: { ...process.env, ...env },
            stdio: ["ignore", "pipe", "pipe"],
          });

          const now = Date.now();
          execProcesses.set(execId, {
            process: proc,
            cwd,
            startedAt: now,
          });
          execProcessActivity.set(execId, { lastActivityAt: now });

          console.log(`[Terminal] Started HTTP exec process ${execId} (pid: ${proc.pid})`);
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "started", execId })}\n\n`));

          proc.stdout?.on("data", (data: Buffer) => {
            // Update last activity on output
            const activity = execProcessActivity.get(execId);
            if (activity) {
              activity.lastActivityAt = Date.now();
            }
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: data.toString() })}\n\n`)
            );
          });

          proc.stderr?.on("data", (data: Buffer) => {
            // Update last activity on output
            const activity = execProcessActivity.get(execId);
            if (activity) {
              activity.lastActivityAt = Date.now();
            }
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: data.toString() })}\n\n`)
            );
          });

          proc.on("close", (code) => {
            console.log(`[Terminal] HTTP exec process ${execId} exited with code ${code}`);
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "exit", code })}\n\n`)
            );
            safeClose();
            execProcesses.delete(execId);
            execProcessActivity.delete(execId);
          });

          proc.on("error", (err) => {
            console.log(`[Terminal] HTTP exec process ${execId} error: ${err.message}`);
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`)
            );
            safeClose();
            execProcesses.delete(execId);
            execProcessActivity.delete(execId);
          });
        } catch (err: any) {
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message || "Failed to spawn process" })}\n\n`)
          );
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders,
      },
    });
  }

  if (url.pathname.match(/^\/api\/terminal\/exec\/[\w-]+$/) && method === "DELETE") {
    const execId = url.pathname.split("/").pop()!;
    const termProcess = execProcesses.get(execId);

    if (!termProcess) {
      return json({ error: "Process not found" }, 404);
    }

    console.log(`[Terminal] Killing HTTP exec process ${execId} (pid: ${termProcess.process.pid}) via DELETE request`);
    termProcess.process.kill("SIGTERM");
    execProcesses.delete(execId);
    execProcessActivity.delete(execId);
    return json({ success: true, execId });
  }

  if (url.pathname === "/api/terminal/exec" && method === "GET") {
    const active = Array.from(execProcesses.entries()).map(([id, proc]) => ({
      execId: id,
      cwd: proc.cwd,
      startedAt: proc.startedAt,
      pid: proc.process.pid,
    }));
    return json(active);
  }

  if (url.pathname === "/api/terminal/pty" && method === "POST") {
    const body = await req.json();
    const { cwd = homedir(), cols = TERMINAL_DEFAULT_COLS, rows = TERMINAL_DEFAULT_ROWS, sessionId } = body;
    const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : TERMINAL_DEFAULT_COLS;
    const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : TERMINAL_DEFAULT_ROWS;

    const terminal = await createPtyViaServer(cwd, safeCols, safeRows, sessionId);

    if (!terminal) {
      return json({ error: "Failed to create PTY (PTY server not available)" }, 500);
    }

    return json({
      terminalId: terminal.terminalId,
      pid: terminal.pid,
      shell: process.env.SHELL || "/bin/bash",
      cwd: terminal.cwd,
      sessionId: terminal.sessionId,
    });
  }

  if (url.pathname.match(/^\/api\/terminal\/pty\/[\w-]+\/resize$/) && method === "POST") {
    const terminalId = url.pathname.split("/")[4];
    const terminal = proxiedTerminals.get(terminalId);

    if (!terminal) {
      return json({ error: "Terminal not found" }, 404);
    }

    try {
      const body = await req.json();
      const { cols, rows } = body;
      const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : 0;
      const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 0;

      if (safeCols && safeRows && ptyServerWs?.readyState === WebSocket.OPEN) {
        ptyServerWs.send(JSON.stringify({
          type: "resize",
          terminalId,
          cols: safeCols,
          rows: safeRows,
        }));
      }
      return json({ success: !!(safeCols && safeRows) });
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  if (url.pathname.match(/^\/api\/terminal\/pty\/[\w-]+$/) && method === "DELETE") {
    const terminalId = url.pathname.split("/").pop()!;
    const terminal = proxiedTerminals.get(terminalId);

    if (!terminal) {
      return json({ error: "Terminal not found" }, 404);
    }

    if (ptyServerWs?.readyState === WebSocket.OPEN) {
      ptyServerWs.send(JSON.stringify({
        type: "kill",
        terminalId,
      }));
    }
    proxiedTerminals.delete(terminalId);
    return json({ success: true });
  }

  if (url.pathname === "/api/terminal/pty" && method === "GET") {
    const sessionIdFilter = url.searchParams.get("sessionId");
    let terminals = Array.from(proxiedTerminals.entries()).map(([id, term]) => ({
      terminalId: id,
      cwd: term.cwd,
      createdAt: term.createdAt,
      pid: term.pid,
      sessionId: term.sessionId,
    }));

    if (sessionIdFilter) {
      terminals = terminals.filter(t => t.sessionId === sessionIdFilter);
    }

    return json(terminals);
  }

  if (url.pathname.match(/^\/api\/terminal\/pty\/[\w-]+\/buffer$/) && method === "GET") {
    const terminalId = url.pathname.split("/")[4];
    const terminal = proxiedTerminals.get(terminalId);

    if (!terminal) {
      return json({ error: "Terminal not found" }, 404);
    }

    const lines = parseInt(url.searchParams.get("lines") || "100");
    const buffer = terminal.outputBuffer.slice(-lines);

    return json({
      terminalId,
      lines: buffer,
      totalLines: terminal.outputBuffer.length,
    });
  }

  if (url.pathname.match(/^\/api\/terminal\/pty\/[\w-]+\/errors$/) && method === "GET") {
    const terminalId = url.pathname.split("/")[4];
    const terminal = proxiedTerminals.get(terminalId);

    if (!terminal) {
      return json({ error: "Terminal not found" }, 404);
    }

    const recentLines = terminal.outputBuffer.slice(-50).join('\n');
    const hasErrors = TERMINAL_ERROR_PATTERNS.some(pattern => pattern.test(recentLines));
    const errorLines = terminal.outputBuffer
      .slice(-50)
      .filter(line => TERMINAL_ERROR_PATTERNS.some(pattern => pattern.test(line)));

    return json({
      terminalId,
      hasErrors,
      errorLines,
      context: recentLines,
    });
  }

  return null;
}

export interface PtyMessage {
  type: "terminal_input" | "terminal_resize" | "terminal_attach" | "terminal_detach" | "exec_start" | "exec_kill" | "ping";
  terminalId?: string;
  execId?: string;
  data?: string;
  command?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export function startWsExec(ws: any, command: string, cwd: string = homedir()): string {
  const execId = crypto.randomUUID();
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

  const proc = spawn(shell, shellArgs, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const now = Date.now();
  wsExecProcesses.set(execId, {
    process: proc,
    cwd,
    startedAt: now,
    lastActivityAt: now,
    ws,
  });

  console.log(`[Terminal] Started WS exec process ${execId} (pid: ${proc.pid})`);
  ws.send(JSON.stringify({ type: "exec_started", execId }));

  proc.stdout?.on("data", (data: Buffer) => {
    // Update last activity on output
    const execProc = wsExecProcesses.get(execId);
    if (execProc) {
      execProc.lastActivityAt = Date.now();
    }
    try {
      ws.send(JSON.stringify({ type: "exec_stdout", execId, data: data.toString() }));
    } catch {}
  });

  proc.stderr?.on("data", (data: Buffer) => {
    // Update last activity on output
    const execProc = wsExecProcesses.get(execId);
    if (execProc) {
      execProc.lastActivityAt = Date.now();
    }
    try {
      ws.send(JSON.stringify({ type: "exec_stderr", execId, data: data.toString() }));
    } catch {}
  });

  proc.on("close", (code) => {
    console.log(`[Terminal] WS exec process ${execId} exited with code ${code}`);
    try {
      ws.send(JSON.stringify({ type: "exec_exit", execId, code }));
    } catch {}
    wsExecProcesses.delete(execId);
  });

  proc.on("error", (err) => {
    console.log(`[Terminal] WS exec process ${execId} error: ${err.message}`);
    try {
      ws.send(JSON.stringify({ type: "exec_error", execId, message: err.message }));
    } catch {}
    wsExecProcesses.delete(execId);
  });

  return execId;
}

export function killWsExec(execId: string): boolean {
  const proc = wsExecProcesses.get(execId);
  if (proc) {
    console.log(`[Terminal] Killing WS exec process ${execId} (pid: ${proc.process.pid}) via kill request`);
    proc.process.kill("SIGTERM");
    setTimeout(() => {
      if (wsExecProcesses.has(execId)) {
        console.log(`[Terminal] Force killing WS exec process ${execId} (SIGKILL) after timeout`);
        proc.process.kill("SIGKILL");
        wsExecProcesses.delete(execId);
      }
    }, 1000);
    return true;
  }
  return false;
}

export function cleanupWsExec(ws: any) {
  let cleanedCount = 0;
  for (const [execId, proc] of wsExecProcesses.entries()) {
    if (proc.ws === ws) {
      console.log(`[Terminal] Cleaning up exec process ${execId} (pid: ${proc.process.pid}) on WS disconnect`);
      proc.process.kill("SIGTERM");
      wsExecProcesses.delete(execId);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`[Terminal] Cleaned up ${cleanedCount} exec process(es) for disconnected WebSocket`);
  }
}

export function attachToTerminal(terminalId: string, ws: any): boolean {
  const terminal = proxiedTerminals.get(terminalId);
  if (!terminal) {
    ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
    return false;
  }

  terminal.attachedClients.add(ws);

  const recentOutput = terminal.outputBuffer.slice(-100).join('');
  if (recentOutput) {
    ws.send(JSON.stringify({
      type: "terminal_output",
      terminalId,
      data: recentOutput,
    }));
  }

  return true;
}

export function detachFromTerminal(terminalId: string, ws: any) {
  const terminal = proxiedTerminals.get(terminalId);
  if (terminal) {
    terminal.attachedClients.delete(ws);
  }
}

export function detachFromAllTerminals(ws: any) {
  for (const terminal of proxiedTerminals.values()) {
    terminal.attachedClients.delete(ws);
  }
}

export function handlePtyWebSocket(ws: any, message: PtyMessage) {
  const terminal = message.terminalId ? proxiedTerminals.get(message.terminalId) : null;

  switch (message.type) {
    case "exec_start":
      if (message.command) {
        startWsExec(ws, message.command, message.cwd || homedir());
      }
      break;

    case "exec_kill":
      if (message.execId) {
        killWsExec(message.execId);
      }
      break;

    case "terminal_attach":
      if (message.terminalId) {
        attachToTerminal(message.terminalId, ws);
      }
      break;

    case "terminal_detach":
      if (message.terminalId) {
        detachFromTerminal(message.terminalId, ws);
      }
      break;

    case "terminal_input":
      if (terminal && message.data && ptyServerWs?.readyState === WebSocket.OPEN) {
        ptyServerWs.send(JSON.stringify({
          type: "input",
          terminalId: message.terminalId,
          data: message.data,
        }));
      }
      break;

    case "terminal_resize":
      if (terminal && message.cols && message.rows && ptyServerWs?.readyState === WebSocket.OPEN) {
        const safeCols = Number.isFinite(message.cols) && message.cols > 1 ? Math.floor(message.cols) : 0;
        const safeRows = Number.isFinite(message.rows) && message.rows > 1 ? Math.floor(message.rows) : 0;
        if (safeCols && safeRows) {
          ptyServerWs.send(JSON.stringify({
            type: "resize",
            terminalId: message.terminalId,
            cols: safeCols,
            rows: safeRows,
          }));
        }
      }
      break;

    case "ping":
      ws.send(JSON.stringify({ type: "pong", terminalId: message.terminalId }));
      break;

    default:
      if (!terminal) {
        ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
      }
  }
}

export function installPtyErrorHandler() {}
export function setupPtyBroadcast(_terminalId: string) {}
export function setupPtyOutput(_terminalId: string, _ws: any) {}

/**
 * Clean up stale processes that have been running without activity for too long.
 * This prevents orphaned processes from accumulating.
 */
export function cleanupStaleProcesses(): { wsExecCleaned: number; httpExecCleaned: number } {
  const now = Date.now();
  let wsExecCleaned = 0;
  let httpExecCleaned = 0;

  // Clean up stale WebSocket exec processes
  for (const [execId, proc] of wsExecProcesses.entries()) {
    const idleTime = now - proc.lastActivityAt;
    if (idleTime > STALE_PROCESS_TIMEOUT_MS) {
      console.log(`[Terminal] Cleaning up stale WS exec process ${execId} (pid: ${proc.process.pid}, idle: ${Math.round(idleTime / 1000 / 60)}min)`);
      proc.process.kill("SIGTERM");
      wsExecProcesses.delete(execId);
      wsExecCleaned++;
    }
  }

  // Clean up stale HTTP SSE exec processes
  for (const [execId, proc] of execProcesses.entries()) {
    const activity = execProcessActivity.get(execId);
    const lastActivity = activity?.lastActivityAt ?? proc.startedAt;
    const idleTime = now - lastActivity;

    if (idleTime > STALE_PROCESS_TIMEOUT_MS) {
      console.log(`[Terminal] Cleaning up stale HTTP exec process ${execId} (pid: ${proc.process.pid}, idle: ${Math.round(idleTime / 1000 / 60)}min)`);
      proc.process.kill("SIGTERM");
      execProcesses.delete(execId);
      execProcessActivity.delete(execId);
      httpExecCleaned++;
    }
  }

  if (wsExecCleaned > 0 || httpExecCleaned > 0) {
    console.log(`[Terminal] Stale process cleanup complete: ${wsExecCleaned} WS exec, ${httpExecCleaned} HTTP exec`);
  }

  return { wsExecCleaned, httpExecCleaned };
}

/**
 * Get current process counts for monitoring
 */
export function getProcessStats(): {
  wsExecCount: number;
  httpExecCount: number;
  proxiedTerminalCount: number;
} {
  return {
    wsExecCount: wsExecProcesses.size,
    httpExecCount: execProcesses.size,
    proxiedTerminalCount: proxiedTerminals.size,
  };
}

// Start periodic cleanup timer
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicCleanup() {
  if (cleanupTimer) {
    return; // Already running
  }
  console.log(`[Terminal] Starting periodic stale process cleanup (interval: ${CLEANUP_INTERVAL_MS / 1000 / 60}min, timeout: ${STALE_PROCESS_TIMEOUT_MS / 1000 / 60}min)`);
  cleanupTimer = setInterval(() => {
    cleanupStaleProcesses();
  }, CLEANUP_INTERVAL_MS);
}

export function stopPeriodicCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log("[Terminal] Stopped periodic stale process cleanup");
  }
}

// Auto-start periodic cleanup when module loads
startPeriodicCleanup();

/**
 * Handle terminal command generation endpoint
 * POST /api/terminal/generate-command
 */
export async function handleTerminalGenerateCommand(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { prompt, context = "", cwd = "" } = body;

    if (!prompt) {
      return json({ error: "Prompt is required" }, 400);
    }

    const systemPrompt = `You are a terminal command expert. Generate shell commands based on user requests.

IMPORTANT RULES:
1. Return ONLY a valid shell command - no explanations in the command itself
2. Use standard Unix/macOS commands (bash-compatible)
3. Be safe - never suggest destructive commands without warnings
4. Consider the current working directory if provided
5. If the user's request is ambiguous, provide the most common interpretation

Response format (JSON):
{
  "command": "the shell command to run",
  "explanation": "brief explanation of what the command does"
}

${cwd ? `Current directory: ${cwd}` : ""}
${context ? `Recent terminal output for context:\n\`\`\`\n${context.slice(-2000)}\n\`\`\`` : ""}`;

    // Use direct API call for speed (no tool use needed)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Try to get from global settings
      const { globalSettings } = await import("../db");
      const storedKey = globalSettings.get("anthropicApiKey");
      if (!storedKey) {
        return json({ error: "No API key configured" }, 500);
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": storedKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || "API error");
      }

      const data = await res.json();
      const responseText = data.content?.[0]?.text || "";

      // Parse JSON response
      try {
        const parsed = JSON.parse(responseText);
        return json({
          command: parsed.command || "",
          explanation: parsed.explanation || "",
        });
      } catch {
        // If not JSON, treat as plain command
        return json({
          command: responseText.trim(),
          explanation: "",
        });
      }
    }

    // Use environment API key
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "API error");
    }

    const data = await res.json();
    const responseText = data.content?.[0]?.text || "";

    // Parse JSON response
    try {
      const parsed = JSON.parse(responseText);
      return json({
        command: parsed.command || "",
        explanation: parsed.explanation || "",
      });
    } catch {
      // If not JSON, treat as plain command
      return json({
        command: responseText.trim(),
        explanation: "",
      });
    }
  } catch (e: any) {
    console.error("[Terminal] Generate command error:", e);
    return json({ error: e.message || "Failed to generate command" }, 500);
  }
}
