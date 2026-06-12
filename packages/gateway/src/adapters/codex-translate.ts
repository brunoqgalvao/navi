/**
 * codex-translate.ts — pure translation functions from codex app-server
 * protocol events to GatewayEvents.
 *
 * All functions are side-effect-free and unit-testable without spawning a process.
 *
 * Types inlined from the app-server protocol; authoritative definitions in codex-protocol.gen.ts/.
 */

import type { GatewayEvent, PermissionDecision } from "../events.js";
import { normalizeUsage } from "../usage.js";

// ── Protocol types we use (inlined to avoid deep import chains) ───────────────

export type CodexApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

/** Subset of CommandExecutionRequestApprovalParams we need */
export type CommandApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  approvalId?: string | null;
  command?: string | null;
  cwd?: string | null;
  reason?: string | null;
};

/** Subset of FileChangeRequestApprovalParams we need */
export type FileChangeApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  grantRoot?: string | null;
};

/** Thread item union — only the types we translate */
export type CodexThreadItem =
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | { type: "commandExecution"; id: string; command: string; cwd: string; status: string; aggregatedOutput?: string | null; exitCode?: number | null }
  | { type: "fileChange"; id: string; changes: Array<{ path: string; kind: string }>; status: string }
  | { type: "mcpToolCall"; id: string; server: string; tool: string; status: string; arguments: unknown }
  | { type: string; id: string; [key: string]: unknown }; // catch-all

/** Subset of ThreadTokenUsage */
export type TokenUsage = {
  last: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
  };
};

// ── Permission decision mapping ───────────────────────────────────────────────

/**
 * Map gateway PermissionDecision to codex approval decision.
 */
export function toCodexDecision(decision: PermissionDecision): CodexApprovalDecision {
  switch (decision) {
    case "allow": return "accept";
    case "allow-session": return "acceptForSession";
    case "deny": return "decline";
  }
}

// ── Item → GatewayEvents ──────────────────────────────────────────────────────

/**
 * Translate an `item/started` notification to GatewayEvents.
 * Emits tool-start for command, fileChange, mcp items.
 */
export function itemStartedToEvents(
  item: CodexThreadItem,
  sessionId: string
): GatewayEvent[] {
  switch (item.type) {
    case "commandExecution": {
      const ci = item as Extract<CodexThreadItem, { type: "commandExecution" }>;
      return [
        {
          type: "tool-start",
          sessionId,
          toolId: ci.id,
          tool: "commandExecution",
          input: { command: ci.command, cwd: ci.cwd },
        },
      ];
    }
    case "fileChange": {
      const fi = item as Extract<CodexThreadItem, { type: "fileChange" }>;
      return [
        {
          type: "tool-start",
          sessionId,
          toolId: fi.id,
          tool: "fileChange",
          input: { changes: fi.changes },
        },
      ];
    }
    case "mcpToolCall": {
      const mi = item as Extract<CodexThreadItem, { type: "mcpToolCall" }>;
      return [
        {
          type: "tool-start",
          sessionId,
          toolId: mi.id,
          tool: `mcp:${mi.server}/${mi.tool}`,
          input: mi.arguments,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Translate an `item/completed` notification to GatewayEvents.
 * Emits tool-end for command, fileChange, mcp items.
 */
export function itemCompletedToEvents(
  item: CodexThreadItem,
  sessionId: string
): GatewayEvent[] {
  switch (item.type) {
    case "commandExecution": {
      const ci = item as Extract<CodexThreadItem, { type: "commandExecution" }>;
      const isError = ci.status === "failed" || (ci.exitCode !== undefined && ci.exitCode !== null && ci.exitCode !== 0);
      return [
        {
          type: "tool-end",
          sessionId,
          toolId: ci.id,
          result: { exitCode: ci.exitCode, output: ci.aggregatedOutput },
          isError,
        },
      ];
    }
    case "fileChange": {
      const fi = item as Extract<CodexThreadItem, { type: "fileChange" }>;
      const isError = fi.status === "failed";
      return [
        {
          type: "tool-end",
          sessionId,
          toolId: fi.id,
          result: { changes: fi.changes, status: fi.status },
          isError,
        },
      ];
    }
    case "mcpToolCall": {
      const mi = item as Extract<CodexThreadItem, { type: "mcpToolCall" }>;
      const isError = mi.status === "failed";
      return [
        {
          type: "tool-end",
          sessionId,
          toolId: mi.id,
          isError,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Translate a `thread/tokenUsage/updated` notification to a usage GatewayEvent.
 * model may be undefined when the notification arrives before thread/start resolves.
 */
export function tokenUsageToEvent(
  usage: TokenUsage,
  model: string | undefined,
  sessionId: string
): GatewayEvent {
  const last = usage.last;
  return {
    type: "usage",
    sessionId,
    usage: normalizeUsage(model ?? "unknown", {
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      cacheReadTokens: last.cachedInputTokens,
    }),
  };
}

/**
 * Build a permission-request GatewayEvent for a command execution approval.
 */
export function commandApprovalToEvent(
  params: CommandApprovalParams,
  requestId: string,
  sessionId: string
): GatewayEvent {
  const description =
    params.reason ??
    (params.command ? `Run command: ${params.command}` : "Codex wants to execute a command");
  return {
    type: "permission-request",
    sessionId,
    requestId,
    tool: "commandExecution",
    description,
    input: { command: params.command, cwd: params.cwd },
    options: ["allow", "allow-session", "deny"],
  };
}

/**
 * Build a permission-request GatewayEvent for a file change approval.
 */
export function fileChangeApprovalToEvent(
  params: FileChangeApprovalParams,
  requestId: string,
  sessionId: string
): GatewayEvent {
  const description =
    params.reason ??
    (params.grantRoot ? `Write access requested for: ${params.grantRoot}` : "Codex wants to apply file changes");
  return {
    type: "permission-request",
    sessionId,
    requestId,
    tool: "fileChange",
    description,
    input: { grantRoot: params.grantRoot },
    options: ["allow", "allow-session", "deny"],
  };
}
