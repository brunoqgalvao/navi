import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { projects, sessions, messages, globalSettings, searchIndex, costEntries, pendingQuestions as pendingQuestionsDb, kanbanCards, sessionHierarchy, sessionDecisions } from "../db";
import { sessionManager, type SessionEvent } from "../services/session-manager";
import { captureStreamEvent, mergeThinkingBlocks, deleteStreamCapture } from "../services/stream-capture";
import { generateChatTitle } from "../services/title-generator";
import { hasMessageContent, shouldPersistUserMessage, safeSend } from "../services/message-helpers";
import { handlePtyWebSocket, detachFromAllTerminals, cleanupWsExec, type PtyMessage } from "../routes/terminal";
import { resolveNaviClaudeAuth, formatAuthForLog } from "../utils/navi-auth";
import { resolveBunExecutable } from "../utils/bun";
import { resolveClaudeCodeExecutable } from "../utils/claude-code";
import { describePath, writeDebugLog } from "../utils/logging";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function logBunSpawnDiagnostics(
  sessionId: string | undefined,
  bunPath: string,
  workerPath: string,
  workerCwd: string,
  claudeCodePath: string | null | undefined
) {
  const rawPath = process.env.PATH || process.env.Path || process.env.path || "";
  const pathPreview = rawPath ? `${rawPath.slice(0, 200)}${rawPath.length > 200 ? "..." : ""}` : null;
  const payload = {
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
    argv0: process.argv?.[0] ?? null,
    cwd: process.cwd(),
    workerCwd,
    workerCwdExists: existsSync(workerCwd),
    bun: describePath(bunPath),
    claudeCode: describePath(claudeCodePath),
    worker: describePath(workerPath),
    env: {
      NAVI_BUN_PATH: process.env.NAVI_BUN_PATH ?? null,
      NAVI_CLAUDE_CODE_PATH: process.env.NAVI_CLAUDE_CODE_PATH ?? null,
      BUN_PATH: process.env.BUN_PATH ?? null,
      BUN_EXECUTABLE: process.env.BUN_EXECUTABLE ?? null,
      BUN_INSTALL: process.env.BUN_INSTALL ?? null,
      BUN_HOME: process.env.BUN_HOME ?? null,
      PATH_LENGTH: rawPath.length,
      PATH_PREVIEW: pathPreview,
    },
  };

  const message = `[${sessionId}] Bun spawn diagnostics: ${JSON.stringify(payload)}`;
  console.error(message);
  writeDebugLog(message);
}

export interface ClientMessage {
  type: "query" | "cancel" | "abort" | "permission_response" | "question_response" | "attach" | "terminal_input" | "terminal_resize" | "terminal_attach" | "terminal_detach" | "exec_start" | "exec_kill";
  prompt?: string;
  projectId?: string;
  sessionId?: string;
  claudeSessionId?: string;
  allowedTools?: string[];
  model?: string;
  historyContext?: string;
  permissionRequestId?: string;
  approved?: boolean;
  approveAll?: boolean;
  // Question response fields
  questionRequestId?: string;
  answers?: Record<string, string | string[]>;
  // Terminal-related fields
  terminalId?: string;
  execId?: string;
  command?: string;
  cwd?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

interface ActiveProcess {
  process: ChildProcess;
  ws: any | null;
  sessionId: string;
}

const activeProcesses = new Map<string, ActiveProcess>();
const pendingPermissions = new Map<string, { sessionId: string; payload: any }>();
const pendingQuestions = new Map<string, { sessionId: string; payload: any }>();
const sessionApprovedAll = new Set<string>();
const connectedClients = new Set<any>();

// Until Done mode tracking
interface UntilDoneState {
  enabled: boolean;
  iteration: number;
  maxIterations: number;
  originalPrompt: string;
  projectId: string;
  model?: string;
  totalCost: number;
}
const untilDoneSessions = new Map<string, UntilDoneState>();

// Patterns that indicate work is incomplete
const INCOMPLETE_PATTERNS = [
  /\[ \]/i,                                    // Unchecked todo items
  /TODO:/i,                                    // TODO comments
  /I('ll| will) (continue|proceed|next|now)/i, // "I'll continue..."
  /next,? I('ll| will| should)/i,              // "Next I'll..."
  /let me (continue|proceed|finish)/i,         // "Let me continue..."
  /remaining (tasks?|items?|steps?)/i,         // "Remaining tasks..."
  /still need to/i,                            // "Still need to..."
  /not yet (done|complete|finished)/i,         // "Not yet done..."
  /in progress/i,                              // "In progress"
  /working on/i,                               // "Working on..."
  /incomplete/i,                               // "Incomplete"
];

// Patterns that indicate work is complete
const COMPLETE_PATTERNS = [
  /\ball (done|complete|finished|set)\b/i,     // "All done"
  /task(s)? (is|are) complete/i,               // "Task is complete"
  /successfully (completed|finished|done)/i,   // "Successfully completed"
  /implementation (is )?complete/i,            // "Implementation complete"
  /everything (is )?(done|complete|working)/i, // "Everything is done"
  /\[x\].*\[x\].*\[x\]/i,                      // Multiple checked items
];

function isTaskLikelyComplete(content: any[]): { complete: boolean; reason: string } {
  const contentStr = JSON.stringify(content);

  // Check for explicit completion signals first
  for (const pattern of COMPLETE_PATTERNS) {
    if (pattern.test(contentStr)) {
      return { complete: true, reason: "Explicit completion signal detected" };
    }
  }

  // Check for incomplete signals
  for (const pattern of INCOMPLETE_PATTERNS) {
    if (pattern.test(contentStr)) {
      return { complete: false, reason: `Incomplete signal: ${pattern.source}` };
    }
  }

  // Check TodoWrite tool for incomplete items
  const todoTool = content.find((b: any) => b?.type === "tool_use" && b?.name === "TodoWrite");
  if (todoTool?.input?.todos) {
    const todos = todoTool.input.todos;
    const incomplete = todos.filter((t: any) => t.status !== "completed");
    if (incomplete.length > 0) {
      return { complete: false, reason: `${incomplete.length} incomplete todo items` };
    }
  }

  // Default: assume complete if no incomplete signals
  return { complete: true, reason: "No incomplete signals detected" };
}

export function getUntilDoneSessions() {
  return untilDoneSessions;
}

export function enableUntilDone(sessionId: string, originalPrompt: string, projectId: string, model?: string, maxIterations: number = 10) {
  untilDoneSessions.set(sessionId, {
    enabled: true,
    iteration: 1,
    maxIterations,
    originalPrompt,
    projectId,
    model,
    totalCost: 0,
  });
}

export function disableUntilDone(sessionId: string) {
  untilDoneSessions.delete(sessionId);
}

export function getActiveProcesses() {
  return activeProcesses;
}

export function getPendingPermissions() {
  return pendingPermissions;
}

export function getPendingQuestions() {
  return pendingQuestions;
}

export function getSessionApprovedAll() {
  return sessionApprovedAll;
}

export function getConnectedClients() {
  return connectedClients;
}

export function broadcastToClients(payload: unknown) {
  for (const ws of connectedClients) {
    safeSend(ws, payload);
  }
}

function sendToSession(sessionId: string | undefined, payload: unknown) {
  if (!sessionId) {
    console.warn("[sendToSession] No sessionId provided, dropping message");
    return;
  }
  const active = activeProcesses.get(sessionId);
  if (active?.ws) {
    safeSend(active.ws, payload);
  } else {
    // No active websocket for this session - this can happen if client disconnected
    // Don't fall back to a different websocket as that causes cross-session leaks
    console.warn(`[sendToSession] No active ws for session ${sessionId}, dropping message`);
  }
}

/**
 * Update kanban card when agent starts working
 */
function setKanbanCardExecuting(sessionId: string, statusMessage?: string) {
  const card = kanbanCards.getBySession(sessionId);
  if (card) {
    kanbanCards.updateStatus(card.id, "execute", statusMessage);
    kanbanCards.setBlocked(card.id, false);
    broadcastKanbanUpdate(card.id);
  }
}

/**
 * Set kanban card blocked flag (permission/input needed)
 */
function setKanbanCardBlocked(sessionId: string, statusMessage?: string) {
  const card = kanbanCards.getBySession(sessionId);
  if (card) {
    kanbanCards.setBlocked(card.id, true, statusMessage);
    broadcastKanbanUpdate(card.id);
  }
}

/**
 * Update kanban card to review status when agent completes
 */
function setKanbanCardReview(sessionId: string, statusMessage?: string) {
  const card = kanbanCards.getBySession(sessionId);
  if (card) {
    kanbanCards.updateStatus(card.id, "review", statusMessage);
    kanbanCards.setBlocked(card.id, false);
    broadcastKanbanUpdate(card.id);
  }
}

/**
 * Broadcast kanban card update to all clients
 */
function broadcastKanbanUpdate(cardId: string) {
  broadcastToClients({
    type: "kanban_card_updated",
    card: kanbanCards.get(cardId),
  });
}

/**
 * Broadcast session hierarchy events to all clients
 */
function broadcastSessionHierarchyEvent(event: SessionEvent) {
  let wsEvent: any;

  switch (event.type) {
    case "spawned":
      wsEvent = {
        type: "session:spawned",
        session: event.session,
        parentId: event.parentId,
      };
      break;

    case "status_changed":
      wsEvent = {
        type: "session:status_changed",
        sessionId: event.sessionId,
        status: event.status,
        previousStatus: event.previousStatus,
      };
      break;

    case "escalated":
      wsEvent = {
        type: "session:escalated",
        sessionId: event.sessionId,
        escalation: event.escalation,
      };
      // Play notification sound for escalations
      broadcastToClients({ type: "play_sound", sound: "escalation" });
      break;

    case "escalation_resolved":
      wsEvent = {
        type: "session:escalation_resolved",
        sessionId: event.sessionId,
        response: event.response,
      };
      break;

    case "delivered":
      wsEvent = {
        type: "session:delivered",
        sessionId: event.sessionId,
        deliverable: event.deliverable,
      };
      break;

    case "archived":
      wsEvent = {
        type: "session:archived",
        sessionId: event.sessionId,
      };
      break;

    case "decision_logged":
      wsEvent = {
        type: "session:decision_logged",
        decision: event.decision,
      };
      break;

    case "artifact_created":
      wsEvent = {
        type: "session:artifact_created",
        artifact: event.artifact,
      };
      break;

    default:
      return;
  }

  broadcastToClients(wsEvent);
}

// Subscribe to session manager events
sessionManager.subscribe(broadcastSessionHierarchyEvent);

// ============================================================================
// Multi-Session Handler Functions
// ============================================================================

// Pending escalations waiting for response (parent or human)
const pendingEscalations = new Map<string, {
  sessionId: string;
  requestId: string;
  proc: ChildProcess;
}>();

// Active child session workers (for multi-session)
const childSessionWorkers = new Map<string, ChildProcess>();

/**
 * Start a child session's query in the background
 * This is called when a parent agent spawns a child agent
 */
function startChildSessionQuery(
  childSessionId: string,
  config: {
    prompt: string;
    cwd: string;
    model: string;
    projectId: string;
  }
) {
  const childSession = sessions.get(childSessionId);
  if (!childSession) {
    console.error(`[MultiSession] Child session ${childSessionId} not found`);
    return;
  }

  // Build multi-session context for the child
  const multiSessionContext = {
    enabled: true,
    parentSessionId: childSession.parent_session_id || undefined,
    rootSessionId: childSession.root_session_id || childSession.id,
    depth: childSession.depth || 0,
    role: childSession.role || undefined,
    task: childSession.task || undefined,
    // Get parent and sibling info
    ...(childSession.parent_session_id && (() => {
      const parent = sessions.get(childSession.parent_session_id);
      const siblings = sessionHierarchy.getSiblings(childSessionId);
      const rootId = childSession.root_session_id || childSession.id;
      const recentDecisions = sessionDecisions.listByRoot(rootId).slice(0, 5);
      return {
        parentTask: parent?.task || parent?.title,
        siblingRoles: siblings.map(s => s.role || "agent").filter(Boolean),
        recentDecisions: recentDecisions.map(d => d.decision),
      };
    })()),
  };

  const inputJson = JSON.stringify({
    prompt: config.prompt,
    cwd: config.cwd,
    model: config.model,
    sessionId: childSessionId,
    permissionSettings: {
      autoAcceptAll: true, // Auto-accept for child sessions
      requireConfirmation: [],
    },
    multiSession: multiSessionContext,
  });

  // Find worker path
  const workerPath = existsSync(join(dirname(fileURLToPath(import.meta.url)), "../../query-worker.js"))
    ? join(dirname(fileURLToPath(import.meta.url)), "../../query-worker.js")
    : existsSync(join(dirname(fileURLToPath(import.meta.url)), "../query-worker.ts"))
      ? join(dirname(fileURLToPath(import.meta.url)), "../query-worker.ts")
      : join(dirname(fileURLToPath(import.meta.url)), "../query-worker.js");

  const workerEnv = { ...process.env };
  delete workerEnv.ANTHROPIC_API_KEY;
  delete workerEnv.ANTHROPIC_BASE_URL;

  const resolvedBunPath = resolveBunExecutable();
  const bunPath = resolvedBunPath ?? "bun";

  console.log(`[MultiSession] Starting child worker for session ${childSessionId}`);

  const childProc = spawn(bunPath, ["run", "--env-file=/dev/null", workerPath, inputJson], {
    cwd: config.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: workerEnv,
  });

  childSessionWorkers.set(childSessionId, childProc);

  let buffer = "";

  childProc.stdout?.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);

        if (msg.type === "message") {
          const data = msg.data;
          const now = Date.now();

          // Persist messages
          if (data.type === "assistant" && hasMessageContent(data.content)) {
            const msgId = data.uuid || crypto.randomUUID();
            messages.upsert(
              msgId,
              childSessionId,
              "assistant",
              JSON.stringify(data.content),
              now,
              data.parentToolUseId ?? null,
              0
            );
          }

          // Broadcast to clients
          broadcastToClients({
            ...data,
            uiSessionId: childSessionId,
          });
        }
        // Handle multi-session tool calls from child
        else if (msg.type === "multi_session_spawn") {
          handleMultiSessionSpawn(childProc, childSessionId, msg);
        } else if (msg.type === "multi_session_get_context") {
          handleMultiSessionGetContext(childProc, childSessionId, msg);
        } else if (msg.type === "multi_session_escalate") {
          handleMultiSessionEscalate(childProc, childSessionId, msg);
        } else if (msg.type === "multi_session_deliver") {
          handleMultiSessionDeliver(childProc, childSessionId, msg);
        } else if (msg.type === "multi_session_log_decision") {
          handleMultiSessionLogDecision(childProc, childSessionId, msg);
        } else if (msg.type === "complete") {
          console.log(`[MultiSession] Child session ${childSessionId} completed`);
        }
      } catch (e) {
        console.error(`[MultiSession] Error parsing child worker output:`, e);
      }
    }
  });

  childProc.stderr?.on("data", (chunk) => {
    console.error(`[MultiSession][${childSessionId}] stderr:`, chunk.toString());
  });

  childProc.on("close", (code) => {
    console.log(`[MultiSession] Child worker ${childSessionId} exited with code ${code}`);
    childSessionWorkers.delete(childSessionId);
  });

  childProc.on("error", (err) => {
    console.error(`[MultiSession] Child worker ${childSessionId} error:`, err);
    childSessionWorkers.delete(childSessionId);
  });
}

/**
 * Handle spawn_agent request from worker
 */
function handleMultiSessionSpawn(proc: ChildProcess, sessionId: string | undefined, msg: any) {
  if (!sessionId) {
    sendWorkerResponse(proc, "multi_session_spawn_response", msg.requestId, {
      success: false,
      error: "No session ID",
    });
    return;
  }

  try {
    const child = sessionManager.spawn(sessionId, {
      title: msg.title,
      role: msg.role,
      task: msg.task,
      model: msg.model,
      context: msg.context,
    });

    if (child) {
      sendWorkerResponse(proc, "multi_session_spawn_response", msg.requestId, {
        success: true,
        childSessionId: child.id,
      });

      console.log(`[MultiSession] Spawned child session ${child.id} (${msg.role}) for parent ${sessionId}`);

      // Auto-start the child session
      // Get parent session to determine project and working directory
      const parentSession = sessions.get(sessionId);
      if (parentSession) {
        const project = projects.get(parentSession.project_id);
        const workingDirectory = parentSession.worktree_path || project?.path || process.cwd();

        // Build the initial prompt from task and context
        const initialPrompt = msg.context
          ? `${msg.task}\n\nAdditional context from parent:\n${msg.context}`
          : msg.task;

        console.log(`[MultiSession] Auto-starting child session ${child.id} with task: ${msg.task.substring(0, 50)}...`);

        // Start the child query in the background
        // We use setTimeout to not block the parent's spawn response
        setTimeout(() => {
          startChildSessionQuery(child.id, {
            prompt: initialPrompt,
            cwd: workingDirectory,
            model: msg.model || parentSession.model || "opus",
            projectId: parentSession.project_id,
          });
        }, 100);
      }
    } else {
      sendWorkerResponse(proc, "multi_session_spawn_response", msg.requestId, {
        success: false,
        error: "Failed to spawn child session (check depth/concurrent limits)",
      });
    }
  } catch (error) {
    sendWorkerResponse(proc, "multi_session_spawn_response", msg.requestId, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Handle get_context request from worker
 */
async function handleMultiSessionGetContext(proc: ChildProcess, sessionId: string | undefined, msg: any) {
  if (!sessionId) {
    sendWorkerResponse(proc, "multi_session_context_response", msg.requestId, {
      content: "Error: No session ID",
    });
    return;
  }

  try {
    const result = await sessionManager.getContext(sessionId, {
      source: msg.source,
      query: msg.query,
      siblingRole: msg.siblingRole,
    });

    sendWorkerResponse(proc, "multi_session_context_response", msg.requestId, {
      content: result?.content || "No context available",
      metadata: result?.metadata,
    });
  } catch (error) {
    sendWorkerResponse(proc, "multi_session_context_response", msg.requestId, {
      content: `Error retrieving context: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/**
 * Handle escalate request from worker
 */
function handleMultiSessionEscalate(proc: ChildProcess, sessionId: string | undefined, msg: any) {
  if (!sessionId) {
    sendWorkerResponse(proc, "multi_session_escalation_response", msg.requestId, {
      action: "abort",
      content: "No session ID",
    });
    return;
  }

  try {
    // Store the pending escalation so we can respond later
    pendingEscalations.set(msg.requestId, {
      sessionId,
      requestId: msg.requestId,
      proc,
    });

    // Create the escalation
    sessionManager.escalate(sessionId, {
      type: msg.escalationType,
      summary: msg.summary,
      context: msg.context,
      options: msg.options,
    });

    // The response will come later via resolveMultiSessionEscalation
    // when parent/human responds
    console.log(`[MultiSession] Session ${sessionId} escalated: ${msg.summary}`);
  } catch (error) {
    sendWorkerResponse(proc, "multi_session_escalation_response", msg.requestId, {
      action: "abort",
      content: error instanceof Error ? error.message : "Unknown error",
    });
    pendingEscalations.delete(msg.requestId);
  }
}

/**
 * Resolve an escalation (called when parent/human responds)
 */
export function resolveMultiSessionEscalation(requestId: string, action: string, content: string) {
  const pending = pendingEscalations.get(requestId);
  if (!pending) {
    console.warn(`[MultiSession] No pending escalation found for ${requestId}`);
    return false;
  }

  sendWorkerResponse(pending.proc, "multi_session_escalation_response", requestId, {
    action,
    content,
  });

  pendingEscalations.delete(requestId);
  sessionManager.resolveEscalation(pending.sessionId, { action: action as any, content });
  return true;
}

/**
 * Handle deliver request from worker
 */
function handleMultiSessionDeliver(proc: ChildProcess, sessionId: string | undefined, msg: any) {
  if (!sessionId) {
    sendWorkerResponse(proc, "multi_session_deliver_response", msg.requestId, {
      success: false,
    });
    return;
  }

  try {
    const childSession = sessions.get(sessionId);

    sessionManager.deliver(sessionId, {
      type: msg.deliverableType,
      summary: msg.summary,
      content: msg.content,
      artifacts: msg.artifacts,
    });

    sendWorkerResponse(proc, "multi_session_deliver_response", msg.requestId, {
      success: true,
    });

    console.log(`[MultiSession] Session ${sessionId} delivered: ${msg.summary}`);

    // Inject the deliverable into the parent session's conversation
    if (childSession?.parent_session_id) {
      const parentProc = activeProcesses.get(childSession.parent_session_id)?.process;
      if (parentProc?.stdin) {
        // Send a synthetic message to the parent that includes the child's deliverable
        const deliverableMessage = JSON.stringify({
          type: "child_deliverable",
          childSessionId: sessionId,
          childRole: childSession.role || "agent",
          deliverable: {
            type: msg.deliverableType,
            summary: msg.summary,
            content: msg.content,
            artifacts: msg.artifacts,
          },
        });
        parentProc.stdin.write(deliverableMessage + "\n");
        console.log(`[MultiSession] Injected deliverable from ${sessionId} into parent ${childSession.parent_session_id}`);

        // Also create a synthetic message in the parent's conversation
        const parentMsgId = crypto.randomUUID();
        const now = Date.now();
        const syntheticContent = [
          {
            type: "text",
            text: `**Child Agent (${childSession.role || "agent"}) completed:**\n\n${msg.summary}\n\n---\n\n${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}`,
          },
        ];

        messages.upsert(
          parentMsgId,
          childSession.parent_session_id,
          "assistant",
          JSON.stringify(syntheticContent),
          now,
          null,
          1 // synthetic
        );

        // Broadcast to UI
        broadcastToClients({
          type: "assistant",
          uiSessionId: childSession.parent_session_id,
          content: syntheticContent,
          uuid: parentMsgId,
          timestamp: now,
          isSynthetic: true,
          fromChildSession: sessionId,
        });
      }
    }
  } catch (error) {
    sendWorkerResponse(proc, "multi_session_deliver_response", msg.requestId, {
      success: false,
    });
  }
}

/**
 * Handle log_decision request from worker
 */
function handleMultiSessionLogDecision(proc: ChildProcess, sessionId: string | undefined, msg: any) {
  if (!sessionId) {
    sendWorkerResponse(proc, "multi_session_decision_response", msg.requestId, {
      success: false,
    });
    return;
  }

  try {
    const decision = sessionManager.logDecision(
      sessionId,
      msg.decision,
      msg.category,
      msg.rationale
    );

    sendWorkerResponse(proc, "multi_session_decision_response", msg.requestId, {
      success: true,
      decisionId: decision?.id,
    });
  } catch (error) {
    sendWorkerResponse(proc, "multi_session_decision_response", msg.requestId, {
      success: false,
    });
  }
}

/**
 * Send a response back to the worker process
 */
function sendWorkerResponse(proc: ChildProcess, type: string, requestId: string, data: any) {
  if (!proc.stdin) {
    console.error(`[MultiSession] Worker process has no stdin`);
    return;
  }

  const response = JSON.stringify({
    type,
    requestId,
    ...data,
  });

  proc.stdin.write(response + "\n");
}

function formatMessage(msg: SDKMessage, uiSessionId?: string): any {
  const timestamp = Date.now();
  const uuid = (msg as any).uuid || crypto.randomUUID();

  switch (msg.type) {
    case "system":
      return {
        type: "system",
        uiSessionId,
        claudeSessionId: msg.session_id,
        subtype: msg.subtype,
        uuid,
        timestamp,
        ...(msg.subtype === "init" && {
          cwd: (msg as any).cwd,
          model: (msg as any).model,
          tools: (msg as any).tools,
        }),
      };

    case "assistant":
      return {
        type: "assistant",
        uiSessionId,
        claudeSessionId: msg.session_id,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
        usage: (msg as any).message?.usage,
        uuid,
        timestamp,
        error: (msg as any).error,
      };

    case "user":
      return {
        type: "user",
        uiSessionId,
        content: msg.message.content,
        parentToolUseId: msg.parent_tool_use_id || null,
        uuid,
        timestamp,
        isSynthetic: (msg as any).isSynthetic,
        toolUseResult: (msg as any).tool_use_result,
        isReplay: (msg as any).isReplay,
      };

    case "result":
      return {
        type: "result",
        uiSessionId,
        claudeSessionId: msg.session_id,
        costUsd: msg.total_cost_usd,
        durationMs: msg.duration_ms,
        numTurns: msg.num_turns,
        usage: msg.usage,
        uuid,
        timestamp,
      };

    case "tool_progress":
      return {
        type: "tool_progress",
        uiSessionId,
        toolUseId: msg.tool_use_id,
        toolName: msg.tool_name,
        parentToolUseId: msg.parent_tool_use_id || null,
        elapsedTimeSeconds: msg.elapsed_time_seconds,
        uuid,
        timestamp,
      };

    default:
      return { type: "unknown", uiSessionId, raw: msg, uuid, timestamp };
  }
}

export function handleQueryWithProcess(ws: any, data: ClientMessage) {
  const { prompt, projectId, sessionId, claudeSessionId, allowedTools, model, historyContext } = data;

  const session = sessionId ? sessions.get(sessionId) : null;
  const project = projectId ? projects.get(projectId) : null;
  // Use worktree path if session has one, otherwise use project path
  const workingDirectory = session?.worktree_path || project?.path || process.cwd();
  const defaultWorkerCwd = join(__dirname, "..");
  const execDir = process.execPath ? dirname(process.execPath) : process.cwd();
  const workerCwd = existsSync(defaultWorkerCwd) ? defaultWorkerCwd : execDir;

  console.log(`[${sessionId}] Spawning worker process (cwd: ${workerCwd}) for project ${workingDirectory}`);

  const permissionSettings = globalSettings.getPermissions();

  const needsAutoTitle = session?.title === "New Chat" || session?.title === "New conversation";

  if (sessionId && prompt) {
    const msgId = crypto.randomUUID();
    const now = Date.now();
    messages.create(msgId, sessionId, "user", JSON.stringify(prompt), now);
    searchIndex.indexMessage(msgId, sessionId, JSON.stringify(prompt), now);
  }

  const effectivePrompt = historyContext
    ? `${historyContext}\n\nUser's new message:\n${prompt}`
    : prompt;

  const bundledWorkerPath = join(execDir, "..", "Resources", "resources", "query-worker.js");
  const bundledWorkerPathAlt = join(execDir, "..", "Resources", "query-worker.js");
  const fallbackWorkerPath = join(__dirname, "..", "query-worker.ts");
  const workerPath = existsSync(bundledWorkerPath)
    ? bundledWorkerPath
    : existsSync(bundledWorkerPathAlt)
      ? bundledWorkerPathAlt
      : fallbackWorkerPath;
  const isSessionApprovedAll = sessionId ? (sessionApprovedAll.has(sessionId) || session?.auto_accept_all === 1) : false;
  const isProjectApprovedAll = project?.auto_accept_all === 1;

  // Build multi-session context if this session is part of a hierarchy
  let multiSessionContext: any = undefined;
  if (session) {
    const isChildSession = !!session.parent_session_id;
    const canSpawnChildren = (session.depth || 0) < 2; // Max depth 3, so 0,1 can spawn

    // Enable multi-session for all sessions (root and children)
    // Root sessions can spawn, children have full context
    multiSessionContext = {
      enabled: true,
      parentSessionId: session.parent_session_id || undefined,
      rootSessionId: session.root_session_id || session.id,
      depth: session.depth || 0,
      role: session.role || undefined,
      task: session.task || undefined,
      // For child sessions, get parent context
      ...(isChildSession && session.parent_session_id && (() => {
        const parent = sessions.get(session.parent_session_id);
        const siblings = sessionHierarchy.getSiblings(session.id);
        const recentDecisions = sessionDecisions.listByRoot(session.root_session_id || session.id).slice(0, 5);
        return {
          parentTask: parent?.task || parent?.title,
          siblingRoles: siblings.map(s => s.role || "agent").filter(Boolean),
          recentDecisions: recentDecisions.map(d => d.decision),
        };
      })()),
    };
  }

  const inputJson = JSON.stringify({
    prompt: effectivePrompt,
    cwd: workingDirectory,
    resume: claudeSessionId || session?.claude_session_id,
    model,
    allowedTools: allowedTools || permissionSettings.allowedTools,
    sessionId,
    permissionSettings: {
      autoAcceptAll: permissionSettings.autoAcceptAll || isSessionApprovedAll || isProjectApprovedAll,
      requireConfirmation: permissionSettings.requireConfirmation,
    },
    multiSession: multiSessionContext,
  });

  const workerEnv = { ...process.env };
  delete workerEnv.ANTHROPIC_API_KEY;
  delete workerEnv.ANTHROPIC_BASE_URL;
  delete workerEnv.NAVI_ANTHROPIC_API_KEY;
  delete workerEnv.NAVI_ANTHROPIC_BASE_URL;

  const authResult = resolveNaviClaudeAuth(model);
  console.log(`[${sessionId}] ${formatAuthForLog(authResult)}`);

  if (authResult.overrides.apiKey) {
    workerEnv.NAVI_ANTHROPIC_API_KEY = authResult.overrides.apiKey;
  }
  if (authResult.overrides.baseUrl) {
    workerEnv.NAVI_ANTHROPIC_BASE_URL = authResult.overrides.baseUrl;
  }
  // Pass auth mode to worker for its own logging
  workerEnv.NAVI_AUTH_MODE = authResult.mode;
  workerEnv.NAVI_AUTH_SOURCE = authResult.source;

  // Avoid running Bun from the project directory, and disable Bun dotenv loading.
  // The worker (and the Claude Code subprocess it spawns) must never pick up project-local `.env` auth.
  const resolvedBunPath = resolveBunExecutable();
  if (!resolvedBunPath) {
    console.warn(`[${sessionId}] Bun executable not found. Set NAVI_BUN_PATH to override.`);
  }
  const bunPath = resolvedBunPath ?? "bun";
  if (resolvedBunPath) {
    workerEnv.NAVI_BUN_PATH = resolvedBunPath;
  }
  const resolvedClaudeCodePath = resolveClaudeCodeExecutable();
  if (resolvedClaudeCodePath) {
    workerEnv.NAVI_CLAUDE_CODE_PATH = resolvedClaudeCodePath;
  }
  logBunSpawnDiagnostics(sessionId, bunPath, workerPath, workerCwd, resolvedClaudeCodePath);
  const child = spawn(bunPath, ["run", "--env-file=/dev/null", workerPath, inputJson], {
    cwd: workerCwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: workerEnv,
  });

  if (sessionId) {
    activeProcesses.set(sessionId, { process: child, ws, sessionId });
  }

  let buffer = "";
  let lastMainAssistantMsgId: string | null = null;

  child.stdout?.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);

        if (msg.type === "message") {
          const data = msg.data;
          const now = Date.now();
          if (sessionId && data.type === "stream_event") {
            captureStreamEvent(sessionId, data.event);
          }
          if (sessionId && data.type === "assistant" && Array.isArray(data.content)) {
            const merged = mergeThinkingBlocks(sessionId, data.content);
            if (merged !== data.content) {
              data.content = merged;
            }
          }
          if (sessionId && data.type === "assistant" && hasMessageContent(data.content)) {
            const msgId = data.uuid || crypto.randomUUID();
            const timestamp = typeof data.timestamp === "number" ? data.timestamp : now;

            const toolUseBlocks = Array.isArray(data.content)
              ? data.content.filter((b: any) => b?.type === "tool_use")
              : [];
            console.log(`[Persist] Assistant message:`, {
              uuid: msgId,
              parentToolUseId: data.parentToolUseId,
              blockTypes: Array.isArray(data.content) ? data.content.map((b: any) => b?.type) : [],
              toolUseCount: toolUseBlocks.length,
              toolNames: toolUseBlocks.map((b: any) => b?.name),
            });

            messages.upsert(
              msgId,
              sessionId,
              "assistant",
              JSON.stringify(data.content),
              timestamp,
              data.parentToolUseId ?? null,
              0
            );
            if (!data.parentToolUseId) {
              lastMainAssistantMsgId = msgId;
            }
          }
          if (sessionId && shouldPersistUserMessage(data)) {
            const msgId = data.uuid || crypto.randomUUID();
            const timestamp = typeof data.timestamp === "number" ? data.timestamp : now;
            const content = data.content ?? [];

            console.log(`[Persist] Saving user message:`, {
              uuid: msgId,
              parentToolUseId: data.parentToolUseId,
              isSynthetic: data.isSynthetic,
              contentPreview: JSON.stringify(content).slice(0, 200),
            });

            messages.upsert(
              msgId,
              sessionId,
              "user",
              JSON.stringify(content),
              timestamp,
              data.parentToolUseId ?? null,
              data.isSynthetic ? 1 : 0
            );
          }
          sendToSession(sessionId, data);
        } else if (msg.type === "permission_request") {
          const payload = {
            type: "permission_request",
            requestId: msg.requestId,
            tools: [msg.toolName],
            toolInput: msg.toolInput,
            message: msg.message,
          };
          if (sessionId) {
            pendingPermissions.set(msg.requestId, { sessionId, payload });
            // Update kanban card to blocked (waiting for permission)
            setKanbanCardBlocked(sessionId, `Needs permission: ${msg.toolName}`);
          }
          sendToSession(sessionId, payload);
        } else if (msg.type === "ask_user_question") {
          const payload = {
            type: "ask_user_question",
            requestId: msg.requestId,
            sessionId, // Include sessionId so frontend can verify
            questions: msg.questions,
          };
          if (sessionId) {
            // Store in memory for websocket routing
            pendingQuestions.set(msg.requestId, { sessionId, payload });
            // Persist to database so it survives page reloads
            pendingQuestionsDb.create(
              crypto.randomUUID(),
              sessionId,
              msg.requestId,
              JSON.stringify(msg.questions)
            );
            // Update kanban card to blocked (waiting for user input)
            setKanbanCardBlocked(sessionId, "Needs input from user");
          }
          sendToSession(sessionId, payload);
        }
        // ═══════════════════════════════════════════════════════════════
        // MULTI-SESSION: Handle spawn, context, escalate, deliver, decision
        // ═══════════════════════════════════════════════════════════════
        else if (msg.type === "multi_session_spawn") {
          handleMultiSessionSpawn(proc, sessionId, msg);
        } else if (msg.type === "multi_session_get_context") {
          handleMultiSessionGetContext(proc, sessionId, msg);
        } else if (msg.type === "multi_session_escalate") {
          handleMultiSessionEscalate(proc, sessionId, msg);
        } else if (msg.type === "multi_session_deliver") {
          handleMultiSessionDeliver(proc, sessionId, msg);
        } else if (msg.type === "multi_session_log_decision") {
          handleMultiSessionLogDecision(proc, sessionId, msg);
        } else if (msg.type === "complete") {
          if (lastMainAssistantMsgId) {
            messages.markFinal(lastMainAssistantMsgId);
          }
          if (sessionId && msg.lastAssistantContent?.length > 0) {
            searchIndex.indexMessage(crypto.randomUUID(), sessionId, JSON.stringify(msg.lastAssistantContent), Date.now());

            if (needsAutoTitle && prompt) {
              generateChatTitle(prompt, msg.lastAssistantContent, sessionId);
            }
          }

          if (sessionId && msg.resultData) {
            const costUsd = msg.resultData.total_cost_usd || 0;
            const usage = msg.resultData.usage || {};
            const contextUsage = msg.lastAssistantUsage || usage;
            console.log("[DEBUG] resultData.usage:", JSON.stringify(usage));
            console.log("[DEBUG] lastAssistantUsage:", JSON.stringify(msg.lastAssistantUsage));
            console.log("[DEBUG] using contextUsage:", JSON.stringify(contextUsage));
            const totalInputTokens = (contextUsage.input_tokens || 0) +
              (contextUsage.cache_creation_input_tokens || 0) +
              (contextUsage.cache_read_input_tokens || 0);
            console.log("[DEBUG] totalInputTokens calc:", `${contextUsage.input_tokens || 0} + ${contextUsage.cache_creation_input_tokens || 0} + ${contextUsage.cache_read_input_tokens || 0} = ${totalInputTokens}`);
            sessions.updateClaudeSession(
              msg.resultData.session_id,
              msg.resultData.model || null,
              costUsd,
              msg.resultData.num_turns || 0,
              totalInputTokens,
              contextUsage.output_tokens || 0,
              Date.now(),
              sessionId
            );
            if (costUsd > 0) {
              const sess = sessions.get(sessionId);
              if (sess) {
                costEntries.create({
                  id: crypto.randomUUID(),
                  session_id: sessionId,
                  project_id: sess.project_id,
                  cost_usd: costUsd,
                  input_tokens: msg.resultData.usage?.input_tokens || 0,
                  output_tokens: msg.resultData.usage?.output_tokens || 0,
                  timestamp: Date.now(),
                });
              }
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // UNTIL DONE: Check if we should auto-continue
          // ═══════════════════════════════════════════════════════════════
          const untilDoneState = sessionId ? untilDoneSessions.get(sessionId) : null;

          if (untilDoneState?.enabled && sessionId) {
            const costUsd = msg.resultData?.total_cost_usd || 0;
            untilDoneState.totalCost += costUsd;

            const { complete, reason } = isTaskLikelyComplete(msg.lastAssistantContent || []);

            console.log(`[UntilDone] Session ${sessionId} iteration ${untilDoneState.iteration}/${untilDoneState.maxIterations}`);
            console.log(`[UntilDone] Complete: ${complete}, Reason: ${reason}`);

            if (!complete && untilDoneState.iteration < untilDoneState.maxIterations) {
              // NOT DONE - Continue working
              untilDoneState.iteration++;

              // Notify UI about continuation
              sendToSession(sessionId, {
                type: "until_done_continue",
                uiSessionId: sessionId,
                iteration: untilDoneState.iteration,
                maxIterations: untilDoneState.maxIterations,
                totalCost: untilDoneState.totalCost,
                reason,
              });

              // Clean up current process tracking
              activeProcesses.delete(sessionId);
              deleteStreamCapture(sessionId);

              // Re-invoke with continuation prompt after a short delay
              setTimeout(() => {
                console.log(`[UntilDone] Auto-continuing session ${sessionId}, iteration ${untilDoneState.iteration}`);
                handleQueryWithProcess(ws, {
                  prompt: "Continue working on the task. Check your progress and keep going until everything is complete.",
                  projectId: untilDoneState.projectId,
                  sessionId,
                  claudeSessionId: msg.resultData?.session_id,
                  model: untilDoneState.model,
                });
              }, 500);

              return; // Don't send "done" yet
            }

            // Task is complete OR max iterations reached
            const finalReason = complete ? "Task completed" : `Max iterations (${untilDoneState.maxIterations}) reached`;
            console.log(`[UntilDone] Finishing: ${finalReason}`);

            // Send completion notification
            sendToSession(sessionId, {
              type: "until_done_complete",
              uiSessionId: sessionId,
              totalIterations: untilDoneState.iteration,
              totalCost: untilDoneState.totalCost,
              reason: finalReason,
            });

            // Clean up until done state
            untilDoneSessions.delete(sessionId);
          }

          sendToSession(sessionId, { type: "done", uiSessionId: sessionId, finalMessageId: lastMainAssistantMsgId, usage: msg.lastAssistantUsage });
          if (sessionId) {
            // Update kanban card to waiting_review (agent completed, needs user review)
            setKanbanCardReview(sessionId, "Ready for review");
            activeProcesses.delete(sessionId);
            deleteStreamCapture(sessionId);
          }
        } else if (msg.type === "error") {
          sendToSession(sessionId, {
            type: "error",
            uiSessionId: sessionId,
            error: msg.error,
          });
          if (sessionId) {
            // Update kanban card to blocked on error
            setKanbanCardBlocked(sessionId, `Error: ${msg.error}`);
          }
          if (sessionId) {
            activeProcesses.delete(sessionId);
            deleteStreamCapture(sessionId);
          }
        }
      } catch (e) {
        console.log(`[${sessionId}] Non-JSON stdout:`, line);
      }
    }
  });

  child.stderr?.on("data", (data) => {
    console.error(`[${sessionId}] stderr:`, data.toString());
  });

  child.on("error", (error) => {
    console.error(`[${sessionId}] Process error:`, error);
    logBunSpawnDiagnostics(sessionId, bunPath, workerPath, workerCwd, resolvedClaudeCodePath);
    sendToSession(sessionId, {
      type: "error",
      uiSessionId: sessionId,
      error: error.message,
    });
    if (sessionId) {
      activeProcesses.delete(sessionId);
      deleteStreamCapture(sessionId);
    }
  });

  child.on("exit", (code) => {
    console.log(`[${sessionId}] Process exited with code ${code}`);
    if (buffer.trim()) {
      try {
        const msg = JSON.parse(buffer);
        if (msg.type === "complete") {
          sendToSession(sessionId, { type: "done", uiSessionId: sessionId });
        }
      } catch {}
    }
    if (sessionId) {
      activeProcesses.delete(sessionId);
      deleteStreamCapture(sessionId);
    }
  });
}

export function createWebSocketHandlers() {
  return {
    open(ws: any) {
      console.log("Client connected");
      connectedClients.add(ws);
      safeSend(ws, { type: "connected" });
    },

    async message(ws: any, message: any) {
      try {
        const data: ClientMessage = JSON.parse(message.toString());

        if (data.type === "query" && data.prompt) {
          console.log(`[${data.sessionId}] Starting query: "${data.prompt.slice(0, 50)}..."`);
          // Update kanban card to in_progress when query starts
          if (data.sessionId) {
            setKanbanCardExecuting(data.sessionId, "Agent working...");
          }
          handleQueryWithProcess(ws, data);
        } else if (data.type === "abort" && data.sessionId) {
          const active = activeProcesses.get(data.sessionId);
          if (active) {
            console.log(`Aborting query for session ${data.sessionId}`);
            active.process.kill("SIGTERM");
            activeProcesses.delete(data.sessionId);
            safeSend(ws, { type: "aborted", uiSessionId: data.sessionId });
          }
        } else if (data.type === "attach" && data.sessionId) {
          const active = activeProcesses.get(data.sessionId);
          if (active) {
            const wasSameWs = active.ws === ws;
            active.ws = ws;
            activeProcesses.set(data.sessionId, active);
            if (!wasSameWs) {
              sendToSession(data.sessionId, {
                type: "stream_event",
                uiSessionId: data.sessionId,
                event: { type: "message_start" },
                parentToolUseId: null,
                uuid: crypto.randomUUID(),
                timestamp: Date.now(),
              });
              // Resend any pending permission requests
              for (const pending of pendingPermissions.values()) {
                if (pending.sessionId === data.sessionId) {
                  sendToSession(data.sessionId, pending.payload);
                }
              }
              // Resend any pending questions
              for (const pending of pendingQuestions.values()) {
                if (pending.sessionId === data.sessionId) {
                  sendToSession(data.sessionId, pending.payload);
                }
              }
            }
          }
        } else if (data.type === "permission_response" && data.permissionRequestId) {
          const pending = pendingPermissions.get(data.permissionRequestId);
          if (pending) {
            if (data.approveAll && pending.sessionId) {
              sessionApprovedAll.add(pending.sessionId);
              sessions.setAutoAcceptAll(pending.sessionId, true);
            }
            const active = activeProcesses.get(pending.sessionId);
            if (active && active.process.stdin) {
              const response = JSON.stringify({
                type: "permission_response",
                requestId: data.permissionRequestId,
                approved: data.approved,
                approveAll: data.approveAll,
              });
              active.process.stdin.write(response + "\n");
            }
            pendingPermissions.delete(data.permissionRequestId);
          }
        } else if (data.type === "question_response" && data.questionRequestId) {
          const pending = pendingQuestions.get(data.questionRequestId);
          if (pending) {
            const active = activeProcesses.get(pending.sessionId);
            if (active && active.process.stdin) {
              const response = JSON.stringify({
                type: "question_response",
                requestId: data.questionRequestId,
                answers: data.answers,
              });
              active.process.stdin.write(response + "\n");
            }
            // Remove from memory and database
            pendingQuestions.delete(data.questionRequestId);
            pendingQuestionsDb.deleteByRequestId(data.questionRequestId);
          }
        } else if (data.type.startsWith("terminal_") || data.type.startsWith("exec_")) {
          // Route terminal/exec messages to handler
          handlePtyWebSocket(ws, {
            type: data.type as PtyMessage["type"],
            terminalId: data.terminalId,
            execId: data.execId,
            command: data.command,
            cwd: data.cwd,
            data: data.data,
            cols: data.cols,
            rows: data.rows,
          });
        }
      } catch (error) {
        safeSend(ws, {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },

    close(ws: any) {
      console.log("[WebSocket] Client disconnected, starting cleanup...");
      connectedClients.delete(ws);
      // Detach from all terminals and cleanup exec processes
      detachFromAllTerminals(ws);
      cleanupWsExec(ws);
      // Update active processes - set ws to null so they can be reattached
      let detachedSessions = 0;
      for (const [sessionId, active] of activeProcesses.entries()) {
        if (active.ws === ws) {
          activeProcesses.set(sessionId, { ...active, ws: null });
          detachedSessions++;
        }
      }
      if (detachedSessions > 0) {
        console.log(`[WebSocket] Detached ${detachedSessions} active session(s) from disconnected client`);
      }
      console.log(`[WebSocket] Cleanup complete. Connected clients: ${connectedClients.size}`);
    },
  };
}

export function triggerQuery(sessionId: string, projectId: string, prompt: string, model?: string) {
  const activeWs = Array.from(connectedClients)[0];
  if (!activeWs) {
    console.error("No active WebSocket connection to trigger query");
    return false;
  }
  handleQueryWithProcess(activeWs, {
    type: "query",
    prompt,
    projectId,
    sessionId,
    model,
  });
  return true;
}
