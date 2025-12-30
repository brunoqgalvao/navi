import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { projects, sessions, messages, globalSettings, searchIndex, costEntries } from "../db";
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
  type: "query" | "cancel" | "abort" | "permission_response" | "attach" | "terminal_input" | "terminal_resize" | "terminal_attach" | "terminal_detach" | "exec_start" | "exec_kill";
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
const sessionApprovedAll = new Set<string>();
const connectedClients = new Set<any>();

export function getActiveProcesses() {
  return activeProcesses;
}

export function getPendingPermissions() {
  return pendingPermissions;
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
  const workingDirectory = project?.path || process.cwd();
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
          }
          sendToSession(sessionId, payload);
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

          sendToSession(sessionId, { type: "done", uiSessionId: sessionId, finalMessageId: lastMainAssistantMsgId, usage: msg.lastAssistantUsage });
          if (sessionId) {
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
              for (const pending of pendingPermissions.values()) {
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
