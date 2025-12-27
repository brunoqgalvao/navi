import { json, corsHeaders } from "../utils/response";
import { spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import WebSocket from "ws";

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
  ws: any;
}
const wsExecProcesses = new Map<string, WsExecProcess>();

const proxiedTerminals = new Map<string, ProxiedTerminal>();

const PTY_SERVER_URL = process.env.PTY_SERVER_URL || "ws://localhost:3002";
const PTY_SERVER_HTTP = process.env.PTY_SERVER_HTTP || "http://localhost:3002";

let ptyServerWs: WebSocket | null = null;
let ptyServerConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_BUFFER_LINES = 500;
const ERROR_PATTERNS = [
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
];

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
  }, 3000);
}

function handlePtyServerMessage(msg: any) {
  const { terminalId } = msg;
  const terminal = terminalId ? proxiedTerminals.get(terminalId) : null;

  switch (msg.type) {
    case "output":
      if (terminal) {
        const lines = (msg.data || "").split('\n');
        terminal.outputBuffer.push(...lines);
        while (terminal.outputBuffer.length > MAX_BUFFER_LINES) {
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

        if (ERROR_PATTERNS.some(p => p.test(msg.data || ""))) {
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
    }, 5000);

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

          execProcesses.set(execId, {
            process: proc,
            cwd,
            startedAt: Date.now(),
          });

          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "started", execId })}\n\n`));

          proc.stdout?.on("data", (data: Buffer) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "stdout", data: data.toString() })}\n\n`)
            );
          });

          proc.stderr?.on("data", (data: Buffer) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "stderr", data: data.toString() })}\n\n`)
            );
          });

          proc.on("close", (code) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "exit", code })}\n\n`)
            );
            safeClose();
            execProcesses.delete(execId);
          });

          proc.on("error", (err) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`)
            );
            safeClose();
            execProcesses.delete(execId);
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

    termProcess.process.kill("SIGTERM");
    execProcesses.delete(execId);
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
    const { cwd = homedir(), cols = 80, rows = 24, sessionId } = body;
    const safeCols = Number.isFinite(cols) && cols > 1 ? Math.floor(cols) : 80;
    const safeRows = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 24;

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
    const hasErrors = ERROR_PATTERNS.some(pattern => pattern.test(recentLines));
    const errorLines = terminal.outputBuffer
      .slice(-50)
      .filter(line => ERROR_PATTERNS.some(pattern => pattern.test(line)));

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

  wsExecProcesses.set(execId, {
    process: proc,
    cwd,
    startedAt: Date.now(),
    ws,
  });

  ws.send(JSON.stringify({ type: "exec_started", execId }));

  proc.stdout?.on("data", (data: Buffer) => {
    try {
      ws.send(JSON.stringify({ type: "exec_stdout", execId, data: data.toString() }));
    } catch {}
  });

  proc.stderr?.on("data", (data: Buffer) => {
    try {
      ws.send(JSON.stringify({ type: "exec_stderr", execId, data: data.toString() }));
    } catch {}
  });

  proc.on("close", (code) => {
    try {
      ws.send(JSON.stringify({ type: "exec_exit", execId, code }));
    } catch {}
    wsExecProcesses.delete(execId);
  });

  proc.on("error", (err) => {
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
    proc.process.kill("SIGTERM");
    setTimeout(() => {
      if (wsExecProcesses.has(execId)) {
        proc.process.kill("SIGKILL");
        wsExecProcesses.delete(execId);
      }
    }, 1000);
    return true;
  }
  return false;
}

export function cleanupWsExec(ws: any) {
  for (const [execId, proc] of wsExecProcesses.entries()) {
    if (proc.ws === ws) {
      proc.process.kill("SIGTERM");
      wsExecProcesses.delete(execId);
    }
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
