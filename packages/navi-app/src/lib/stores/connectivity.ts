import { writable, derived, get } from "svelte/store";
import { getServerUrl } from "../config";

export type ConnectionStatus = "online" | "offline" | "server-down" | "checking";

export interface ConnectivityState {
  /** Browser's navigator.onLine status */
  browserOnline: boolean;
  /** Whether we can reach the Navi server */
  serverReachable: boolean;
  /** Whether we can reach external internet (Anthropic API) */
  internetReachable: boolean;
  /** Last successful health check timestamp */
  lastCheck: number | null;
  /** Whether we're currently checking connectivity */
  checking: boolean;
  /** Number of consecutive failures */
  failureCount: number;
}

const initialState: ConnectivityState = {
  browserOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  serverReachable: true, // Optimistic
  internetReachable: true, // Optimistic
  lastCheck: null,
  checking: false,
  failureCount: 0,
};

const { subscribe, set, update } = writable<ConnectivityState>(initialState);

// Internal readable store for derived stores to use
const internalStore = { subscribe };

// Derived status for easy consumption
export const connectionStatus = derived<typeof internalStore, ConnectionStatus>(
  internalStore,
  ($state) => {
    if ($state.checking && $state.lastCheck === null) return "checking";
    if (!$state.browserOnline) return "offline";
    if (!$state.serverReachable) return "server-down";
    if (!$state.internetReachable) return "offline";
    return "online";
  }
);

// Simple boolean for quick checks
export const isOnline = derived(connectionStatus, ($status) => $status === "online");

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let cleanupListeners: (() => void) | null = null;

async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getServerUrl()}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

async function checkInternetHealth(): Promise<boolean> {
  // We check if we can reach the server's internet check endpoint
  // This is better than hitting external URLs directly (CORS issues)
  try {
    const res = await fetch(`${getServerUrl()}/api/health/internet`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.online === true;
  } catch {
    // If we can't reach our server, assume internet is also down
    return false;
  }
}

async function performHealthCheck(): Promise<void> {
  const state = get({ subscribe });

  // Don't stack checks
  if (state.checking) return;

  update((s) => ({ ...s, checking: true }));

  const serverOk = await checkServerHealth();
  let internetOk = true;

  // Only check internet if server is reachable
  if (serverOk) {
    internetOk = await checkInternetHealth();
  }

  update((s) => ({
    ...s,
    serverReachable: serverOk,
    internetReachable: serverOk ? internetOk : s.internetReachable,
    lastCheck: Date.now(),
    checking: false,
    failureCount: serverOk && internetOk ? 0 : s.failureCount + 1,
  }));
}

function handleOnline(): void {
  update((s) => ({ ...s, browserOnline: true }));
  // Immediately check when we come back online
  performHealthCheck();
}

function handleOffline(): void {
  update((s) => ({
    ...s,
    browserOnline: false,
    serverReachable: false,
    internetReachable: false,
  }));
}

/**
 * Start monitoring connectivity
 * Call this once when the app initializes
 */
export function startConnectivityMonitoring(intervalMs: number = 30000): void {
  // Clean up any existing monitoring
  stopConnectivityMonitoring();

  // Set up browser online/offline listeners
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    cleanupListeners = () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };

    // Update initial browser state
    update((s) => ({ ...s, browserOnline: navigator.onLine }));
  }

  // Initial check
  performHealthCheck();

  // Periodic checks
  healthCheckInterval = setInterval(performHealthCheck, intervalMs);
}

/**
 * Stop monitoring connectivity
 */
export function stopConnectivityMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  if (cleanupListeners) {
    cleanupListeners();
    cleanupListeners = null;
  }
}

/**
 * Manually trigger a connectivity check
 */
export async function checkConnectivity(): Promise<void> {
  await performHealthCheck();
}

/**
 * Check if a fetch error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("load failed") ||
      message.includes("networkerror")
    );
  }
  return false;
}

/**
 * Handle a network error by updating connectivity state and triggering a check
 */
export function handleNetworkError(error: unknown): void {
  if (isNetworkError(error)) {
    update((s) => ({
      ...s,
      failureCount: s.failureCount + 1,
    }));
    // Trigger a full check
    performHealthCheck();
  }
}

export const connectivityStore = {
  subscribe,
  checkConnectivity,
  startMonitoring: startConnectivityMonitoring,
  stopMonitoring: stopConnectivityMonitoring,
  handleNetworkError,
  isNetworkError,
};
