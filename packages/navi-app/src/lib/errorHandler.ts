import { notifications } from "./stores";
import { writable } from "svelte/store";

export interface ErrorReport {
  title: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: Date;
}

// Store for queued error reports - when user clicks "Report", this gets populated
export const pendingErrorReport = writable<ErrorReport | null>(null);

interface ShowErrorOptions {
  title?: string;
  message: string;
  error?: Error | unknown;
  context?: Record<string, unknown>;
  persistent?: boolean;
  reportable?: boolean;
}

/**
 * Show an error toast with optional "Report" action
 */
export function showError(options: ShowErrorOptions): string {
  const {
    title = "Error",
    message,
    error,
    context,
    persistent = false,
    reportable = true,
  } = options;

  // Extract error details
  const errorMessage = error instanceof Error ? error.message : String(error ?? message);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log to console for debugging
  console.error(`[${title}]`, message, error ?? "");

  // Build notification actions
  const actions: { label: string; variant?: "primary" | "secondary" | "danger"; handler: () => void }[] = [];

  if (reportable) {
    actions.push({
      label: "Report",
      variant: "primary",
      handler: () => {
        pendingErrorReport.set({
          title: title,
          message: errorMessage,
          stack: errorStack,
          context,
          timestamp: new Date(),
        });
      },
    });
  }

  // Show notification
  return notifications.add({
    type: "error",
    title,
    message: truncateMessage(message, 150),
    persistent,
    actions,
  });
}

/**
 * Show a warning toast
 */
export function showWarning(options: Omit<ShowErrorOptions, "reportable">): string {
  const { title = "Warning", message, persistent = false } = options;

  console.warn(`[${title}]`, message);

  return notifications.add({
    type: "warning",
    title,
    message: truncateMessage(message, 150),
    persistent,
  });
}

/**
 * Show a success toast
 */
export function showSuccess(title: string, message?: string): string {
  return notifications.add({
    type: "success",
    title,
    message: message ? truncateMessage(message, 150) : undefined,
  });
}

/**
 * Show an info toast
 */
export function showInfo(title: string, message?: string): string {
  return notifications.add({
    type: "info",
    title,
    message: message ? truncateMessage(message, 150) : undefined,
  });
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorTitle: string = "Error"
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      showError({
        title: errorTitle,
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        error,
      });
      throw error; // Re-throw so caller can handle if needed
    }
  }) as T;
}

/**
 * Try-catch wrapper that shows error toast on failure
 */
export async function tryWithToast<T>(
  fn: () => Promise<T>,
  errorTitle: string = "Error"
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    showError({
      title: errorTitle,
      message: error instanceof Error ? error.message : "An unexpected error occurred",
      error,
    });
    return null;
  }
}

/**
 * Setup global error handlers for uncaught errors
 */
export function setupGlobalErrorHandlers(): () => void {
  const handleError = (event: ErrorEvent) => {
    // Ignore ResizeObserver errors - they're usually benign
    if (event.message?.includes("ResizeObserver")) {
      return;
    }

    showError({
      title: "Unexpected Error",
      message: event.message || "An unknown error occurred",
      error: event.error,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason;

    // Don't show toast for aborted requests
    if (error?.name === "AbortError") {
      return;
    }

    showError({
      title: "Unhandled Error",
      message: error instanceof Error ? error.message : String(error ?? "Promise rejected"),
      error,
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  // Return cleanup function
  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}

/**
 * Helper to truncate long messages for toast display
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength - 3) + "...";
}

/**
 * Format an error report for the feedback form
 */
export function formatErrorForReport(report: ErrorReport): { title: string; description: string } {
  let description = `## Error Details\n\n`;
  description += `**Message:** ${report.message}\n\n`;

  if (report.stack) {
    description += `**Stack Trace:**\n\`\`\`\n${report.stack.slice(0, 1000)}\n\`\`\`\n\n`;
  }

  if (report.context && Object.keys(report.context).length > 0) {
    description += `**Context:**\n\`\`\`json\n${JSON.stringify(report.context, null, 2)}\n\`\`\`\n\n`;
  }

  description += `**Timestamp:** ${report.timestamp.toISOString()}\n`;

  return {
    title: `Bug: ${report.title}`,
    description,
  };
}
