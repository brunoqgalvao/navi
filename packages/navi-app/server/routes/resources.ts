/**
 * Resource Monitor Routes
 *
 * Provides system resource metrics for the Navi server and its processes.
 * @experimental - disabled by default
 */

import { json } from "../utils/response";
import { getActiveProcesses } from "../websocket/handler";
import { getBackgroundProcesses } from "./background-processes";
import { execSync } from "child_process";
import * as os from "os";

export interface ResourceStats {
  timestamp: number;
  server: ServerResourceStats;
  system: SystemResourceStats;
  processes: ProcessResourceStats[];
}

export interface ServerResourceStats {
  pid: number;
  memory: {
    heapUsed: number; // bytes
    heapTotal: number;
    rss: number; // resident set size
    external: number;
    arrayBuffers: number;
  };
  uptime: number; // seconds
}

export interface SystemResourceStats {
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: number; // bytes
  freeMemory: number;
  loadAvg: number[]; // 1, 5, 15 min averages
}

export interface ProcessResourceStats {
  id: string;
  pid: number;
  type: string;
  name: string;
  memory?: number; // RSS in bytes (if available)
  cpu?: number; // CPU % (if available)
}

// Get memory usage for a specific PID (macOS/Linux)
function getProcessMemory(pid: number): number | undefined {
  try {
    // Use ps to get RSS (resident set size) in KB
    const output = execSync(`ps -o rss= -p ${pid} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 1000,
    }).trim();
    const rssKb = parseInt(output, 10);
    if (!isNaN(rssKb)) {
      return rssKb * 1024; // Convert KB to bytes
    }
  } catch {
    // Process might not exist or ps failed
  }
  return undefined;
}

// Get CPU percentage for a specific PID (macOS/Linux)
function getProcessCpu(pid: number): number | undefined {
  try {
    const output = execSync(`ps -o %cpu= -p ${pid} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 1000,
    }).trim();
    const cpu = parseFloat(output);
    if (!isNaN(cpu)) {
      return cpu;
    }
  } catch {
    // Process might not exist or ps failed
  }
  return undefined;
}

function getServerStats(): ServerResourceStats {
  const mem = process.memoryUsage();
  return {
    pid: process.pid,
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    },
    uptime: process.uptime(),
  };
}

function getSystemStats(): SystemResourceStats {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadAvg: os.loadavg(),
  };
}

function getProcessStats(): ProcessResourceStats[] {
  const stats: ProcessResourceStats[] = [];

  // Active query processes (Claude Agent SDK workers)
  const activeProcesses = getActiveProcesses();
  for (const [sessionId, active] of activeProcesses.entries()) {
    if (active.process.pid) {
      stats.push({
        id: sessionId,
        pid: active.process.pid,
        type: "query",
        name: "Claude Agent",
        memory: getProcessMemory(active.process.pid),
        cpu: getProcessCpu(active.process.pid),
      });
    }
  }

  // Background processes
  const bgProcesses = getBackgroundProcesses();
  for (const proc of bgProcesses) {
    if (proc.pid) {
      stats.push({
        id: proc.id,
        pid: proc.pid,
        type: proc.type,
        name: proc.label || proc.command || proc.type,
        memory: getProcessMemory(proc.pid),
        cpu: getProcessCpu(proc.pid),
      });
    }
  }

  return stats;
}

export async function handleResourceRoutes(
  url: URL,
  method: string,
  _req: Request
): Promise<Response | null> {
  // GET /api/resources - Get all resource stats
  if (url.pathname === "/api/resources" && method === "GET") {
    const stats: ResourceStats = {
      timestamp: Date.now(),
      server: getServerStats(),
      system: getSystemStats(),
      processes: getProcessStats(),
    };
    return json(stats);
  }

  // GET /api/resources/server - Just server stats (lightweight)
  if (url.pathname === "/api/resources/server" && method === "GET") {
    return json(getServerStats());
  }

  // GET /api/resources/system - Just system stats
  if (url.pathname === "/api/resources/system" && method === "GET") {
    return json(getSystemStats());
  }

  // GET /api/resources/processes - Just process stats
  if (url.pathname === "/api/resources/processes" && method === "GET") {
    return json(getProcessStats());
  }

  return null;
}
