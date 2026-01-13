/**
 * Background Process Management
 *
 * Tracks and manages long-running background processes spawned by Claude,
 * including dev servers, build watchers, and other backgrounded commands.
 */
import { json, corsHeaders } from "../utils/response";
import { spawn, exec, type ChildProcess } from "child_process";
import { homedir } from "os";
import { getActiveProcesses } from "../websocket/handler";

// Constants
const MAX_OUTPUT_LINES = 200;
// Strip ANSI color codes for port detection
const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");

const PORT_DETECTION_PATTERNS = [
  /listening on (?:port )?(\d+)/i,
  /started (?:on|at) (?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i,
  /server running (?:on|at) (?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i,
  /Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
  /ready on http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
  /➜\s+Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i,
  /http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i,
  /port\s*[=:]\s*(\d+)/i,
];

export type BackgroundProcessStatus = "running" | "completed" | "failed" | "killed" | "starting" | "paused";

export interface BackgroundProcess {
  id: string;
  type: "bash" | "task" | "dev_server" | "container_preview";
  command: string;
  cwd: string;
  pid?: number;
  containerId?: string;  // For container previews
  sessionId?: string;
  projectId?: string;
  startedAt: number;
  status: BackgroundProcessStatus;
  exitCode?: number;
  output: string[];
  outputSize: number;
  ports: number[];
  label?: string;
  url?: string;  // Preview URL for container previews
  process?: ChildProcess;
}

// In-memory store for background processes
const backgroundProcesses = new Map<string, BackgroundProcess>();

// Event listeners for real-time updates
type ProcessEventListener = (event: ProcessEvent) => void;
const eventListeners = new Set<ProcessEventListener>();

export interface ProcessEvent {
  type: "process_started" | "process_output" | "process_status" | "process_port_detected" | "process_removed";
  processId: string;
  data?: string;
  status?: BackgroundProcessStatus;
  exitCode?: number;
  port?: number;
  process?: Omit<BackgroundProcess, "process">;
}

export function addProcessEventListener(listener: ProcessEventListener) {
  eventListeners.add(listener);
}

export function removeProcessEventListener(listener: ProcessEventListener) {
  eventListeners.delete(listener);
}

function emitEvent(event: ProcessEvent) {
  eventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.error("[BackgroundProcesses] Event listener error:", e);
    }
  });
}

function detectPorts(output: string): number[] {
  const ports: number[] = [];
  const cleanOutput = stripAnsi(output);
  for (const pattern of PORT_DETECTION_PATTERNS) {
    const match = cleanOutput.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536 && !ports.includes(port)) {
        ports.push(port);
      }
    }
  }
  return ports;
}

function inferLabel(command: string): string | undefined {
  const cmd = command.toLowerCase();
  if (cmd.includes("npm run dev") || cmd.includes("yarn dev") || cmd.includes("bun dev") || cmd.includes("pnpm dev")) {
    return "Dev Server";
  }
  if (cmd.includes("npm run build") || cmd.includes("yarn build") || cmd.includes("bun build")) {
    return "Build";
  }
  if (cmd.includes("npm run watch") || cmd.includes("yarn watch")) {
    return "Watch";
  }
  if (cmd.includes("npm run test") || cmd.includes("yarn test") || cmd.includes("jest") || cmd.includes("vitest")) {
    return "Tests";
  }
  if (cmd.includes("npm start") || cmd.includes("yarn start") || cmd.includes("node ")) {
    return "Server";
  }
  if (cmd.includes("docker")) {
    return "Docker";
  }
  if (cmd.includes("supabase")) {
    return "Supabase";
  }
  return undefined;
}

function sanitizeProcessForApi(proc: BackgroundProcess): Omit<BackgroundProcess, "process"> {
  const { process, ...rest } = proc;
  return rest;
}

/**
 * Start a new background process
 */
export function startBackgroundProcess(options: {
  command: string;
  cwd?: string;
  sessionId?: string;
  projectId?: string;
  type?: "bash" | "task" | "dev_server";
  label?: string;
}): BackgroundProcess {
  const id = crypto.randomUUID();
  const { command, cwd = homedir(), sessionId, projectId, type = "bash", label } = options;

  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

  const childProcess = spawn(shell, shellArgs, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  const bgProcess: BackgroundProcess = {
    id,
    type,
    command,
    cwd,
    pid: childProcess.pid,
    sessionId,
    projectId,
    startedAt: Date.now(),
    status: "running",
    output: [],
    outputSize: 0,
    ports: [],
    label: label || inferLabel(command),
    process: childProcess,
  };

  backgroundProcesses.set(id, bgProcess);
  console.log(`[BackgroundProcesses] Started process ${id} (pid: ${childProcess.pid}): ${command.slice(0, 50)}...`);

  emitEvent({
    type: "process_started",
    processId: id,
    process: sanitizeProcessForApi(bgProcess),
  });

  // Handle stdout
  childProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    const lines = text.split("\n").filter(l => l.trim());

    bgProcess.output.push(...lines);
    bgProcess.outputSize += data.length;

    // Trim to max lines
    while (bgProcess.output.length > MAX_OUTPUT_LINES) {
      bgProcess.output.shift();
    }

    // Detect ports
    const detectedPorts = detectPorts(text);
    for (const port of detectedPorts) {
      if (!bgProcess.ports.includes(port)) {
        bgProcess.ports.push(port);
        emitEvent({
          type: "process_port_detected",
          processId: id,
          port,
        });
      }
    }

    emitEvent({
      type: "process_output",
      processId: id,
      data: text,
    });
  });

  // Handle stderr (combine with stdout for output)
  childProcess.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    const lines = text.split("\n").filter(l => l.trim());

    bgProcess.output.push(...lines);
    bgProcess.outputSize += data.length;

    while (bgProcess.output.length > MAX_OUTPUT_LINES) {
      bgProcess.output.shift();
    }

    // Also check stderr for port announcements
    const detectedPorts = detectPorts(text);
    for (const port of detectedPorts) {
      if (!bgProcess.ports.includes(port)) {
        bgProcess.ports.push(port);
        emitEvent({
          type: "process_port_detected",
          processId: id,
          port,
        });
      }
    }

    emitEvent({
      type: "process_output",
      processId: id,
      data: text,
    });
  });

  // Handle exit
  childProcess.on("close", (code, signal) => {
    console.log(`[BackgroundProcesses] Process ${id} exited with code ${code}, signal ${signal}`);
    bgProcess.status = code === 0 ? "completed" : "failed";
    bgProcess.exitCode = code ?? undefined;
    delete bgProcess.process;

    emitEvent({
      type: "process_status",
      processId: id,
      status: bgProcess.status,
      exitCode: bgProcess.exitCode,
    });
  });

  // Handle error
  childProcess.on("error", (err) => {
    console.error(`[BackgroundProcesses] Process ${id} error:`, err);
    bgProcess.status = "failed";
    bgProcess.output.push(`Error: ${err.message}`);
    delete bgProcess.process;

    emitEvent({
      type: "process_status",
      processId: id,
      status: "failed",
    });
  });

  return bgProcess;
}

/**
 * Kill a background process
 */
export function killBackgroundProcess(id: string, signal: NodeJS.Signals = "SIGTERM"): boolean {
  const proc = backgroundProcesses.get(id);
  if (!proc) {
    return false;
  }

  if (proc.process) {
    try {
      proc.process.kill(signal);
      proc.status = "killed";

      // Force kill after timeout if SIGTERM
      if (signal === "SIGTERM") {
        setTimeout(() => {
          if (proc.process && proc.status !== "completed" && proc.status !== "failed") {
            proc.process.kill("SIGKILL");
          }
        }, 3000);
      }

      emitEvent({
        type: "process_status",
        processId: id,
        status: "killed",
      });

      return true;
    } catch (e) {
      console.error(`[BackgroundProcesses] Failed to kill process ${id}:`, e);
      return false;
    }
  }

  return false;
}

/**
 * Remove a completed/failed/killed process from tracking
 */
export function removeBackgroundProcess(id: string): boolean {
  const proc = backgroundProcesses.get(id);
  if (!proc) {
    return false;
  }

  // Kill if still running
  if (proc.status === "running" && proc.process) {
    proc.process.kill("SIGKILL");
  }

  backgroundProcesses.delete(id);

  emitEvent({
    type: "process_removed",
    processId: id,
  });

  return true;
}

/**
 * Get all background processes (including container previews)
 */
export async function listBackgroundProcesses(filter?: {
  sessionId?: string;
  projectId?: string;
  status?: BackgroundProcessStatus;
  includeContainers?: boolean;
}): Promise<Omit<BackgroundProcess, "process">[]> {
  let processes = Array.from(backgroundProcesses.values());

  if (filter?.sessionId) {
    // Include processes matching the sessionId OR "global" processes (visible to all sessions)
    processes = processes.filter(p => p.sessionId === filter.sessionId || p.sessionId === "global");
  }
  if (filter?.projectId) {
    processes = processes.filter(p => p.projectId === filter.projectId);
  }
  if (filter?.status) {
    processes = processes.filter(p => p.status === filter.status);
  }

  const result = processes.map(sanitizeProcessForApi);

  // Include container previews if requested (default: true)
  if (filter?.includeContainers !== false) {
    const containerPreviews = await getContainerPreviewsAsProcesses(filter);
    result.push(...containerPreviews);
  }

  return result;
}

/**
 * Get container previews formatted as BackgroundProcess
 */
async function getContainerPreviewsAsProcesses(filter?: {
  sessionId?: string;
  projectId?: string;
  status?: BackgroundProcessStatus;
}): Promise<Omit<BackgroundProcess, "process">[]> {
  try {
    // Import preview service dynamically to avoid circular deps
    const { previewService } = await import("../services/preview");
    const previews = previewService.listPreviews();

    return previews
      .filter(p => {
        if (filter?.sessionId && p.sessionId !== filter.sessionId && p.sessionId !== "global") return false;
        if (filter?.projectId && p.projectId !== filter.projectId) return false;
        if (filter?.status && p.status !== filter.status) return false;
        return true;
      })
      .map(p => ({
        id: `container-${p.id}`,
        type: "container_preview" as const,
        command: p.framework?.devCommand || "docker container",
        cwd: p.path,
        containerId: p.containerId,
        sessionId: p.sessionId,
        projectId: p.projectId,
        startedAt: p.startedAt || Date.now(),
        status: p.status as BackgroundProcessStatus,
        output: [],
        outputSize: 0,
        ports: [p.internalPort],
        label: `Preview: ${p.slug}`,
        url: p.url,
      }));
  } catch (e) {
    // Preview service might not be initialized
    return [];
  }
}

/**
 * Get a specific background process
 */
export function getBackgroundProcess(id: string): Omit<BackgroundProcess, "process"> | null {
  const proc = backgroundProcesses.get(id);
  return proc ? sanitizeProcessForApi(proc) : null;
}

/**
 * Get output from a background process
 */
export function getProcessOutput(id: string, lines?: number): string[] {
  const proc = backgroundProcesses.get(id);
  if (!proc) {
    return [];
  }
  return lines ? proc.output.slice(-lines) : proc.output;
}

/**
 * Restart a background process with the same command
 */
export function restartBackgroundProcess(id: string): BackgroundProcess | null {
  const proc = backgroundProcesses.get(id);
  if (!proc) {
    return null;
  }

  // Kill existing if running
  if (proc.status === "running" && proc.process) {
    proc.process.kill("SIGKILL");
  }

  // Remove old process
  backgroundProcesses.delete(id);

  emitEvent({
    type: "process_removed",
    processId: id,
  });

  // Start new process with same config
  return startBackgroundProcess({
    command: proc.command,
    cwd: proc.cwd,
    sessionId: proc.sessionId,
    projectId: proc.projectId,
    type: proc.type,
    label: proc.label,
  });
}

/**
 * Detect running processes that might be dev servers using lsof/netstat
 */
export async function detectExistingProcesses(projectPath?: string): Promise<Array<{
  pid: number;
  port: number;
  command: string;
}>> {
  return new Promise((resolve) => {
    // Use lsof to find listening processes (macOS/Linux)
    exec('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E "(node|bun|deno|python|ruby|cargo)" || true', (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }

      const processes: Array<{ pid: number; port: number; command: string }> = [];
      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 9) {
          const command = parts[0];
          const pid = parseInt(parts[1], 10);
          const portMatch = parts[8]?.match(/:(\d+)$/);

          if (pid && portMatch) {
            const port = parseInt(portMatch[1], 10);
            if (port >= 3000 && port < 65536) {
              processes.push({ pid, port, command });
            }
          }
        }
      }

      resolve(processes);
    });
  });
}

/**
 * Handle HTTP API routes for background processes
 */
export async function handleBackgroundProcessRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // List all background processes (including container previews)
  if (url.pathname === "/api/background-processes" && method === "GET") {
    const sessionId = url.searchParams.get("sessionId") || undefined;
    const projectId = url.searchParams.get("projectId") || undefined;
    const status = url.searchParams.get("status") as BackgroundProcessStatus | undefined;
    const includeContainers = url.searchParams.get("includeContainers") !== "false";

    const processes = await listBackgroundProcesses({ sessionId, projectId, status, includeContainers });
    return json(processes);
  }

  // Start a new background process
  if (url.pathname === "/api/background-processes" && method === "POST") {
    const body = await req.json();
    let { command, cwd, sessionId, projectId, type, label } = body;

    if (!command) {
      return json({ error: "Command required" }, 400);
    }

    // Auto-detect sessionId from active query worker if not provided
    if (!sessionId) {
      const activeProcesses = getActiveProcesses();
      // Get the most recent active session (there's usually only one)
      for (const [sid] of activeProcesses) {
        sessionId = sid;
        console.log(`[BackgroundProcesses] Auto-detected sessionId: ${sessionId}`);
        break;
      }

      // Default to "global" if no active session found
      if (!sessionId) {
        sessionId = "global";
        console.log(`[BackgroundProcesses] No active session found, using default: ${sessionId}`);
      }
    }

    const proc = startBackgroundProcess({ command, cwd, sessionId, projectId, type, label });
    return json(sanitizeProcessForApi(proc));
  }

  // Get a specific background process
  if (url.pathname.match(/^\/api\/background-processes\/[\w-]+$/) && method === "GET") {
    const id = url.pathname.split("/").pop()!;
    const proc = getBackgroundProcess(id);

    if (!proc) {
      return json({ error: "Process not found" }, 404);
    }

    return json(proc);
  }

  // Get process output (or container logs)
  if (url.pathname.match(/^\/api\/background-processes\/[\w-]+\/output$/) && method === "GET") {
    const id = url.pathname.split("/")[3];
    const lines = parseInt(url.searchParams.get("lines") || "100");

    // Handle container preview logs
    if (id.startsWith("container-")) {
      const containerId = id.replace("container-", "");
      try {
        const { previewService } = await import("../services/preview");
        const logs = await previewService.getLogs(containerId, lines);
        return json({ output: logs, totalLines: logs.length });
      } catch (e: any) {
        return json({ output: [], totalLines: 0, error: e.message });
      }
    }

    const output = getProcessOutput(id, lines);
    return json({ output, totalLines: output.length });
  }

  // Kill a background process (or container preview)
  if (url.pathname.match(/^\/api\/background-processes\/[\w-]+$/) && method === "DELETE") {
    const id = url.pathname.split("/").pop()!;
    const body = await req.json().catch(() => ({}));
    const { signal = "SIGTERM", remove = false } = body;

    // Handle container preview kills
    if (id.startsWith("container-")) {
      const containerId = id.replace("container-", "");
      try {
        const { previewService } = await import("../services/preview");
        await previewService.stopPreview(containerId);
        return json({ success: true, type: "container_preview" });
      } catch (e: any) {
        return json({ error: e.message || "Failed to stop container" }, 500);
      }
    }

    if (remove) {
      const removed = removeBackgroundProcess(id);
      if (!removed) {
        return json({ error: "Process not found" }, 404);
      }
      return json({ success: true, removed: true });
    }

    const killed = killBackgroundProcess(id, signal);
    if (!killed) {
      return json({ error: "Process not found or already stopped" }, 404);
    }

    return json({ success: true, killed: true });
  }

  // Restart a background process
  if (url.pathname.match(/^\/api\/background-processes\/[\w-]+\/restart$/) && method === "POST") {
    const id = url.pathname.split("/")[3];
    const newProc = restartBackgroundProcess(id);

    if (!newProc) {
      return json({ error: "Process not found" }, 404);
    }

    return json(sanitizeProcessForApi(newProc));
  }

  // Detect existing processes
  if (url.pathname === "/api/background-processes/detect" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath") || undefined;
    const detected = await detectExistingProcesses(projectPath);
    return json(detected);
  }

  return null;
}

// Cleanup on module unload
process.on("exit", () => {
  backgroundProcesses.forEach((proc) => {
    if (proc.process) {
      proc.process.kill("SIGKILL");
    }
  });
});
