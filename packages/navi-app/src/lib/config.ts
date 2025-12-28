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

export const DEV_SERVER_PORT = 3001;
export const DEV_PTY_PORT = 3002;
export const BUNDLED_SERVER_PORT = 3011;
export const BUNDLED_PTY_PORT = 3012;

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
