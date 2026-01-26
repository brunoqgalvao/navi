/**
 * Canvas Mode Constants
 *
 * Colors, sizing, and layout configuration
 * @experimental
 */

// =============================================================================
// NODE SIZING
// =============================================================================

export const NODE_DIMENSIONS = {
  workspace: { width: 280, height: 80 },
  project: { width: 240, height: 100 },
  session: { width: 220, height: 90 },
  agent: { width: 180, height: 70 },
} as const;

// =============================================================================
// NODE COLORS (Tailwind-compatible)
// =============================================================================

export const NODE_COLORS = {
  workspace: {
    bg: "bg-slate-100 dark:bg-slate-800",
    border: "border-slate-300 dark:border-slate-600",
    text: "text-slate-700 dark:text-slate-200",
  },
  project: {
    bg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-blue-200 dark:border-blue-700",
    text: "text-blue-800 dark:text-blue-200",
  },
  session: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-200 dark:border-emerald-700",
    text: "text-emerald-800 dark:text-emerald-200",
  },
  agent: {
    bg: "bg-purple-50 dark:bg-purple-900/30",
    border: "border-purple-200 dark:border-purple-700",
    text: "text-purple-800 dark:text-purple-200",
  },
} as const;

// =============================================================================
// AGENT TYPE COLORS
// =============================================================================

export const AGENT_TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  browser: {
    bg: "bg-cyan-100 dark:bg-cyan-900/40",
    text: "text-cyan-700 dark:text-cyan-300",
    icon: "🌐",
  },
  coding: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "🔧",
  },
  runner: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
    icon: "▶️",
  },
  research: {
    bg: "bg-indigo-100 dark:bg-indigo-900/40",
    text: "text-indigo-700 dark:text-indigo-300",
    icon: "🔍",
  },
  planning: {
    bg: "bg-violet-100 dark:bg-violet-900/40",
    text: "text-violet-700 dark:text-violet-300",
    icon: "📋",
  },
  reviewer: {
    bg: "bg-rose-100 dark:bg-rose-900/40",
    text: "text-rose-700 dark:text-rose-300",
    icon: "👀",
  },
  general: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-300",
    icon: "🤖",
  },
};

// =============================================================================
// STATUS COLORS
// =============================================================================

export const STATUS_COLORS: Record<string, { bg: string; text: string; pulse?: boolean }> = {
  working: {
    bg: "bg-green-500",
    text: "text-green-500",
    pulse: true,
  },
  running: {
    bg: "bg-green-500",
    text: "text-green-500",
    pulse: true,
  },
  waiting: {
    bg: "bg-yellow-500",
    text: "text-yellow-500",
  },
  permission: {
    bg: "bg-amber-500",
    text: "text-amber-500",
    pulse: true,
  },
  blocked: {
    bg: "bg-orange-500",
    text: "text-orange-500",
  },
  delivered: {
    bg: "bg-blue-500",
    text: "text-blue-500",
  },
  failed: {
    bg: "bg-red-500",
    text: "text-red-500",
  },
  archived: {
    bg: "bg-gray-400",
    text: "text-gray-400",
  },
  idle: {
    bg: "bg-gray-400",
    text: "text-gray-400",
  },
};

// =============================================================================
// LAYOUT DEFAULTS
// =============================================================================

export const DEFAULT_LAYOUT = {
  direction: "TB" as const, // Top to bottom
  nodeSpacing: 50,
  rankSpacing: 100,
};

// =============================================================================
// CANVAS DEFAULTS
// =============================================================================

export const DEFAULT_VIEWPORT = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const ZOOM_LIMITS = {
  min: 0.1,
  max: 2,
};

export const FIT_VIEW_OPTIONS = {
  padding: 0.2,
  duration: 300,
};

// =============================================================================
// EDGE STYLES
// =============================================================================

export const EDGE_STYLES = {
  hierarchy: {
    stroke: "#94a3b8", // slate-400
    strokeWidth: 2,
    animated: false,
  },
  contains: {
    stroke: "#64748b", // slate-500
    strokeWidth: 1,
    strokeDasharray: "5,5",
    animated: false,
  },
  spawned: {
    stroke: "#8b5cf6", // violet-500
    strokeWidth: 2,
    animated: true,
  },
};

// =============================================================================
// STORAGE
// =============================================================================

export const CANVAS_STORAGE_KEY = "claude-code-ui-canvas-positions";
export const CANVAS_STORAGE_VERSION = 1;
