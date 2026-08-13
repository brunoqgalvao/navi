declare global {
  interface Window {
    __NAVI_SERVER_PORT__?: number;
    __NAVI_PTY_PORT__?: number;
  }
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
export const DEV_SERVER_PORT = ENV_SERVER_PORT || 3021;
export const DEV_PTY_PORT = ENV_PTY_PORT || 3022;
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

  const baseServerPort = DEV_SERVER_PORT;
  const basePtyPort = DEV_PTY_PORT;

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
  return DEV_SERVER_PORT;
}

function getPtyServerPort(): number {
  if (typeof window !== "undefined" && window.__NAVI_PTY_PORT__) {
    return window.__NAVI_PTY_PORT__;
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
    // PTY runs on 3022 inside the container
    return `${protocol}//${window.location.hostname}:3022`;
  }
  const port = getPtyServerPort();
  return `ws://localhost:${port}`;
}

export function getPtyApiUrl(): string {
  if (IS_PREVIEW_MODE && typeof window !== "undefined") {
    return `http://${window.location.hostname}:3022`;
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

export { portsDiscovered };
