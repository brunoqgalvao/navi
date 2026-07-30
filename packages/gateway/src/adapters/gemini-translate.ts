/**
 * gemini-translate.ts — pure translation functions from Gemini ACP protocol
 * events to GatewayEvents.
 *
 * All functions are side-effect-free and unit-testable without spawning a process.
 *
 * Protocol: Agent Client Protocol (ACP) over stdio JSON-RPC 2.0.
 * See: docs/gemini-spike.md for raw samples and decision rationale.
 */

import type { GatewayEvent, PermissionDecision } from "../events.js";

// ── Protocol types (inlined from ACP spike evidence) ─────────────────────────

/** Content block as emitted in session/update notifications */
export type AcpContentBlock =
  | { type: "text"; text: string }
  | { type: string; [key: string]: unknown };

/** ToolCall / ToolCallUpdate from session/update notifications */
export type AcpToolCallUpdate = {
  toolCallId: string;
  status?: "pending" | "in_progress" | "completed" | "failed" | string;
  title?: string;
  content?: Array<{ type: "content"; content: AcpContentBlock } | { type: "diff" | "terminal"; [k: string]: unknown }>;
  locations?: Array<{ path: string; line?: number | null }>;
  kind?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
};

/** SessionUpdate discriminated union (partial — only types we translate) */
export type AcpSessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: AcpContentBlock; messageId?: string | null }
  | { sessionUpdate: "agent_thought_chunk"; content: AcpContentBlock; messageId?: string | null }
  | { sessionUpdate: "tool_call"; toolCallId: string; title?: string; status?: string; kind?: string; rawInput?: unknown; content?: unknown[]; locations?: unknown[] }
  | { sessionUpdate: "tool_call_update" } & AcpToolCallUpdate
  | { sessionUpdate: string; [key: string]: unknown };

/** session/request_permission params */
export type AcpPermissionRequestParams = {
  sessionId: string;
  options: Array<{
    optionId: string;
    name?: string;
    kind?: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
  }>;
  toolCall: AcpToolCallUpdate;
};

/** StopReason as returned in session/prompt response */
export type AcpStopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled" | string;

// ── Permission decision mapping ───────────────────────────────────────────────

/**
 * Map gateway PermissionDecision to an ACP optionId from the available options.
 *
 * - allow       → first `allow_once` option, or `proceed_once` by convention
 * - allow-session → first `allow_always` option, or `proceed_always` by convention
 * - deny        → first `reject_once` option, or `cancel` by convention
 */
export function toAcpOutcome(
  decision: PermissionDecision,
  options: AcpPermissionRequestParams["options"]
): { outcome: "selected"; optionId: string } | { outcome: "cancelled" } {
  switch (decision) {
    case "allow": {
      // Only match allow_once or a well-known optionId — never over-grant.
      // If neither is present, return cancelled (adapter resolves gateway side safely).
      const opt =
        options.find((o) => o.kind === "allow_once") ??
        options.find((o) => o.optionId === "proceed_once");
      if (!opt) return { outcome: "cancelled" };
      return { outcome: "selected", optionId: opt.optionId };
    }
    case "allow-session": {
      // allow_always is the session-scoped grant in ACP (confirmed in spike doc:
      // "proceed_always" = allow always for this tool). Fall back to allow-once
      // if no allow_always option is present — never select a broader option
      // (allow_always_server) over the intended one.
      const opt =
        options.find((o) => o.kind === "allow_always") ??
        options.find((o) => o.optionId === "proceed_always");
      if (!opt) {
        // No allow_always option — fall back to allow-once
        return toAcpOutcome("allow", options);
      }
      return { outcome: "selected", optionId: opt.optionId };
    }
    case "deny": {
      // Map to cancel outcome — rejected
      return { outcome: "cancelled" };
    }
  }
}

/**
 * Build the auto-accept outcome for acceptAll mode.
 * Uses first allow_always option, falls back to allow_once.
 */
export function autoAcceptOutcome(
  options: AcpPermissionRequestParams["options"]
): { outcome: "selected"; optionId: string } | { outcome: "cancelled" } {
  const opt =
    options.find((o) => o.kind === "allow_always") ??
    options.find((o) => o.kind === "allow_once") ??
    options[0];
  if (!opt) return { outcome: "cancelled" };
  return { outcome: "selected", optionId: opt.optionId };
}

// ── SessionUpdate → GatewayEvents ────────────────────────────────────────────

/**
 * Translate an `agent_message_chunk` session update to a text-delta event.
 */
export function agentMessageChunkToEvent(
  update: { content: AcpContentBlock },
  sessionId: string
): GatewayEvent | null {
  if (update.content.type !== "text") return null;
  const text = (update.content as { type: "text"; text: string }).text;
  if (typeof text !== "string") return null;
  return { type: "text-delta", sessionId, text };
}

/**
 * Translate an `agent_thought_chunk` session update to a thinking-delta event.
 */
export function agentThoughtChunkToEvent(
  update: { content: AcpContentBlock },
  sessionId: string
): GatewayEvent | null {
  if (update.content.type !== "text") return null;
  const text = (update.content as { type: "text"; text: string }).text;
  if (typeof text !== "string") return null;
  return { type: "thinking-delta", sessionId, text };
}

/**
 * Translate a `tool_call` session update to a tool-start event.
 * Gemini uses `tool_call` to announce a new tool call.
 */
export function toolCallToStartEvent(
  update: AcpSessionUpdate & { sessionUpdate: "tool_call" },
  sessionId: string
): GatewayEvent {
  // Cast to the concrete tool_call variant — the union intersection doesn't narrow automatically.
  const u = update as Extract<AcpSessionUpdate, { sessionUpdate: "tool_call" }>;
  return {
    type: "tool-start",
    sessionId,
    toolId: u.toolCallId,
    tool: u.title ?? u.toolCallId,
    input: u.rawInput ?? null,
  };
}

/**
 * Translate a `tool_call_update` session update.
 *
 * - status "in_progress" with content → tool-output
 * - status "completed" → tool-end (isError=false)
 * - status "failed" → tool-end (isError=true)
 * - status "pending" → tool-start (gemini sometimes skips tool_call)
 * - other / no status → ignored (returns null)
 */
export function toolCallUpdateToEvents(
  update: AcpToolCallUpdate & { sessionUpdate: "tool_call_update" },
  sessionId: string
): GatewayEvent[] {
  const events: GatewayEvent[] = [];
  const toolId = update.toolCallId;
  const status = update.status ?? "";

  if (status === "pending") {
    // Gemini sometimes goes straight to tool_call_update without a prior tool_call
    events.push({
      type: "tool-start",
      sessionId,
      toolId,
      tool: update.title ?? toolId,
      input: update.rawInput ?? null,
    });
    return events;
  }

  if (status === "in_progress") {
    // Extract text content as output chunks
    for (const item of update.content ?? []) {
      if (item.type === "content") {
        const block = (item as { type: "content"; content: AcpContentBlock }).content;
        if (block.type === "text") {
          const chunk = (block as { type: "text"; text: string }).text;
          if (chunk) {
            events.push({ type: "tool-output", sessionId, toolId, chunk });
          }
        }
      }
    }
    return events;
  }

  if (status === "completed") {
    events.push({
      type: "tool-end",
      sessionId,
      toolId,
      result: update.rawOutput ?? null,
      isError: false,
    });
    return events;
  }

  if (status === "failed") {
    // Extract error message from content if present
    let errorMsg: string | undefined;
    for (const item of update.content ?? []) {
      if (item.type === "content") {
        const block = (item as { type: "content"; content: AcpContentBlock }).content;
        if (block.type === "text") {
          errorMsg = (block as { type: "text"; text: string }).text;
          break;
        }
      }
    }
    events.push({
      type: "tool-end",
      sessionId,
      toolId,
      result: errorMsg ? { error: errorMsg } : null,
      isError: true,
    });
    return events;
  }

  return events;
}

/**
 * Translate a session/request_permission server request to a permission-request event.
 */
export function permissionRequestToEvent(
  params: AcpPermissionRequestParams,
  requestId: string,
  sessionId: string
): GatewayEvent {
  const toolId = params.toolCall.toolCallId;
  const toolName = params.toolCall.title ?? toolId;
  const description = `${toolName} is requesting permission`;

  // Determine which gateway options to surface
  // Any allow_always option in params → include "allow-session"
  const hasAllowAlways = params.options.some((o) => o.kind === "allow_always");

  return {
    type: "permission-request",
    sessionId,
    requestId,
    tool: toolName,
    description,
    input: {
      toolCallId: toolId,
      kind: params.toolCall.kind,
      locations: params.toolCall.locations,
    },
    options: hasAllowAlways
      ? ["allow", "allow-session", "deny"]
      : ["allow", "deny"],
  };
}

/**
 * Map stopReason from session/prompt response to gateway done reason.
 *
 * Mapping rationale:
 * - "end_turn"          → complete  (normal completion)
 * - "max_tokens"        → complete  (token limit hit, but output was produced; caller
 *                                    can tell via context length, not an error)
 * - "max_turn_requests" → complete  (turn depth limit, similar to max_tokens)
 * - "refusal"           → complete  (the agent chose to decline — this is a successful
 *                                    agentic decision, not a transport/system error;
 *                                    the agent will have emitted a text message explaining
 *                                    the refusal so the consumer already has the signal)
 * - "cancelled"         → cancelled (explicit user/client cancel)
 * - anything else       → error     (unknown stop reasons are not silently swallowed;
 *                                    fail loud so unexpected protocol values surface)
 */
export function stopReasonToDoneReason(
  stopReason: AcpStopReason
): "complete" | "cancelled" | "error" {
  switch (stopReason) {
    case "end_turn":
    case "max_tokens":
    case "max_turn_requests":
    case "refusal":
      return "complete";
    case "cancelled":
      return "cancelled";
    default:
      // Unknown stop reason — map to error so callers notice unexpected values
      // rather than silently completing. This is intentional "fail loud" behaviour.
      return "error";
  }
}
