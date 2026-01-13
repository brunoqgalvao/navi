declare global {
  interface Window {
    __TAURI__?: unknown;
    __NAVI_SERVER_PORT__?: number;
    __NAVI_PTY_PORT__?: number;
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: unknown) => Promise<unknown>;
    };
  }
}

function isTauri(): boolean {
  if (typeof window !== "undefined") {
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      return true;
    }
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.userAgent === "string" &&
      navigator.userAgent.includes("Tauri")
    ) {
      return true;
    }
  }
  return typeof import.meta !== "undefined" && !!import.meta.env?.TAURI_PLATFORM;
}

// Check for environment-injected ports (for Docker preview containers)
// These are set via VITE_NAVI_SERVER_PORT and VITE_NAVI_PTY_PORT env vars
const ENV_SERVER_PORT = typeof import.meta !== "undefined"
  ? parseInt(import.meta.env?.VITE_NAVI_SERVER_PORT || "0") || 0
  : 0;
const ENV_PTY_PORT = typeof import.meta !== "undefined"
  ? parseInt(import.meta.env?.VITE_NAVI_PTY_PORT || "0") || 0
  : 0;

// Check if running in a Navi preview container (NAVI_PREVIEW=true)
// In preview mode, both frontend and backend run in the same container
// Frontend uses relative URLs that go through Vite's proxy
const IS_PREVIEW_MODE = typeof import.meta !== "undefined"
  ? import.meta.env?.VITE_NAVI_PREVIEW === "true"
  : false;

// Use environment-injected ports or defaults
// Note: In preview mode, Vite proxy handles routing to the server
export const DEV_SERVER_PORT = ENV_SERVER_PORT || 3001;
export const DEV_PTY_PORT = ENV_PTY_PORT || 3002;
export const BUNDLED_SERVER_PORT = 3011;
export const BUNDLED_PTY_PORT = 3012;
const PORT_SCAN_RANGE = 10;

let portsDiscovered = false;

async function probeServerPort(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok" && data.port !== undefined;
  } catch {
    return false;
  }
}

async function probePtyPort(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok" && data.terminals !== undefined;
  } catch {
    return false;
  }
}

export async function discoverPorts(): Promise<{ server: number; pty: number }> {
  if (portsDiscovered) {
    return { server: getServerPort(), pty: getPtyServerPort() };
  }

  const baseServerPort = isTauri() ? BUNDLED_SERVER_PORT : DEV_SERVER_PORT;
  const basePtyPort = isTauri() ? BUNDLED_PTY_PORT : DEV_PTY_PORT;

  let serverPort = baseServerPort;
  let ptyPort = basePtyPort;

  for (let i = 0; i < PORT_SCAN_RANGE; i++) {
    if (await probeServerPort(baseServerPort + i)) {
      serverPort = baseServerPort + i;
      break;
    }
  }

  for (let i = 0; i < PORT_SCAN_RANGE; i++) {
    if (await probePtyPort(basePtyPort + i)) {
      ptyPort = basePtyPort + i;
      break;
    }
  }

  setServerPort(serverPort);
  setPtyServerPort(ptyPort);
  portsDiscovered = true;

  return { server: serverPort, pty: ptyPort };
}

function getServerPort(): number {
  if (typeof window !== "undefined" && window.__NAVI_SERVER_PORT__) {
    return window.__NAVI_SERVER_PORT__;
  }
  if (isTauri()) {
    return BUNDLED_SERVER_PORT;
  }
  return DEV_SERVER_PORT;
}

function getPtyServerPort(): number {
  if (typeof window !== "undefined" && window.__NAVI_PTY_PORT__) {
    return window.__NAVI_PTY_PORT__;
  }
  if (isTauri()) {
    return BUNDLED_PTY_PORT;
  }
  return DEV_PTY_PORT;
}

export function getApiBase(): string {
  // In preview mode, use relative URLs that go through Vite's proxy
  if (IS_PREVIEW_MODE) {
    return "/api";
  }
  const port = getServerPort();
  return `http://localhost:${port}/api`;
}

export function getWsUrl(): string {
  // In preview mode, construct WebSocket URL relative to current host
  if (IS_PREVIEW_MODE && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }
  const port = getServerPort();
  return `ws://localhost:${port}/ws`;
}

export function getPtyWsUrl(): string {
  // PTY is not proxied in preview mode - use internal port
  if (IS_PREVIEW_MODE && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // PTY runs on 3002 inside the container
    return `${protocol}//${window.location.hostname}:3002`;
  }
  const port = getPtyServerPort();
  return `ws://localhost:${port}`;
}

export function getPtyApiUrl(): string {
  if (IS_PREVIEW_MODE && typeof window !== "undefined") {
    return `http://${window.location.hostname}:3002`;
  }
  const port = getPtyServerPort();
  return `http://localhost:${port}`;
}

export function getServerUrl(): string {
  if (IS_PREVIEW_MODE) {
    return "";  // Use relative URLs
  }
  const port = getServerPort();
  return `http://localhost:${port}`;
}

export function setServerPort(port: number): void {
  if (typeof window !== "undefined") {
    window.__NAVI_SERVER_PORT__ = port;
  }
}

export function setPtyServerPort(port: number): void {
  if (typeof window !== "undefined") {
    window.__NAVI_PTY_PORT__ = port;
  }
}

export { isTauri };
export { portsDiscovered };
