/**
 * Telemetry Service
 *
 * Tracks usage analytics (local) and crash reports (cloud).
 * Respects user opt-out preference stored in localStorage.
 */

// Cloud endpoint for crash reports
const CRASH_ENDPOINT = "https://navi-landing-639638599480.us-central1.run.app/api/telemetry/crash";
const EVENTS_ENDPOINT = "https://navi-landing-639638599480.us-central1.run.app/api/telemetry/events";

// App version from package.json (injected at build time or fallback)
const APP_VERSION = typeof import.meta !== "undefined"
  ? import.meta.env?.VITE_APP_VERSION || "1.8.1"
  : "1.8.1";

// Local storage keys
const DEVICE_ID_KEY = "navi_device_id";
const TELEMETRY_OPT_OUT_KEY = "navi_telemetry_opt_out";
const EVENT_QUEUE_KEY = "navi_event_queue";

// Session ID for this app session
let sessionId: string | null = null;

// Event batching
const EVENT_BATCH_SIZE = 10;
const EVENT_FLUSH_INTERVAL = 60000; // 1 minute
let eventQueue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  sessionId?: string;
  timestamp?: number;
}

export interface CrashReport {
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Get or create a persistent device ID
 */
function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "unknown";

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    // Generate a random ID (not UUID to reduce fingerprinting)
    deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Get session ID for this app session
 */
function getSessionId(): string {
  if (!sessionId) {
    sessionId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return sessionId;
}

/**
 * Check if telemetry is enabled (user hasn't opted out)
 */
export function isTelemetryEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) !== "true";
}

/**
 * Set telemetry opt-out preference
 */
export function setTelemetryOptOut(optOut: boolean): void {
  if (typeof localStorage === "undefined") return;

  if (optOut) {
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, "true");
    // Clear any pending events
    eventQueue = [];
    localStorage.removeItem(EVENT_QUEUE_KEY);
  } else {
    localStorage.removeItem(TELEMETRY_OPT_OUT_KEY);
  }
}

/**
 * Get system info for crash reports
 */
function getSystemInfo(): Record<string, unknown> {
  const info: Record<string, unknown> = {};

  if (typeof navigator !== "undefined") {
    info.userAgent = navigator.userAgent;
    info.platform = navigator.platform;
    info.language = navigator.language;
  }

  if (typeof window !== "undefined") {
    info.screenWidth = window.screen?.width;
    info.screenHeight = window.screen?.height;
    info.devicePixelRatio = window.devicePixelRatio;
  }

  // Detect if running in Tauri
  if (typeof window !== "undefined" && (window.__TAURI__ || window.__TAURI_INTERNALS__)) {
    info.runtime = "tauri";
  } else {
    info.runtime = "browser";
  }

  return info;
}

/**
 * Parse OS info from user agent
 */
function parseOsInfo(): { os: string; osVersion: string; arch: string } {
  if (typeof navigator === "undefined") {
    return { os: "unknown", osVersion: "unknown", arch: "unknown" };
  }

  const ua = navigator.userAgent;
  let os = "unknown";
  let osVersion = "unknown";
  let arch = "unknown";

  // Detect OS
  if (ua.includes("Mac OS X")) {
    os = "macos";
    const match = ua.match(/Mac OS X ([\d_]+)/);
    if (match) osVersion = match[1].replace(/_/g, ".");
  } else if (ua.includes("Windows")) {
    os = "windows";
    const match = ua.match(/Windows NT ([\d.]+)/);
    if (match) osVersion = match[1];
  } else if (ua.includes("Linux")) {
    os = "linux";
  }

  // Detect arch (rough)
  if (ua.includes("arm64") || ua.includes("aarch64")) {
    arch = "arm64";
  } else if (ua.includes("x86_64") || ua.includes("x64") || ua.includes("Win64")) {
    arch = "x64";
  }

  return { os, osVersion, arch };
}

/**
 * Report a crash/error to the cloud endpoint
 * This is sent immediately, not batched
 */
export async function reportCrash(report: CrashReport): Promise<void> {
  if (!isTelemetryEnabled()) return;

  const { os, osVersion, arch } = parseOsInfo();

  const payload = {
    deviceId: getDeviceId(),
    appVersion: APP_VERSION,
    os,
    osVersion,
    arch,
    errorType: report.errorType,
    message: report.message,
    stack: report.stack,
    context: {
      ...report.context,
      sessionId: getSessionId(),
      systemInfo: getSystemInfo(),
    },
  };

  try {
    await fetch(CRASH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Silently fail - don't crash while reporting a crash
    console.warn("[Telemetry] Failed to report crash:", err);
  }
}

/**
 * Track a usage event
 * Events are batched and sent periodically
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!isTelemetryEnabled()) return;

  const event: TelemetryEvent = {
    name,
    properties,
    sessionId: getSessionId(),
    timestamp: Date.now(),
  };

  eventQueue.push(event);

  // Flush if batch is full
  if (eventQueue.length >= EVENT_BATCH_SIZE) {
    flushEvents();
  }

  // Start flush timer if not already running
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushEvents();
    }, EVENT_FLUSH_INTERVAL);
  }
}

/**
 * Flush pending events to the server
 */
export async function flushEvents(): Promise<void> {
  if (!isTelemetryEnabled() || eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const payload = {
    deviceId: getDeviceId(),
    appVersion: APP_VERSION,
    events: events.map((e) => ({
      name: e.name,
      properties: e.properties,
      sessionId: e.sessionId,
    })),
  };

  try {
    await fetch(EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // On failure, restore events to queue (best effort)
    console.warn("[Telemetry] Failed to send events:", err);
    eventQueue = [...events, ...eventQueue];
  }
}

/**
 * Standard event names for consistency
 */
export const TelemetryEvents = {
  // Session lifecycle
  APP_STARTED: "app_started",
  APP_CLOSED: "app_closed",

  // Chat events
  MESSAGE_SENT: "message_sent",
  SESSION_CREATED: "session_created",
  SESSION_FORKED: "session_forked",

  // Feature usage
  SKILL_USED: "skill_used",
  AGENT_USED: "agent_used",
  TOOL_EXECUTED: "tool_executed",

  // UI interactions
  PROJECT_CREATED: "project_created",
  PROJECT_OPENED: "project_opened",
  PREVIEW_STARTED: "preview_started",
  WORKTREE_CREATED: "worktree_created",
  WORKTREE_MERGED: "worktree_merged",

  // Model usage
  MODEL_CHANGED: "model_changed",

  // Settings
  SETTINGS_CHANGED: "settings_changed",
  TELEMETRY_TOGGLED: "telemetry_toggled",
} as const;

/**
 * Initialize telemetry - call on app start
 */
export function initTelemetry(): void {
  if (!isTelemetryEnabled()) return;

  // Track app start
  trackEvent(TelemetryEvents.APP_STARTED, {
    ...parseOsInfo(),
    runtime: typeof window !== "undefined" && (window.__TAURI__ || window.__TAURI_INTERNALS__)
      ? "tauri"
      : "browser",
  });

  // Flush events on page unload
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      trackEvent(TelemetryEvents.APP_CLOSED);
      // Use sendBeacon for reliable delivery on unload
      if (navigator.sendBeacon && eventQueue.length > 0) {
        const payload = JSON.stringify({
          deviceId: getDeviceId(),
          appVersion: APP_VERSION,
          events: eventQueue.map((e) => ({
            name: e.name,
            properties: e.properties,
            sessionId: e.sessionId,
          })),
        });
        navigator.sendBeacon(EVENTS_ENDPOINT, payload);
      }
    });

    // Set up global error handler for crashes
    window.addEventListener("error", (event) => {
      reportCrash({
        errorType: "uncaught_error",
        message: event.message,
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
      const error = event.reason;
      reportCrash({
        errorType: "unhandled_rejection",
        message: error?.message || String(error),
        stack: error?.stack,
      });
    });
  }
}
