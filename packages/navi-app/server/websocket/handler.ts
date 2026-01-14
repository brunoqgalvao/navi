import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { projects, sessions, messages, globalSettings, searchIndex, costEntries, pendingQuestions as pendingQuestionsDb, kanbanCards, sessionHierarchy, sessionDecisions, cloudExecutions, enabledSkills, skills as skillsDb } from "../db";
import { executeInCloud, type CloudExecutionStage } from "../services/e2b-executor";
import { sessionManager, type SessionEvent } from "../services/session-manager";
import { captureStreamEvent, mergeThinkingBlocks, deleteStreamCapture } from "../services/stream-capture";
import { generateChatTitle } from "../services/title-generator";
import { hasMessageContent, shouldPersistUserMessage, safeSend } from "../services/message-helpers";
import { handlePtyWebSocket, detachFromAllTerminals, cleanupWsExec, type PtyMessage } from "../routes/terminal";
import { resolveNaviClaudeAuth, formatAuthForLog } from "../utils/navi-auth";
import { resolveBunExecutable } from "../utils/bun";
import { resolveClaudeCodeExecutable } from "../utils/claude-code";
import { describePath, writeDebugLog } from "../utils/logging";
// Multi-backend support
import { getAdapter, type BackendId, type NormalizedEvent } from "../backends";
import { mcpSettings, getAllEnabledMcpServers } from "../services/mcp-settings";
import { getCommandContent as getPluginCommandContent, loadAllPlugins } from "../services/plugin-loader";
import {
  executeSessionStartHooks,
  executePostToolUseHooks,
  executeStopHooks,
  getPromptInjections,
  hasHooksForEvent,
} from "../services/hook-executor";
import { readFileSync } from "fs";
import { homedir } from "os";
// Infinite Loop Mode (Ralph Wiggum bot)
import {
  createLoop,
  getLoop,
  getLoopBySession,
  startIteration,
  endIteration,
  updateLoopContext,
  shouldStopLoop,
  shouldResetContext,
  completeLoop,
  failLoop,
  stopLoop,
  generateHandoffPrompt,
  generateStatusMd,
  type LoopState,
} from "../services/loop-manager";
import { runVerifier, quickVerifyCheck } from "../services/verifier-agent";

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
  // Agent selection (e.g., @coder, @img3d)
  agentId?: string;
  // Backend selection (claude, codex, gemini)
  backend?: "claude" | "codex" | "gemini";
  // Plan mode - Claude plans before acting, no execution until approved
  planMode?: boolean;
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
  // Cloud execution fields
  executionMode?: "local" | "cloud";
  cloudRepoUrl?: string;
  cloudBranch?: string;
}

interface ActiveProcess {
  process: ChildProcess;
  ws: any | null;
  sessionId: string;
}

const activeProcesses = new Map<string, ActiveProcess>();
const pendingPermissions = new Map<string, { sessionId: string; payload: any }>();
const pendingQuestions = new Map<string, { sessionId: string; payload: any }>();
const pendingWaits = new Map<string, { sessionId: string; proc: ChildProcess; endTime: number; reason: string }>();
const sessionApprovedAll = new Set<string>();
const connectedClients = new Set<any>();

// Track active cloud executions (sessionId -> executionId)
const activeCloudExecutions = new Map<string, { executionId: string; ws: any; aborted: boolean }>();

/**
 * Expand plugin slash commands in the prompt
 * Converts /owner/repo:commandName args to the actual command content
 */
function expandPluginCommands(prompt: string, projectPath: string): string {
  if (!prompt) return prompt;

  // Match /owner/repo:command pattern at the start of prompt
  // Allows alphanumeric, dash, underscore, and dot in owner/repo/command names
  const pluginCommandMatch = prompt.match(/^\/([\w.-]+\/[\w.-]+):([\w.-]+)(?:\s+(.*))?$/);
  if (!pluginCommandMatch) {
    return prompt;
  }

  const [, pluginId, commandName, args] = pluginCommandMatch;

  // Check if this plugin is enabled
  const userSettingsPath = join(homedir(), ".claude", "settings.json");
  const projectSettingsPath = join(projectPath, ".claude", "settings.json");

  let userSettings: any = {};
  let projectSettings: any = {};

  try {
    if (existsSync(userSettingsPath)) {
      userSettings = JSON.parse(readFileSync(userSettingsPath, "utf-8"));
    }
  } catch {}

  try {
    if (existsSync(projectSettingsPath)) {
      projectSettings = JSON.parse(readFileSync(projectSettingsPath, "utf-8"));
    }
  } catch {}

  const isEnabled =
    projectSettings.enabledPlugins?.[pluginId] ||
    userSettings.enabledPlugins?.[pluginId];

  if (!isEnabled) {
    // Plugin not enabled, return original prompt
    return prompt;
  }

  // Get command content
  const commandContent = getPluginCommandContent(pluginId, commandName, args);

  if (!commandContent) {
    // Command not found, return original prompt
    return prompt;
  }

  // Return expanded command content
  return commandContent;
}

/**
 * Clean up all server-side state for a session.
 * Call this when a session is deleted to prevent memory leaks.
 */
export function cleanupSessionState(sessionId: string) {
  // Clean active processes
  const active = activeProcesses.get(sessionId);
  if (active) {
    active.process.kill("SIGTERM");
    activeProcesses.delete(sessionId);
  }

  // Clean session approval state
  sessionApprovedAll.delete(sessionId);

  // Clean until-done state
  untilDoneSessions.delete(sessionId);

  // Clean pending permissions for this session
  for (const [reqId, req] of pendingPermissions) {
    if (req.sessionId === sessionId) {
      pendingPermissions.delete(reqId);
    }
  }

  // Clean pending questions for this session (memory + database)
  for (const [reqId, req] of pendingQuestions) {
    if (req.sessionId === sessionId) {
      pendingQuestions.delete(reqId);
    }
  }
  pendingQuestionsDb.deleteBySession(sessionId);

  // Clean pending escalations for this session
  for (const [reqId, esc] of pendingEscalations) {
    if (esc.sessionId === sessionId) {
      pendingEscalations.delete(reqId);
    }
  }

  // Clean child session workers
  const childWorker = childSessionWorkers.get(sessionId);
  if (childWorker) {
    childWorker.kill("SIGTERM");
    childSessionWorkers.delete(sessionId);
  }

  // Clean active cloud executions
  const cloudExec = activeCloudExecutions.get(sessionId);
  if (cloudExec) {
    cloudExec.aborted = true;
    activeCloudExecutions.delete(sessionId);
  }

  // Clean stream capture
  deleteStreamCapture(sessionId);
}

/**
 * Get current memory stats for debugging
 */
export function getMemoryStats() {
  return {
    activeProcesses: activeProcesses.size,
    pendingPermissions: pendingPermissions.size,
    pendingQuestions: pendingQuestions.size,
    sessionApprovedAll: sessionApprovedAll.size,
    untilDoneSessions: untilDoneSessions.size,
    pendingEscalations: pendingEscalations.size,
    childSessionWorkers: childSessionWorkers.size,
    connectedClients: connectedClients.size,
  };
}

// Until Done mode tracking (basic mode)
interface UntilDoneState {
  enabled: boolean;
  iteration: number;
  maxIterations: number;
  originalPrompt: string;
  projectId: string;
  model?: string;
  totalCost: number;
  // Enhanced infinite loop mode
  infiniteMode?: boolean;         // Use full infinite loop with verifier
  loopId?: string;                // Loop manager ID for persistence
  definitionOfDone?: string[];    // User-defined completion criteria
  contextResetThreshold?: number; // Default 0.7 (70%)
  verifierModel?: "haiku" | "sonnet";
  lastTokenCount?: number;        // Track context usage
  contextWindow?: number;         // Project's context window size
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

/**
 * Extract a summary from the assistant's last output for loop tracking
 */
function extractIterationSummary(content: any[]): string {
  // Look for text content and extract a meaningful summary
  const textBlocks = content.filter((b: any) => b?.type === "text");
  if (textBlocks.length === 0) return "";

  const lastText = textBlocks[textBlocks.length - 1]?.text || "";

  // Try to find summary-like content
  const summaryMatch = lastText.match(/(?:summary|completed|done|finished|progress)[:\s]*([^\n]{20,200})/i);
  if (summaryMatch) {
    return summaryMatch[1].trim();
  }

  // Look for task completion mentions
  const taskMatch = lastText.match(/(?:I(?:'ve| have)|successfully|completed)[^\n]{10,150}/i);
  if (taskMatch) {
    return taskMatch[0].trim();
  }

  // Fallback: last meaningful paragraph (truncated)
  const paragraphs = lastText.split(/\n\n+/).filter((p: string) => p.trim().length > 20);
  if (paragraphs.length > 0) {
    return paragraphs[paragraphs.length - 1].trim().slice(0, 150) + "...";
  }

  return "Work in progress";
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

/**
 * Enable enhanced infinite loop mode with verifier agent and context reset
 */
export function enableInfiniteLoop(
  sessionId: string,
  originalPrompt: string,
  projectId: string,
  options: {
    model?: string;
    maxIterations?: number;
    maxCost?: number;
    definitionOfDone?: string[];
    contextResetThreshold?: number;
    verifierModel?: "haiku" | "sonnet";
    contextWindow?: number;
  } = {}
) {
  // Create persistent loop state
  const loop = createLoop({
    sessionId,
    projectId,
    originalPrompt,
    definitionOfDone: options.definitionOfDone || [
      "Task is functionally complete",
      "No obvious errors or bugs",
    ],
    workerModel: options.model,
    verifierModel: options.verifierModel ?? "haiku",
    maxIterations: options.maxIterations ?? 100, // Effectively infinite
    maxCost: options.maxCost ?? 50,
    contextResetThreshold: options.contextResetThreshold ?? 0.7,
  });

  // Start first iteration
  startIteration(loop.loopId);

  untilDoneSessions.set(sessionId, {
    enabled: true,
    iteration: 1,
    maxIterations: options.maxIterations ?? 100,
    originalPrompt,
    projectId,
    model: options.model,
    totalCost: 0,
    // Enhanced mode
    infiniteMode: true,
    loopId: loop.loopId,
    definitionOfDone: options.definitionOfDone,
    contextResetThreshold: options.contextResetThreshold ?? 0.7,
    verifierModel: options.verifierModel ?? "haiku",
    contextWindow: options.contextWindow ?? 200000,
  });

  console.log(`[InfiniteLoop] Started loop ${loop.loopId} for session ${sessionId}`);
  return loop;
}

export function disableUntilDone(sessionId: string) {
  const state = untilDoneSessions.get(sessionId);
  if (state?.loopId) {
    // Stop the persistent loop
    stopLoop(state.loopId);
  }
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
 * Get enabled skill slugs for a project
 * Returns slugs of skills enabled globally + skills enabled specifically for this project
 */
function getEnabledSkillSlugs(projectId: string): string[] {
  const globalEnabled = enabledSkills.listGlobal();
  const projectEnabled = enabledSkills.listByProject(projectId);

  const seenIds = new Set<string>();
  const slugs: string[] = [];

  for (const e of [...globalEnabled, ...projectEnabled]) {
    if (seenIds.has(e.skill_id)) continue;
    seenIds.add(e.skill_id);

    const skill = skillsDb.get(e.skill_id);
    if (skill) {
      slugs.push(skill.slug);
    }
  }

  return slugs;
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
 *
 * For Claude backend: uses query-worker subprocess with Claude SDK
 * For Codex/Gemini: uses adapter system directly (no multi-session tools)
 */
function startChildSessionQuery(
  childSessionId: string,
  config: {
    prompt: string;
    cwd: string;
    model: string;
    projectId: string;
    backend?: string;
  }
) {
  const childSession = sessions.get(childSessionId);
  if (!childSession) {
    console.error(`[MultiSession] Child session ${childSessionId} not found`);
    return;
  }

  const effectiveBackend = (config.backend || 'claude') as BackendId;

  // Route non-Claude backends to adapter system
  if (effectiveBackend !== 'claude') {
    startChildSessionWithAdapter(childSessionId, config, effectiveBackend);
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
    agentType: childSession.agent_type || undefined,  // Pass agent type for native UI prompts
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

  // Get enabled skills for child session (inherit from project)
  const childEnabledSkillSlugs = config.projectId ? getEnabledSkillSlugs(config.projectId) : undefined;

  const inputJson = JSON.stringify({
    prompt: config.prompt,
    cwd: config.cwd,
    model: config.model,
    sessionId: childSessionId,
    backend: config.backend, // Pass backend for non-Claude models (codex, gemini)
    permissionSettings: {
      autoAcceptAll: true, // Auto-accept for child sessions
      requireConfirmation: [],
    },
    multiSession: multiSessionContext,
    enabledSkillSlugs: childEnabledSkillSlugs, // Inherit enabled skills from project
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
  delete workerEnv.NAVI_ANTHROPIC_API_KEY;
  delete workerEnv.NAVI_ANTHROPIC_BASE_URL;

  // Resolve and inject auth for child session (inherit from parent settings, not OAuth default)
  const authResult = resolveNaviClaudeAuth(config.model);

  if (authResult.overrides.apiKey) {
    workerEnv.NAVI_ANTHROPIC_API_KEY = authResult.overrides.apiKey;
  }
  if (authResult.overrides.baseUrl) {
    workerEnv.NAVI_ANTHROPIC_BASE_URL = authResult.overrides.baseUrl;
  }
  workerEnv.NAVI_AUTH_MODE = authResult.mode;
  workerEnv.NAVI_AUTH_SOURCE = authResult.source;

  const resolvedBunPath = resolveBunExecutable();
  const bunPath = resolvedBunPath ?? "bun";

  // Save the initial user message to the database
  const userMsgId = crypto.randomUUID();
  const now = Date.now();
  messages.upsert(
    userMsgId,
    childSessionId,
    "user",
    JSON.stringify([{ type: "text", text: config.prompt }]),
    now,
    null,
    0
  );

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
    childSessionWorkers.delete(childSessionId);
  });

  childProc.on("error", (err) => {
    console.error(`[MultiSession] Child worker ${childSessionId} error:`, err);
    childSessionWorkers.delete(childSessionId);
  });
}

/**
 * Start a child session using the backend adapter system (for Codex, Gemini, etc.)
 * Note: Adapter-based child sessions don't support multi-session tools (spawn_agent, etc.)
 * They run as simple single-turn queries and auto-deliver results.
 */
async function startChildSessionWithAdapter(
  childSessionId: string,
  config: {
    prompt: string;
    cwd: string;
    model: string;
    projectId: string;
  },
  backendId: BackendId
) {
  const childSession = sessions.get(childSessionId);
  if (!childSession) {
    console.error(`[MultiSession] Child session ${childSessionId} not found`);
    return;
  }

  // Save the initial user message
  const userMsgId = crypto.randomUUID();
  const now = Date.now();
  messages.upsert(
    userMsgId,
    childSessionId,
    "user",
    JSON.stringify([{ type: "text", text: config.prompt }]),
    now,
    null,
    0
  );

  // Get the adapter
  const adapter = getAdapter(backendId);

  // Update session to working status
  sessionHierarchy.updateAgentStatus(childSessionId, "working");

  // Broadcast start
  broadcastToClients({
    type: "system",
    subtype: "status",
    uiSessionId: childSessionId,
    status: `Starting ${backendId} agent...`,
  });

  let lastContent: any[] = [];

  try {
    // Run query through adapter
    for await (const event of adapter.query({
      prompt: config.prompt,
      cwd: config.cwd,
      sessionId: childSessionId,
      model: config.model,
      permissionMode: "auto", // Auto-accept for child sessions
    })) {
      // Broadcast events
      const uiEvent = convertNormalizedEventToUI(event, childSessionId);
      if (uiEvent) {
        broadcastToClients(uiEvent);
      }

      // Persist assistant messages
      if (event.type === "assistant") {
        const msgId = crypto.randomUUID();
        messages.upsert(
          msgId,
          childSessionId,
          "assistant",
          JSON.stringify(event.content),
          Date.now(),
          null,
          0
        );
        lastContent = event.content;
      }
    }

    // Auto-deliver results from adapter-based child sessions
    const summary = lastContent
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
      .slice(0, 500);

    sessionManager.deliver(childSessionId, {
      type: "research", // Generic type for adapter results
      summary: summary || `Completed with ${backendId}`,
      content: JSON.stringify(lastContent),
    });

  } catch (error: any) {
    console.error(`[MultiSession] Child ${childSessionId} (${backendId}) error:`, error.message);

    // Broadcast error
    broadcastToClients({
      type: "error",
      uiSessionId: childSessionId,
      error: error.message,
      backend: backendId,
    });

    // Mark as delivered with error
    sessionManager.deliver(childSessionId, {
      type: "error",
      summary: `Error: ${error.message}`,
      content: error.message,
    });
  }
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
      backend: msg.backend,  // Pass backend for multi-model dispatch
      context: msg.context,
      agentType: msg.agent_type,
    });

    if (child) {
      sendWorkerResponse(proc, "multi_session_spawn_response", msg.requestId, {
        success: true,
        childSessionId: child.id,
      });

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

        // Start the child query in the background
        // We use setTimeout to not block the parent's spawn response
        setTimeout(() => {
          startChildSessionQuery(child.id, {
            prompt: initialPrompt,
            cwd: workingDirectory,
            model: msg.model || parentSession.model || "opus",
            projectId: parentSession.project_id,
            backend: msg.backend || parentSession.backend || "claude",
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

    // Inject the deliverable into the parent session's conversation
    if (childSession?.parent_session_id) {
      // Try to inject into running parent process (if active)
      const parentProc = activeProcesses.get(childSession.parent_session_id)?.process;
      if (parentProc?.stdin) {
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
      }

      // Always create a synthetic message in the parent's conversation and broadcast to UI
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

      // Broadcast to UI (always, even if parent process isn't running)
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

// ============================================================================
// Wait/Pause Handler Functions
// ============================================================================

/**
 * Handle wait start from worker - broadcast to UI and store for skip
 */
function handleSessionWaitStart(proc: ChildProcess, sessionId: string | undefined, msg: any) {
  if (!sessionId) return;

  const endTime = Date.now() + (msg.seconds * 1000);

  // Store for skip functionality
  pendingWaits.set(msg.requestId, {
    sessionId,
    proc,
    endTime,
    reason: msg.reason || "Waiting...",
  });

  // Broadcast to UI
  sendToSession(sessionId, {
    type: "session:wait_start",
    requestId: msg.requestId,
    sessionId,
    seconds: msg.seconds,
    endTime,
    reason: msg.reason || "Waiting...",
  });
}

/**
 * Handle wait end from worker - cleanup and notify UI
 */
function handleSessionWaitEnd(sessionId: string | undefined, msg: any) {
  pendingWaits.delete(msg.requestId);

  if (sessionId) {
    sendToSession(sessionId, {
      type: "session:wait_end",
      requestId: msg.requestId,
      sessionId,
      skipped: msg.skipped || false,
    });
  }
}

/**
 * Skip a pending wait - called from UI action
 */
export function skipSessionWait(requestId: string): boolean {
  const pending = pendingWaits.get(requestId);
  if (!pending) {
    return false;
  }

  // Send skip response to worker
  sendWorkerResponse(pending.proc, "session_wait_skip", requestId, {
    skipped: true,
  });

  pendingWaits.delete(requestId);
  return true;
}

/**
 * Get all active waits for a session
 */
export function getActiveWaits(sessionId: string): Array<{ requestId: string; endTime: number; reason: string }> {
  const waits: Array<{ requestId: string; endTime: number; reason: string }> = [];
  for (const [requestId, wait] of pendingWaits) {
    if (wait.sessionId === sessionId) {
      waits.push({ requestId, endTime: wait.endTime, reason: wait.reason });
    }
  }
  return waits;
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

/**
 * Handle queries using the multi-backend adapter system (Codex, Gemini)
 * This runs the query through the appropriate backend adapter and
 * normalizes events to match the Claude SDK format for the UI.
 */
async function handleQueryWithAdapter(ws: any, data: ClientMessage, backendId: BackendId) {
  const { prompt, projectId, sessionId, model, historyContext } = data;

  const session = sessionId ? sessions.get(sessionId) : null;
  const project = projectId ? projects.get(projectId) : null;
  const workingDirectory = project?.path || process.cwd();

  // Save user message
  if (sessionId && prompt) {
    const msgId = crypto.randomUUID();
    const now = Date.now();
    messages.create(msgId, sessionId, "user", JSON.stringify(prompt), now);
    searchIndex.indexMessage(msgId, sessionId, JSON.stringify(prompt), now);
  }

  // Get permission settings
  const permissionSettings = globalSettings.getPermissions();
  const isAutoApprove = permissionSettings.autoAcceptAll ||
    (sessionId ? sessionApprovedAll.has(sessionId) : false) ||
    session?.auto_accept_all === 1 ||
    project?.auto_accept_all === 1;

  // Get the adapter
  const adapter = getAdapter(backendId);

  // Emit query_start
  safeSend(ws, {
    type: "query_start",
    uiSessionId: sessionId,
    backend: backendId,
  });

  try {
    // Run query through adapter
    for await (const event of adapter.query({
      prompt: historyContext ? `${historyContext}\n\nUser's new message:\n${prompt}` : prompt || "",
      cwd: workingDirectory,
      sessionId: sessionId || crypto.randomUUID(),
      model,
      permissionMode: isAutoApprove ? "auto" : "confirm",
    })) {
      // Convert normalized events to UI format
      const uiEvent = convertNormalizedEventToUI(event, sessionId);
      if (uiEvent) {
        safeSend(ws, uiEvent);

        // Persist assistant messages
        if (event.type === "assistant" && sessionId) {
          const msgId = crypto.randomUUID();
          const now = Date.now();
          messages.create(msgId, sessionId, "assistant", JSON.stringify(event.content), now);
          sessions.updateClaudeSession(null, model || null, 0, 1, 0, 0, now, sessionId);
        }
      }
    }

    // Emit completion - use uiSessionId for the messageHandler
    safeSend(ws, {
      type: "query_complete",
      uiSessionId: sessionId,
      backend: backendId,
    });

  } catch (error: any) {
    console.error(`[${sessionId}] ${backendId} adapter error:`, error.message);
    safeSend(ws, {
      type: "error",
      uiSessionId: sessionId,
      error: error.message,
      backend: backendId,
    });
  }
}

/**
 * Convert normalized backend events to UI-compatible format
 */
function convertNormalizedEventToUI(event: NormalizedEvent, sessionId?: string): any {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();

  switch (event.type) {
    case "system":
      return {
        type: "system",
        subtype: event.subtype,
        uiSessionId: sessionId,
        ...(event.subtype === "init" && {
          backend: event.backendId,
          model: event.model,
          cwd: event.cwd,
          tools: event.tools,
        }),
        ...(event.subtype === "status" && {
          status: event.status,
        }),
        uuid,
        timestamp,
      };

    case "assistant":
      return {
        type: "assistant",
        uiSessionId: sessionId,
        content: event.content,
        parentToolUseId: event.parentToolUseId || null,
        usage: event.usage,
        uuid,
        timestamp,
      };

    case "user":
      return {
        type: "user",
        uiSessionId: sessionId,
        content: event.content,
        parentToolUseId: event.parentToolUseId || null,
        uuid,
        timestamp,
      };

    case "tool_progress":
      return {
        type: "tool_progress",
        uiSessionId: sessionId,
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        elapsedTimeSeconds: event.elapsedTimeSeconds,
        uuid,
        timestamp,
      };

    case "result":
      return {
        type: "result",
        uiSessionId: sessionId,
        subtype: event.subtype,
        costUsd: event.costUsd,
        durationMs: event.durationMs,
        numTurns: event.numTurns,
        isError: event.isError,
        result: event.result,
        errors: event.errors,
        uuid,
        timestamp,
      };

    case "error":
      return {
        type: "error",
        uiSessionId: sessionId,
        error: event.error,
        code: event.code,
        uuid,
        timestamp,
      };

    case "complete":
      return {
        type: "complete",
        uiSessionId: sessionId,
        lastAssistantContent: event.lastAssistantContent,
        resultData: event.resultData,
        uuid,
        timestamp,
      };

    default:
      return null;
  }
}

export function handleQueryWithProcess(ws: any, data: ClientMessage) {
  const { prompt, projectId, sessionId, claudeSessionId, allowedTools, model, historyContext, agentId, backend, planMode } = data;

  // Determine which backend to use (default: claude)
  const effectiveBackend: BackendId = backend ||
    (sessionId ? (sessions.get(sessionId)?.backend as BackendId) : undefined) ||
    (projectId ? (projects.get(projectId)?.default_backend as BackendId) : undefined) ||
    "claude";

  // Update session backend if specified
  if (sessionId && backend) {
    sessions.updateBackend(backend, sessionId);
  }

  // Route to appropriate backend adapter for non-Claude backends
  if (effectiveBackend !== "claude") {
    handleQueryWithAdapter(ws, data, effectiveBackend);
    return;
  }

  const session = sessionId ? sessions.get(sessionId) : null;
  const project = projectId ? projects.get(projectId) : null;

  // Use worktree path if session has one AND the directory still exists
  // This handles the case where a worktree was merged/deleted but the session still references it
  let workingDirectory = project?.path || process.cwd();
  let worktreeWasCleared = false;
  if (session?.worktree_path) {
    if (existsSync(session.worktree_path)) {
      workingDirectory = session.worktree_path;
    } else {
      // Worktree was deleted (e.g., after merge), clear it from the session and use project path
      // Also clears claude_session_id since that session was tied to the worktree cwd
      sessions.clearWorktree(sessionId!);
      worktreeWasCleared = true;
    }
  }
  const defaultWorkerCwd = join(__dirname, "..");
  const execDir = process.execPath ? dirname(process.execPath) : process.cwd();
  const workerCwd = existsSync(defaultWorkerCwd) ? defaultWorkerCwd : execDir;

  const permissionSettings = globalSettings.getPermissions();

  const needsAutoTitle = session?.title === "New Chat" || session?.title === "New conversation";

  if (sessionId && prompt) {
    const msgId = crypto.randomUUID();
    const now = Date.now();
    messages.create(msgId, sessionId, "user", JSON.stringify(prompt), now);
    searchIndex.indexMessage(msgId, sessionId, JSON.stringify(prompt), now);
  }

  // Plan mode system prompt - instructs Claude to plan only, no execution
  const PLAN_MODE_INSTRUCTION = `
[PLAN MODE ENABLED]
You MUST operate in planning-only mode. DO NOT execute any code, make file changes, or run commands.

Instead:
1. Analyze the user's request thoroughly
2. Create a detailed, step-by-step implementation plan
3. Present the plan using the TodoWrite tool with all steps as "pending" status
4. Each step should be specific and actionable (e.g., "Create auth middleware in src/middleware/auth.ts")
5. Note which files will be created/modified for each step
6. After presenting the plan, ask: "Ready to execute this plan, or would you like to refine it?"

DO NOT use any tools except:
- TodoWrite (to present the plan)
- Read, Glob, Grep (to understand existing code for planning)

The user will explicitly approve the plan before any execution begins.
`;

  // Expand plugin commands if present (e.g., /owner/plugin:command args)
  const expandedPrompt = workingDirectory ? expandPluginCommands(prompt || "", workingDirectory) : prompt;

  let effectivePrompt = historyContext
    ? `${historyContext}\n\nUser's new message:\n${expandedPrompt}`
    : expandedPrompt;

  // Execute SessionStart hooks from enabled plugins (async, don't block)
  if (workingDirectory && hasHooksForEvent(workingDirectory, "SessionStart")) {
    executeSessionStartHooks(workingDirectory, sessionId).then((results) => {
      const injections = getPromptInjections(results);
      if (injections.length > 0) {
        // Log hook injections (they're already sent to Claude via the prompt system)
        console.log(`[Hooks] SessionStart injections for ${sessionId}:`, injections.length);
      }
      // Log any errors
      for (const r of results) {
        if (!r.result.success) {
          console.error(`[Hooks] SessionStart hook error (${r.pluginId}):`, r.result.error);
        }
      }
    }).catch(err => {
      console.error("[Hooks] SessionStart error:", err);
    });
  }

  // Inject plan mode instruction if enabled
  if (planMode) {
    effectivePrompt = `${PLAN_MODE_INSTRUCTION}\n\n${effectivePrompt}`;
  }

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
      agentType: session.agent_type || undefined,  // Pass agent type for native UI prompts
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

  // Don't resume if the worktree was just cleared - the old Claude session was tied to the worktree cwd
  const effectiveResumeId = worktreeWasCleared ? undefined : (claudeSessionId || session?.claude_session_id);

  // Get enabled skills for this project (global + project-specific)
  const enabledSkillSlugs = projectId ? getEnabledSkillSlugs(projectId) : undefined;

  const inputJson = JSON.stringify({
    prompt: effectivePrompt,
    cwd: workingDirectory,
    resume: effectiveResumeId,
    model,
    allowedTools: allowedTools || permissionSettings.allowedTools,
    sessionId,
    agentId, // Selected agent (e.g., "coder", "img3d")
    permissionSettings: {
      autoAcceptAll: permissionSettings.autoAcceptAll || isSessionApprovedAll || isProjectApprovedAll,
      requireConfirmation: permissionSettings.requireConfirmation,
    },
    multiSession: multiSessionContext,
    mcpSettings: mcpSettings.getAll(workingDirectory), // Pass MCP server enabled/disabled states (for external servers)
    mcpBuiltinSettings: {  // Pass built-in MCP server enabled/disabled states separately
      "user-interaction": !mcpSettings.isDisabledBuiltin("user-interaction", workingDirectory),
      "navi-context": !mcpSettings.isDisabledBuiltin("navi-context", workingDirectory),
      "multi-session": !mcpSettings.isDisabledBuiltin("multi-session", workingDirectory),
    },
    externalMcpServers: getAllEnabledMcpServers(workingDirectory), // Pass enabled external MCP + plugin MCP server configs
    enabledSkillSlugs, // Skills enabled for this project (undefined = load all)
  });

  const workerEnv = { ...process.env };
  delete workerEnv.ANTHROPIC_API_KEY;
  delete workerEnv.ANTHROPIC_BASE_URL;
  delete workerEnv.NAVI_ANTHROPIC_API_KEY;
  delete workerEnv.NAVI_ANTHROPIC_BASE_URL;

  const authResult = resolveNaviClaudeAuth(model);

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
          handleMultiSessionSpawn(child, sessionId, msg);
        } else if (msg.type === "multi_session_get_context") {
          handleMultiSessionGetContext(child, sessionId, msg);
        } else if (msg.type === "multi_session_escalate") {
          handleMultiSessionEscalate(child, sessionId, msg);
        } else if (msg.type === "multi_session_deliver") {
          handleMultiSessionDeliver(child, sessionId, msg);
        } else if (msg.type === "multi_session_log_decision") {
          handleMultiSessionLogDecision(child, sessionId, msg);
        }
        // ═══════════════════════════════════════════════════════════════
        // WAIT/PAUSE: Agent is waiting for a duration
        // ═══════════════════════════════════════════════════════════════
        else if (msg.type === "session_wait_start") {
          handleSessionWaitStart(child, sessionId, msg);
        } else if (msg.type === "session_wait_end") {
          handleSessionWaitEnd(sessionId, msg);
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
            const totalInputTokens = (contextUsage.input_tokens || 0) +
              (contextUsage.cache_creation_input_tokens || 0) +
              (contextUsage.cache_read_input_tokens || 0);
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

            // Calculate current context usage
            const contextUsage = msg.lastAssistantUsage || msg.resultData?.usage || {};
            const currentTokens = (contextUsage.input_tokens || 0) +
              (contextUsage.cache_creation_input_tokens || 0) +
              (contextUsage.cache_read_input_tokens || 0) +
              (contextUsage.output_tokens || 0);
            untilDoneState.lastTokenCount = currentTokens;

            // ═══════════════════════════════════════════════════════════════
            // INFINITE LOOP MODE (with verifier + context reset)
            // ═══════════════════════════════════════════════════════════════
            if (untilDoneState.infiniteMode && untilDoneState.loopId) {
              const loopState = getLoop(untilDoneState.loopId);
              if (!loopState) {
                console.error(`[InfiniteLoop] Loop ${untilDoneState.loopId} not found, falling back to basic mode`);
                untilDoneState.infiniteMode = false;
              } else {
                // End current iteration and record results
                endIteration(loopState.loopId, {
                  tokensUsed: currentTokens,
                  costUsd,
                  outcome: "partial",
                  summary: extractIterationSummary(msg.lastAssistantContent || []),
                });

                // Check if we should stop the loop
                const stopCheck = shouldStopLoop(loopState.loopId);
                if (stopCheck.stop) {
                  console.log(`[InfiniteLoop] Stopping: ${stopCheck.reason}`);
                  completeLoop(loopState.loopId, stopCheck.reason!);

                  sendToSession(sessionId, {
                    type: "until_done_complete",
                    uiSessionId: sessionId,
                    totalIterations: untilDoneState.iteration,
                    totalCost: untilDoneState.totalCost,
                    reason: stopCheck.reason,
                    loopId: loopState.loopId,
                  });

                  untilDoneSessions.delete(sessionId);
                  // Continue to send "done" message below
                } else {
                  // Check context usage - reset at 70% threshold
                  const contextWindow = untilDoneState.contextWindow || 200000;
                  const contextPercent = currentTokens / contextWindow;
                  const needsContextReset = contextPercent >= (untilDoneState.contextResetThreshold || 0.7);

                  console.log(`[InfiniteLoop] Iteration ${untilDoneState.iteration} complete. Context: ${Math.round(contextPercent * 100)}% (${currentTokens}/${contextWindow})`);

                  // Run verifier agent to check if truly done
                  (async () => {
                    try {
                      sendToSession(sessionId, {
                        type: "until_done_verifying",
                        uiSessionId: sessionId,
                        iteration: untilDoneState.iteration,
                        message: "Running verifier agent...",
                      });

                      const verifierResult = await runVerifier(loopState, workingDirectory);
                      console.log(`[InfiniteLoop] Verifier decision:`, verifierResult.decision);

                      // Update costs
                      untilDoneState.totalCost += verifierResult.costUsd;

                      if (verifierResult.decision.complete) {
                        // DONE - Task is verified complete
                        completeLoop(loopState.loopId, verifierResult.decision.reason);

                        sendToSession(sessionId, {
                          type: "until_done_complete",
                          uiSessionId: sessionId,
                          totalIterations: untilDoneState.iteration,
                          totalCost: untilDoneState.totalCost,
                          reason: `Verified complete: ${verifierResult.decision.reason}`,
                          loopId: loopState.loopId,
                          confidence: verifierResult.decision.confidence,
                        });

                        untilDoneSessions.delete(sessionId);
                        sendToSession(sessionId, { type: "done", uiSessionId: sessionId, claudeSessionId: msg.resultData?.session_id, finalMessageId: lastMainAssistantMsgId, usage: msg.lastAssistantUsage });
                        return;
                      }

                      if (!verifierResult.decision.shouldContinue) {
                        // Stuck or blocked - stop the loop
                        failLoop(loopState.loopId, verifierResult.decision.reason);

                        sendToSession(sessionId, {
                          type: "until_done_complete",
                          uiSessionId: sessionId,
                          totalIterations: untilDoneState.iteration,
                          totalCost: untilDoneState.totalCost,
                          reason: `Stopped: ${verifierResult.decision.reason}`,
                          loopId: loopState.loopId,
                        });

                        untilDoneSessions.delete(sessionId);
                        sendToSession(sessionId, { type: "done", uiSessionId: sessionId, claudeSessionId: msg.resultData?.session_id, finalMessageId: lastMainAssistantMsgId, usage: msg.lastAssistantUsage });
                        return;
                      }

                      // NOT DONE - Continue with next iteration
                      untilDoneState.iteration++;
                      startIteration(loopState.loopId);

                      // Clean up current process tracking
                      activeProcesses.delete(sessionId);
                      deleteStreamCapture(sessionId);

                      // Determine continuation prompt
                      let continuationPrompt: string;
                      let newClaudeSessionId: string | undefined;

                      if (needsContextReset) {
                        // CONTEXT RESET - Start fresh session with handoff prompt
                        console.log(`[InfiniteLoop] Context reset triggered (${Math.round(contextPercent * 100)}% used)`);

                        // Update loop state with context for handoff
                        if (verifierResult.decision.updatedContext) {
                          updateLoopContext(loopState.loopId, verifierResult.decision.updatedContext);
                        }

                        // Mark this iteration as having a context reset
                        const currentIter = loopState.iterations[loopState.iterations.length - 1];
                        if (currentIter) currentIter.contextResetAfter = true;

                        // Generate handoff prompt for fresh session
                        const freshLoopState = getLoop(loopState.loopId)!;
                        continuationPrompt = generateHandoffPrompt(freshLoopState);
                        newClaudeSessionId = undefined; // Force new Claude session

                        sendToSession(sessionId, {
                          type: "until_done_context_reset",
                          uiSessionId: sessionId,
                          iteration: untilDoneState.iteration,
                          contextPercent: Math.round(contextPercent * 100),
                          message: "Context reset - starting fresh session with preserved state",
                        });
                      } else {
                        // Same session continuation
                        continuationPrompt = verifierResult.decision.nextActionHint
                          ? `Continue working on the task. Focus on: ${verifierResult.decision.nextActionHint}`
                          : "Continue working on the task. Check your progress and keep going until everything is complete.";
                        newClaudeSessionId = msg.resultData?.session_id;
                      }

                      // Notify UI about continuation
                      sendToSession(sessionId, {
                        type: "until_done_continue",
                        uiSessionId: sessionId,
                        iteration: untilDoneState.iteration,
                        maxIterations: untilDoneState.maxIterations,
                        totalCost: untilDoneState.totalCost,
                        reason: verifierResult.decision.reason,
                        contextReset: needsContextReset,
                        contextPercent: Math.round(contextPercent * 100),
                        nextAction: verifierResult.decision.nextActionHint,
                      });

                      // Re-invoke with continuation/handoff prompt
                      setTimeout(() => {
                        handleQueryWithProcess(ws, {
                          prompt: continuationPrompt,
                          projectId: untilDoneState.projectId,
                          sessionId,
                          claudeSessionId: newClaudeSessionId,
                          model: untilDoneState.model,
                        });
                      }, 500);

                    } catch (verifierError) {
                      console.error(`[InfiniteLoop] Verifier error:`, verifierError);

                      // On verifier error, continue without verification
                      untilDoneState.iteration++;
                      activeProcesses.delete(sessionId);
                      deleteStreamCapture(sessionId);

                      sendToSession(sessionId, {
                        type: "until_done_continue",
                        uiSessionId: sessionId,
                        iteration: untilDoneState.iteration,
                        maxIterations: untilDoneState.maxIterations,
                        totalCost: untilDoneState.totalCost,
                        reason: "Verifier error - continuing anyway",
                      });

                      setTimeout(() => {
                        handleQueryWithProcess(ws, {
                          prompt: "Continue working on the task. Check your progress and keep going until everything is complete.",
                          projectId: untilDoneState.projectId,
                          sessionId,
                          claudeSessionId: msg.resultData?.session_id,
                          model: untilDoneState.model,
                        });
                      }, 500);
                    }
                  })();

                  return; // Don't send "done" yet - async verifier handling
                }
              }
            }

            // ═══════════════════════════════════════════════════════════════
            // BASIC UNTIL DONE MODE (pattern-based, no verifier)
            // ═══════════════════════════════════════════════════════════════
            if (!untilDoneState.infiniteMode) {
              const { complete, reason } = isTaskLikelyComplete(msg.lastAssistantContent || []);

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
          }

          sendToSession(sessionId, { type: "done", uiSessionId: sessionId, claudeSessionId: msg.resultData?.session_id, finalMessageId: lastMainAssistantMsgId, usage: msg.lastAssistantUsage });
          if (sessionId) {
            // Update kanban card to waiting_review (agent completed, needs user review)
            setKanbanCardReview(sessionId, "Ready for review");
            activeProcesses.delete(sessionId);
            deleteStreamCapture(sessionId);
            // Clear any pending questions for this session (memory + database)
            for (const [reqId, req] of pendingQuestions) {
              if (req.sessionId === sessionId) {
                pendingQuestions.delete(reqId);
              }
            }
            pendingQuestionsDb.deleteBySession(sessionId);

            // Execute Stop hooks from enabled plugins (async, don't block)
            if (workingDirectory && hasHooksForEvent(workingDirectory, "Stop")) {
              executeStopHooks(workingDirectory, sessionId).then((results) => {
                for (const r of results) {
                  if (!r.result.success) {
                    console.error(`[Hooks] Stop hook error (${r.pluginId}):`, r.result.error);
                  }
                }
              }).catch(err => {
                console.error("[Hooks] Stop error:", err);
              });
            }
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
        // Ignore non-JSON stdout
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

/**
 * Detect git remote URL from a local repo path
 */
async function detectGitRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const { execSync } = await import("child_process");

    // Try to get origin remote URL
    const output = execSync("git remote get-url origin 2>/dev/null || git remote get-url $(git remote | head -1) 2>/dev/null", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    if (!output) return null;

    // Convert SSH URLs to HTTPS for cloning in sandbox
    // git@github.com:user/repo.git -> https://github.com/user/repo.git
    if (output.startsWith("git@")) {
      const match = output.match(/^git@([^:]+):(.+)$/);
      if (match) {
        return `https://${match[1]}/${match[2]}`;
      }
    }

    return output;
  } catch {
    return null;
  }
}

/**
 * Handle cloud execution via E2B sandbox
 */
export async function handleCloudQuery(ws: any, data: ClientMessage) {
  const { prompt, projectId, sessionId, model, cloudBranch } = data;
  let { cloudRepoUrl } = data;

  if (!sessionId || !prompt) {
    safeSend(ws, { type: "error", error: "Missing sessionId or prompt for cloud execution" });
    return;
  }

  const project = projectId ? projects.get(projectId) : null;

  // Auto-detect git remote URL if not provided
  if (!cloudRepoUrl && project?.path) {
    try {
      const detectedUrl = await detectGitRemoteUrl(project.path);
      if (detectedUrl) {
        cloudRepoUrl = detectedUrl;
      }
    } catch (e) {
      console.warn(`[${sessionId}] Failed to auto-detect git remote:`, e);
    }
  }

  // Get API key from auth resolution
  const authResult = resolveNaviClaudeAuth(model);
  const apiKey = authResult.overrides.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    safeSend(ws, {
      type: "error",
      uiSessionId: sessionId,
      error: "No Anthropic API key available for cloud execution",
    });
    return;
  }

  // Check for E2B API key
  if (!process.env.E2B_API_KEY) {
    safeSend(ws, {
      type: "error",
      uiSessionId: sessionId,
      error: "E2B_API_KEY not configured. Add it to your environment to enable cloud execution.",
    });
    return;
  }

  // Create execution record
  const executionId = crypto.randomUUID();
  cloudExecutions.create(executionId, sessionId, cloudRepoUrl || null, cloudBranch || null);

  // Track this execution
  activeCloudExecutions.set(sessionId, { executionId, ws, aborted: false });

  // Save user message
  const msgId = crypto.randomUUID();
  const now = Date.now();
  messages.create(msgId, sessionId, "user", JSON.stringify(prompt), now);
  searchIndex.indexMessage(msgId, sessionId, JSON.stringify(prompt), now);

  // Update session to cloud mode
  sessions.setExecutionMode(sessionId, "cloud", cloudRepoUrl, cloudBranch);

  // Send initial status
  safeSend(ws, {
    type: "cloud_execution_started",
    uiSessionId: sessionId,
    executionId,
    repoUrl: cloudRepoUrl,
    branch: cloudBranch,
  });

  // Accumulator for streamed output
  let outputBuffer = "";

  try {
    const result = await executeInCloud(
      {
        sessionId,
        projectId: projectId || "",
        prompt,
        repoUrl: cloudRepoUrl,
        branch: cloudBranch,
        model,
        anthropicApiKey: apiKey,
      },
      // onOutput callback - stream to client
      (output, stream) => {
        const exec = activeCloudExecutions.get(sessionId);
        if (exec?.aborted) return;

        outputBuffer += output;

        safeSend(ws, {
          type: "cloud_output",
          uiSessionId: sessionId,
          executionId,
          stream,
          data: output,
        });
      },
      // onStage callback - update status
      (stage, message) => {
        const exec = activeCloudExecutions.get(sessionId);
        if (exec?.aborted) return;

        cloudExecutions.updateStatus(executionId, stage as any, message);

        safeSend(ws, {
          type: "cloud_stage",
          uiSessionId: sessionId,
          executionId,
          stage,
          message,
        });
      }
    );

    // Store the output as an assistant message
    if (outputBuffer.trim()) {
      const assistantMsgId = crypto.randomUUID();
      messages.create(
        assistantMsgId,
        sessionId,
        "assistant",
        JSON.stringify([{ type: "text", text: outputBuffer }]),
        Date.now()
      );
    }

    // Update execution record
    const syncedFilePaths = result.syncedFiles?.map(f => f.path) || [];
    if (result.success) {
      cloudExecutions.complete(
        executionId,
        result.exitCode,
        result.modifiedFiles || [],
        syncedFilePaths,
        result.duration,
        result.estimatedCostUsd
      );
      sessions.setE2bSandboxId(sessionId, result.sandboxId);
    } else {
      cloudExecutions.fail(executionId, result.error || "Unknown error", result.duration, result.estimatedCostUsd);
    }

    // Send result to client
    safeSend(ws, {
      type: "cloud_result",
      uiSessionId: sessionId,
      executionId,
      success: result.success,
      exitCode: result.exitCode,
      modifiedFiles: result.modifiedFiles,
      syncedFiles: syncedFilePaths,
      duration: result.duration,
      estimatedCostUsd: result.estimatedCostUsd,
      error: result.error,
    });

    // Update kanban card
    if (result.success) {
      const costStr = result.estimatedCostUsd > 0 ? ` (~$${result.estimatedCostUsd.toFixed(4)})` : "";
      setKanbanCardReview(sessionId, `Cloud execution completed${costStr}`);
    } else {
      setKanbanCardReview(sessionId, `Cloud execution failed: ${result.error}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${sessionId}] Cloud execution error:`, errorMessage);

    const estimatedCost = (Date.now() - now) * 0.05 / 3600000; // E2B cost estimate
    cloudExecutions.fail(executionId, errorMessage, Date.now() - now, estimatedCost);

    safeSend(ws, {
      type: "cloud_error",
      uiSessionId: sessionId,
      executionId,
      error: errorMessage,
    });

    setKanbanCardReview(sessionId, `Cloud error: ${errorMessage}`);
  } finally {
    activeCloudExecutions.delete(sessionId);
  }
}

export function createWebSocketHandlers() {
  return {
    open(ws: any) {
      connectedClients.add(ws);
      safeSend(ws, { type: "connected" });
    },

    async message(ws: any, message: any) {
      try {
        const data: ClientMessage = JSON.parse(message.toString());

        if (data.type === "query" && data.prompt) {
          // Update kanban card to in_progress when query starts
          if (data.sessionId) {
            setKanbanCardExecuting(data.sessionId, data.executionMode === "cloud" ? "Running in cloud..." : "Agent working...");
          }
          // Route to cloud or local execution based on mode
          if (data.executionMode === "cloud") {
            handleCloudQuery(ws, data);
          } else {
            handleQueryWithProcess(ws, data);
          }
        } else if (data.type === "abort" && data.sessionId) {
          // Handle local process abort
          const active = activeProcesses.get(data.sessionId);
          if (active) {
            active.process.kill("SIGTERM");
            activeProcesses.delete(data.sessionId);
            safeSend(ws, { type: "aborted", uiSessionId: data.sessionId });
          }
          // Handle cloud execution abort
          const cloudExec = activeCloudExecutions.get(data.sessionId);
          if (cloudExec) {
            cloudExec.aborted = true;
            cloudExecutions.cancel(cloudExec.executionId);
            activeCloudExecutions.delete(data.sessionId);
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
              // Resume kanban card execution when user responds
              if (data.approved && pending.sessionId) {
                setKanbanCardExecuting(pending.sessionId, "Permission granted");
              }
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
              // Resume kanban card execution when user responds
              setKanbanCardExecuting(pending.sessionId, "User responded");
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
