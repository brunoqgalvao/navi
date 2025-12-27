declare global {
  interface Window {
    __TAURI__?: unknown;
    __NAVI_SERVER_PORT__?: number;
    __NAVI_PTY_PORT__?: number;
  }
}

function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI__;
}

function getServerPort(): number {
  if (typeof window !== "undefined" && window.__NAVI_SERVER_PORT__) {
    return window.__NAVI_SERVER_PORT__;
  }
  return 3001;
}

function getPtyServerPort(): number {
  if (typeof window !== "undefined" && window.__NAVI_PTY_PORT__) {
    return window.__NAVI_PTY_PORT__;
  }
  return 3002;
}

export function getApiBase(): string {
  const port = getServerPort();
  return `http://localhost:${port}/api`;
}

export function getWsUrl(): string {
  const port = getServerPort();
  return `ws://localhost:${port}/ws`;
}

export function getPtyWsUrl(): string {
  const port = getPtyServerPort();
  return `ws://localhost:${port}`;
}

export function getPtyApiUrl(): string {
  const port = getPtyServerPort();
  return `http://localhost:${port}`;
}

export function getServerUrl(): string {
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
