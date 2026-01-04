import { spawn, execSync, type ChildProcess } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { projects, sessions, messages, globalSettings, searchIndex, costEntries } from "../db";
import { captureStreamEvent, mergeThinkingBlocks, deleteStreamCapture } from "../services/stream-capture";
import { generateChatTitle } from "../services/title-generator";
import { hasMessageContent, shouldPersistUserMessage, safeSend } from "../services/message-helpers";

// Get child processes of a given PID
function getChildProcesses(parentPid: number): { pid: number; command: string; runtime: number }[] {
  try {
    // Use pgrep to find children, then ps to get details
    const result = execSync(
      `pgrep -P ${parentPid} 2>/dev/null | xargs -I {} ps -p {} -o pid=,etime=,args= 2>/dev/null || true`,
      { encoding: "utf-8", timeout: 1000 }
    ).trim();

    if (!result) return [];

    return result.split("\n").filter(Boolean).map(line => {
      const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) return null;
      const [, pid, etime, command] = match;
      // Parse etime (format: [[dd-]hh:]mm:ss)
      let runtime = 0;
      const parts = etime.split(/[-:]/).reverse();
      if (parts[0]) runtime += parseInt(parts[0]); // seconds
      if (parts[1]) runtime += parseInt(parts[1]) * 60; // minutes
      if (parts[2]) runtime += parseInt(parts[2]) * 3600; // hours
      if (parts[3]) runtime += parseInt(parts[3]) * 86400; // days
      return { pid: parseInt(pid), command: command.slice(0, 100), runtime };
    }).filter((p): p is { pid: number; command: string; runtime: number } => p !== null);
  } catch {
    return [];
  }
}

// Process monitors for active sessions
const processMonitors = new Map<string, NodeJS.Timeout>();

function startProcessMonitor(sessionId: string, workerPid: number, ws: any) {
  // Clear existing monitor
  const existing = processMonitors.get(sessionId);
  if (existing) clearInterval(existing);

  const monitor = setInterval(() => {
    const children = getChildProcesses(workerPid);
    if (children.length > 0) {
      safeSend(ws, {
        type: "child_processes",
        uiSessionId: sessionId,
        processes: children,
        workerPid,
      });
    }
  }, 2000); // Check every 2 seconds

  processMonitors.set(sessionId, monitor);
}

function stopProcessMonitor(sessionId: string) {
  const monitor = processMonitors.get(sessionId);
  if (monitor) {
    clearInterval(monitor);
    processMonitors.delete(sessionId);
  }
}

// Truncate large tool result content for storage (e.g., base64 images from Read tool)
const MAX_TOOL_RESULT_SIZE = 50000; // ~50KB per tool result
function truncateToolResults(content: any[]): any[] {
  return content.map(block => {
    if (block?.type === "tool_result" && typeof block.content === "string") {
      if (block.content.length > MAX_TOOL_RESULT_SIZE) {
        // Check if it looks like base64 image data
        const isBase64Image = block.content.includes("data:image") ||
          /^[A-Za-z0-9+/=]{1000,}$/.test(block.content.slice(0, 1100));
        if (isBase64Image) {
          return {
            ...block,
            content: "[Image data truncated for storage - use filesystem API to view]",
            _truncated: true,
            _originalSize: block.content.length,
          };
        }
        // For other large content, truncate with notice
        return {
          ...block,
          content: block.content.slice(0, MAX_TOOL_RESULT_SIZE) + `\n\n[...truncated, original size: ${block.content.length} chars]`,
          _truncated: true,
        };
      }
    }
    return block;
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ClientMessage {
  type: "query" | "cancel" | "abort" | "permission_response" | "attach";
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

function sendToSession(sessionId: string | undefined, payload: unknown, fallbackWs?: any) {
  if (sessionId) {
    const active = activeProcesses.get(sessionId);
    if (active?.ws) {
      safeSend(active.ws, payload);
      return;
    }
  }
  safeSend(fallbackWs, payload);
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

  console.log(`[${sessionId}] Spawning worker process in ${workingDirectory}`);

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

  const workerPath = join(__dirname, "..", "query-worker.ts");
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

  const preferredAuth = globalSettings.get("preferredAuth") as "oauth" | "api_key" | null;
  const storedApiKey = globalSettings.get("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;

  const workerEnv = { ...process.env };
  delete workerEnv.ANTHROPIC_API_KEY;

  if (preferredAuth === "api_key" && storedApiKey) {
    workerEnv.ANTHROPIC_API_KEY = storedApiKey;
    console.log(`[${sessionId}] Using API key auth`);
  } else {
    console.log(`[${sessionId}] Using OAuth auth`);
  }

  const child = spawn("bun", ["run", workerPath, inputJson], {
    cwd: workingDirectory,
    stdio: ["pipe", "pipe", "pipe"],
    env: workerEnv,
  });

  if (sessionId) {
    activeProcesses.set(sessionId, { process: child, ws, sessionId });
    // Start monitoring child processes (for GUI/hung process detection)
    startProcessMonitor(sessionId, child.pid!, ws);
  }

  let buffer = "";
  let lastMainAssistantMsgId: string | null = null;
  let sentCompletion = false;

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

            // Truncate large tool results (e.g., base64 images) before storage
            const contentToStore = Array.isArray(content) ? truncateToolResults(content) : content;

            console.log(`[Persist] Saving user message:`, {
              uuid: msgId,
              parentToolUseId: data.parentToolUseId,
              isSynthetic: data.isSynthetic,
              contentPreview: JSON.stringify(contentToStore).slice(0, 200),
            });

            messages.upsert(
              msgId,
              sessionId,
              "user",
              JSON.stringify(contentToStore),
              timestamp,
              data.parentToolUseId ?? null,
              data.isSynthetic ? 1 : 0
            );
          }
          sendToSession(sessionId, data, ws);
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
          sendToSession(sessionId, payload, ws);
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

          sendToSession(sessionId, { type: "done", uiSessionId: sessionId, finalMessageId: lastMainAssistantMsgId }, ws);
          sentCompletion = true;
          if (sessionId) {
            stopProcessMonitor(sessionId);
            activeProcesses.delete(sessionId);
            deleteStreamCapture(sessionId);
          }
        } else if (msg.type === "error") {
          sendToSession(
            sessionId,
            {
              type: "error",
              uiSessionId: sessionId,
              error: msg.error,
            },
            ws
          );
          sentCompletion = true;
          if (sessionId) {
            stopProcessMonitor(sessionId);
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
    sendToSession(
      sessionId,
      {
        type: "error",
        uiSessionId: sessionId,
        error: error.message,
      },
      ws
    );
    sentCompletion = true;
    if (sessionId) {
      stopProcessMonitor(sessionId);
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
          sendToSession(sessionId, { type: "done", uiSessionId: sessionId, finalMessageId: lastMainAssistantMsgId }, ws);
          sentCompletion = true;
        }
      } catch {}
    }

    // Always send a completion message if we haven't already
    // This prevents the client from being stuck in loading state
    if (!sentCompletion && sessionId) {
      if (code === 0) {
        sendToSession(sessionId, { type: "done", uiSessionId: sessionId, finalMessageId: lastMainAssistantMsgId }, ws);
      } else {
        sendToSession(sessionId, {
          type: "error",
          uiSessionId: sessionId,
          error: `Process exited unexpectedly (code ${code})`
        }, ws);
      }
    }

    if (sessionId) {
      stopProcessMonitor(sessionId);
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
            stopProcessMonitor(data.sessionId);
            active.process.kill("SIGTERM");
            activeProcesses.delete(data.sessionId);
            safeSend(ws, { type: "aborted", uiSessionId: data.sessionId });
          }
        } else if (data.type === "kill_process" && data.sessionId && (data as any).pid) {
          // Kill a specific child process
          const pid = (data as any).pid as number;
          console.log(`[${data.sessionId}] Killing child process ${pid}`);
          try {
            process.kill(pid, "SIGKILL");
            safeSend(ws, { type: "process_killed", uiSessionId: data.sessionId, pid });
          } catch (e) {
            console.error(`Failed to kill process ${pid}:`, e);
            safeSend(ws, { type: "kill_failed", uiSessionId: data.sessionId, pid, error: String(e) });
          }
        } else if (data.type === "attach" && data.sessionId) {
          const active = activeProcesses.get(data.sessionId);
          if (active) {
            const wasSameWs = active.ws === ws;
            active.ws = ws;
            activeProcesses.set(data.sessionId, active);
            if (!wasSameWs) {
              sendToSession(
                data.sessionId,
                {
                  type: "stream_event",
                  uiSessionId: data.sessionId,
                  event: { type: "message_start" },
                  parentToolUseId: null,
                  uuid: crypto.randomUUID(),
                  timestamp: Date.now(),
                },
                ws
              );
              for (const pending of pendingPermissions.values()) {
                if (pending.sessionId === data.sessionId) {
                  sendToSession(data.sessionId, pending.payload, ws);
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
        }
      } catch (error) {
        safeSend(ws, {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },

    close(ws: any) {
      console.log("Client disconnected");
      connectedClients.delete(ws);
      for (const [sessionId, active] of activeProcesses.entries()) {
        if (active.ws === ws) {
          activeProcesses.set(sessionId, { ...active, ws: null });
        }
      }
    },
  };
}
