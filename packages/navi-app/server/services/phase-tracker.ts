/**
 * Phase Tracker - Infers conversation phase using Haiku
 *
 * Uses a cheap, fast LLM (Haiku) to classify what phase the conversation is in.
 * Runs asynchronously and never blocks the main query flow.
 */

import Anthropic from "@anthropic-ai/sdk";
import { sessions, messages, type Message } from "../db";
import { registerQueryHook, type QueryHookContext } from "./query-hooks";
import { resolveNaviClaudeAuth } from "../utils/navi-auth";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConversationPhase =
  | "idle"              // No active work
  | "planning"          // Discussing approach, no code yet
  | "awaiting_approval" // Plan proposed, waiting for user OK
  | "building"          // Actively writing/editing code
  | "reviewing"         // Code written, discussing results
  | "debugging"         // Fixing issues
  | "compacting";       // Summarizing/cleaning up context

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `You are classifying the current phase of a coding conversation.

Based on the last few messages, determine which phase the conversation is in:

- idle: Conversation paused, no active work, or just finished
- planning: Discussing approach, architecture, or strategy. No code written yet
- awaiting_approval: A plan or approach was proposed. Waiting for user to say "go ahead", "yes", "do it", etc.
- building: Actively writing, editing, or creating code/files
- reviewing: Implementation done, discussing results or asking for feedback
- debugging: Fixing bugs, errors, or issues
- compacting: Summarizing work, cleaning up context, or preparing handoff

Output ONLY the phase name, nothing else.`;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;

  const auth = resolveNaviClaudeAuth();
  if (auth.mode === "oauth") {
    // Can't use direct SDK with OAuth, skip phase tracking
    return null;
  }

  if (auth.overrides.apiKey) {
    anthropicClient = new Anthropic({
      apiKey: auth.overrides.apiKey,
      baseURL: auth.overrides.baseUrl || undefined,
    });
    return anthropicClient;
  }

  return null;
}

/**
 * Classify conversation phase using Haiku.
 * Returns null if classification fails (graceful degradation).
 */
async function classifyPhase(recentMessages: Message[]): Promise<ConversationPhase | null> {
  const client = getClient();
  if (!client) return null;

  if (recentMessages.length === 0) return "idle";

  // Format last 5 messages for context
  const contextMessages = recentMessages.slice(-5).map((m) => {
    const content = typeof m.content === "string"
      ? tryParseContent(m.content)
      : m.content;
    const preview = typeof content === "string"
      ? content.slice(0, 500)
      : JSON.stringify(content).slice(0, 500);
    return `[${m.role}]: ${preview}`;
  }).join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 20,
      system: CLASSIFICATION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Recent messages:\n\n${contextMessages}\n\nPhase:`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const phase = textBlock.text.trim().toLowerCase() as ConversationPhase;

    // Validate it's a known phase
    const validPhases: ConversationPhase[] = [
      "idle", "planning", "awaiting_approval", "building",
      "reviewing", "debugging", "compacting"
    ];
    if (validPhases.includes(phase)) {
      return phase;
    }

    console.warn(`[PhaseTracker] Unknown phase: ${textBlock.text}`);
    return null;
  } catch (err) {
    console.error("[PhaseTracker] Classification error:", err);
    return null;
  }
}

function tryParseContent(content: string): string | object {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast
// ─────────────────────────────────────────────────────────────────────────────

type PhaseBroadcastFn = (sessionId: string, phase: ConversationPhase) => void;

let broadcastFn: PhaseBroadcastFn | null = null;

/**
 * Set the broadcast function for phase updates.
 * Called from websocket handler to wire up the broadcast.
 */
export function setPhaseUpdateBroadcast(fn: PhaseBroadcastFn): void {
  broadcastFn = fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The actual hook that runs on query events.
 */
async function phaseTrackerHook(ctx: QueryHookContext): Promise<void> {
  const { sessionId, event } = ctx;

  // Determine phase based on event
  let phase: ConversationPhase | null = null;

  if (event === "start") {
    // Query starting - likely building or continuing previous phase
    phase = await classifyPhase(ctx.messages);
  } else if (event === "complete") {
    // Query done - classify based on final state
    // Refresh messages to include the latest assistant response
    const freshMessages = messages.listBySession(sessionId);
    phase = await classifyPhase(freshMessages);
  } else if (event === "error") {
    // Error occurred - probably debugging needed
    phase = "debugging";
  }

  if (phase) {
    // Update database
    sessions.updateConversationPhase(phase, sessionId);

    // Broadcast to connected clients
    if (broadcastFn) {
      broadcastFn(sessionId, phase);
    }

    console.log(`[PhaseTracker] Session ${sessionId.slice(0, 8)}... → ${phase}`);
  }
}

/**
 * Initialize the phase tracker by registering the hook.
 * Call this once at server startup.
 */
export function initPhaseTracker(): void {
  registerQueryHook(phaseTrackerHook);
  console.log("[PhaseTracker] Initialized");
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual API (for testing or UI triggers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manually trigger phase classification for a session.
 */
export async function refreshPhase(sessionId: string): Promise<ConversationPhase | null> {
  const sessionMessages = messages.listBySession(sessionId);
  const phase = await classifyPhase(sessionMessages);

  if (phase) {
    sessions.updateConversationPhase(phase, sessionId);
    if (broadcastFn) {
      broadcastFn(sessionId, phase);
    }
  }

  return phase;
}
