import { json, corsHeaders } from "../utils/response";
import { getActiveProcesses } from "../websocket/handler";
import { getExecProcesses, getPtyTerminals } from "./terminal";
import { sessions } from "../db";
import { execFileSync } from "child_process";

export interface ProcessInfo {
  id: string;
  type: "query" | "exec" | "pty" | "child";
  pid?: number;
  ppid?: number;
  sessionId?: string;
  sessionTitle?: string;
  cwd?: string;
  startedAt: number;
  command?: string;
}

type ProcessRow = { pid: number; ppid: number; command: string };

// Snapshot the process table once per request. Calling ps recursively is expensive
// enough to crash Bun under polling load.
function getProcessSnapshot(): ProcessRow[] {
  try {
    const output = execFileSync("ps", ["-eo", "pid,ppid,comm"], {
      encoding: "utf-8",
      timeout: 5000,
    });

    const processes: ProcessRow[] = [];
    const lines = output.trim().split("\n");

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const command = parts.slice(2).join(" ");

        if (Number.isFinite(pid) && Number.isFinite(ppid) && pid !== ppid) {
          processes.push({ pid, ppid, command });
        }
      }
    }

    return processes;
  } catch (e) {
    console.error("Failed to get process snapshot:", e);
    return [];
  }
}

export function indexProcessesByParent(processes: ProcessRow[]): Map<number, ProcessRow[]> {
  const byParent = new Map<number, ProcessRow[]>();
  for (const proc of processes) {
    const children = byParent.get(proc.ppid);
    if (children) {
      children.push(proc);
    } else {
      byParent.set(proc.ppid, [proc]);
    }
  }
  return byParent;
}

// Recursively get all descendant processes
export function getAllDescendants(
  parentPid: number,
  processesByParent: Map<number, ProcessRow[]>,
  visited = new Set<number>()
): ProcessRow[] {
  if (visited.has(parentPid)) return [];
  visited.add(parentPid);

  const children = processesByParent.get(parentPid) || [];
  const allDescendants: ProcessRow[] = [];

  for (const child of children) {
    if (visited.has(child.pid)) continue;
    allDescendants.push(child);
    const grandchildren = getAllDescendants(child.pid, processesByParent, visited);
    allDescendants.push(...grandchildren);
  }

  return allDescendants;
}

// Kill a process and all its children
function killProcessTree(pid: number, signal: string = "SIGTERM") {
  try {
    // First kill all children recursively
    const descendants = getAllDescendants(pid, indexProcessesByParent(getProcessSnapshot()));
    for (const desc of descendants.reverse()) {
      try {
        process.kill(desc.pid, signal as any);
      } catch {}
    }
    // Then kill the parent
    process.kill(pid, signal as any);
    return true;
  } catch (e) {
    console.error(`Failed to kill process tree for PID ${pid}:`, e);
    return false;
  }
}

export async function handleProcessRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // List all active child processes
  if (url.pathname === "/api/processes" && method === "GET") {
    const includeChildren = url.searchParams.get("children") !== "false";
    const processes: ProcessInfo[] = [];
    const processesByParent = includeChildren
      ? indexProcessesByParent(getProcessSnapshot())
      : null;

    // Query worker processes (Claude Agent SDK)
    const activeProcesses = getActiveProcesses();
    for (const [sessionId, active] of activeProcesses.entries()) {
      const session = sessions.get(sessionId);
      const parentPid = active.process.pid;

      processes.push({
        id: sessionId,
        type: "query",
        pid: parentPid,
        sessionId,
        sessionTitle: session?.title || "Unknown",
        startedAt: Date.now(), // We don't track this currently, could add it
      });

      // Get child processes of this query worker (Bash commands, etc.)
      if (includeChildren && parentPid) {
        const children = getAllDescendants(parentPid, processesByParent!);
        for (const child of children) {
          // Skip internal processes (bun, node internals)
          if (child.command.includes("bun") || child.command.includes("node")) continue;

          processes.push({
            id: `child-${child.pid}`,
            type: "child",
            pid: child.pid,
            ppid: child.ppid,
            sessionId,
            sessionTitle: session?.title || "Unknown",
            command: child.command,
            startedAt: Date.now(), // We don't have real start time
          });
        }
      }
    }

    // Exec processes (simple command execution)
    const execProcesses = getExecProcesses();
    for (const [execId, proc] of execProcesses.entries()) {
      processes.push({
        id: execId,
        type: "exec",
        pid: proc.process.pid,
        cwd: proc.cwd,
        startedAt: proc.startedAt,
      });
    }

    // PTY terminals (skip invalid ones - PTY is now managed by separate Node server)
    const ptyTerminals = getPtyTerminals();
    for (const [terminalId, term] of ptyTerminals.entries()) {
      if (!term.pty?.pid) continue;
      processes.push({
        id: terminalId,
        type: "pty",
        pid: term.pty.pid,
        cwd: term.cwd,
        startedAt: term.createdAt,
      });
    }

    return json(processes);
  }

  // Kill a specific process
  if (url.pathname.match(/^\/api\/processes\/[\w-]+$/) && method === "DELETE") {
    const processId = url.pathname.split("/").pop()!;
    const body = await req.json().catch(() => ({}));
    const { type, signal = "SIGTERM" } = body as { type?: "query" | "exec" | "pty" | "child"; signal?: string };

    // Try to find and kill the process
    let killed = false;
    let processType: string | null = null;

    // Check if it's a child process (format: child-PID)
    if (processId.startsWith("child-")) {
      const pid = parseInt(processId.replace("child-", ""), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, signal as any);
          killed = true;
          processType = "child";
        } catch (e) {
          // Process might already be dead
        }
      }
    }

    // Check query processes
    const activeProcesses = getActiveProcesses();
    if (!killed && activeProcesses.has(processId)) {
      const active = activeProcesses.get(processId)!;
      // Kill the entire process tree
      if (active.process.pid) {
        killProcessTree(active.process.pid, signal);
      } else {
        active.process.kill(signal as any);
      }
      activeProcesses.delete(processId);
      killed = true;
      processType = "query";
    }

    // Check exec processes
    const execProcesses = getExecProcesses();
    if (!killed && execProcesses.has(processId)) {
      const proc = execProcesses.get(processId)!;
      proc.process.kill(signal as any);
      execProcesses.delete(processId);
      killed = true;
      processType = "exec";
    }

    // Check PTY terminals (skip if pty is invalid)
    const ptyTerminals = getPtyTerminals();
    if (!killed && ptyTerminals.has(processId)) {
      const term = ptyTerminals.get(processId)!;
      if (term.pty?.kill) {
        term.pty.kill();
        killed = true;
        processType = "pty";
      }
      ptyTerminals.delete(processId);
    }

    if (killed) {
      return json({ success: true, processId, type: processType });
    }

    return json({ error: "Process not found" }, 404);
  }

  // Kill all processes of a specific type
  if (url.pathname === "/api/processes/kill-all" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { type } = body as { type?: "query" | "exec" | "pty" | "all" };

    let killedCount = 0;

    if (type === "query" || type === "all") {
      const activeProcesses = getActiveProcesses();
      for (const [sessionId, active] of activeProcesses.entries()) {
        active.process.kill("SIGTERM");
        activeProcesses.delete(sessionId);
        killedCount++;
      }
    }

    if (type === "exec" || type === "all") {
      const execProcesses = getExecProcesses();
      for (const [execId, proc] of execProcesses.entries()) {
        proc.process.kill("SIGTERM");
        execProcesses.delete(execId);
        killedCount++;
      }
    }

    if (type === "pty" || type === "all") {
      const ptyTerminals = getPtyTerminals();
      for (const [terminalId, term] of ptyTerminals.entries()) {
        if (term.pty?.kill) {
          term.pty.kill();
          killedCount++;
        }
        ptyTerminals.delete(terminalId);
      }
    }

    return json({ success: true, killedCount });
  }

  return null;
}
