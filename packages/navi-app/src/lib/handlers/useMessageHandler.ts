import type { ClaudeMessage } from "../claude";
import { createMessageHandler, type MessageHandlerConfig } from "./messageHandler";
import type { UICommand } from "./types";
import {
  sessionMessages,
  loadingSessions,
  sessionStatus,
  sessionTodos,
  sessionDebugInfo,
  sessionEvents,
  type SDKEvent,
  type SDKEventType,
} from "../stores";

export interface UseMessageHandlerOptions {
  getCurrentSessionId: () => string | null;
  getProjectId: () => string | null;
  onCostUpdate?: (sessionId: string, costUsd: number) => void;
  onUsageUpdate?: (inputTokens: number, outputTokens: number) => void;
  onPermissionRequest?: (data: { requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string }) => void;
  onSubagentProgress?: (sessionId: string, toolUseId: string, elapsed: number) => void;
  onUICommand?: (command: UICommand) => void;
  scrollToBottom?: () => void;
  onClaudeSessionInit?: (claudeSessionId: string, model: string) => void;
}

function getEventType(msg: ClaudeMessage): SDKEventType {
  switch (msg.type) {
    case "system":
      const subtype = (msg as any).subtype;
      if (subtype === "init") return "system_init";
      if (subtype === "status") return "system_status";
      if (subtype === "compact_boundary") return "system_compact";
      if (subtype === "hook_response") return "system_hook";
      return "system_init";
    case "assistant": return "assistant";
    case "user": return "user";
    case "result": return "result";
    case "error": return "error";
    case "tool_progress": return "tool_progress";
    case "permission_request": return "permission_request";
    case "stream_event": return "assistant_streaming";
    case "auth_status": return "auth_status";
    default: return "unknown";
  }
}

function logEvent(sessionId: string, msg: ClaudeMessage) {
  const event: SDKEvent = {
    id: (msg as any).uuid || crypto.randomUUID(),
    type: getEventType(msg),
    timestamp: (msg as any).timestamp || Date.now(),
    sessionId,
    parentToolUseId: (msg as any).parentToolUseId || null,
    data: msg,
  };
  sessionEvents.addEvent(sessionId, event);
}

export function useMessageHandler(options: UseMessageHandlerOptions) {
  const {
    getCurrentSessionId,
    getProjectId,
    onCostUpdate,
    onUsageUpdate,
    onPermissionRequest,
    onSubagentProgress,
    onUICommand,
    scrollToBottom,
    onClaudeSessionInit,
  } = options;

  const activeSubagents = new Map<string, { elapsed: number }>();

  const config: MessageHandlerConfig = {
    getCurrentSessionId,
    getProjectId,
    callbacks: {
      onSessionInit: (sessionId, data) => {
        const claudeSessionId = (data as any).claudeSessionId;
        if (claudeSessionId && data.model) {
          onClaudeSessionInit?.(claudeSessionId, data.model);
        }
        sessionDebugInfo.setForSession(sessionId, {
          cwd: data.cwd || "",
          model: data.model || "",
          tools: data.tools || [],
          skills: data.skills || [],
          timestamp: new Date(),
        });
      },
      
      onMessageUpdate: (sessionId) => {
        if (sessionId === getCurrentSessionId()) {
          scrollToBottom?.();
        }
      },
      
      onStreamingStart: (sessionId) => {
        loadingSessions.update(s => { s.add(sessionId); return new Set(s); });
        const projectId = getProjectId();
        if (projectId) {
          sessionStatus.setRunning(sessionId, projectId);
        }
      },
      
      onStreamingEnd: (sessionId) => {
        loadingSessions.update(s => { s.delete(sessionId); return new Set(s); });
        const projectId = getProjectId();
        const currentSessionId = getCurrentSessionId();
        if (projectId) {
          if (sessionId !== currentSessionId) {
            sessionStatus.setUnread(sessionId, projectId);
          } else {
            sessionStatus.setIdle(sessionId, projectId);
          }
        }
        activeSubagents.clear();
      },
      
      onError: (sessionId, error) => {
        loadingSessions.update(s => { s.delete(sessionId); return new Set(s); });
        const projectId = getProjectId();
        if (projectId) {
          sessionStatus.setIdle(sessionId, projectId);
        }
      },
      
      onComplete: (sessionId, data) => {
        if (data.costUsd) {
          onCostUpdate?.(sessionId, data.costUsd);
        }
        if (data.usage) {
          const totalInputTokens = (data.usage.input_tokens || 0) + 
            (data.usage.cache_creation_input_tokens || 0) + 
            (data.usage.cache_read_input_tokens || 0);
          onUsageUpdate?.(totalInputTokens, data.usage.output_tokens || 0);
        }
      },
      
      onPermissionRequest: (data) => {
        const projectId = getProjectId();
        const sessionId = getCurrentSessionId();
        if (projectId && sessionId) {
          sessionStatus.setPermissionRequired(sessionId, projectId);
        }
        onPermissionRequest?.(data);
      },
      
      onTodoUpdate: (sessionId, todos) => {
        sessionTodos.setForSession(sessionId, todos);
      },
      
      onSubagentProgress: (sessionId, toolUseId, elapsed) => {
        activeSubagents.set(toolUseId, { elapsed });
        onSubagentProgress?.(sessionId, toolUseId, elapsed);
      },

      onUICommand: (command) => {
        onUICommand?.(command);
      },

      scrollToBottom,
    },
  };

  const handler = createMessageHandler(config);

  function handleMessage(msg: ClaudeMessage) {
    const uiSessionId = (msg as any).uiSessionId;
    
    if (uiSessionId) {
      logEvent(uiSessionId, msg);
    }
    
    handler.handle(msg);
  }

  function addUserMessage(sessionId: string, content: string) {
    sessionMessages.addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    });
    loadingSessions.update(s => { s.add(sessionId); return new Set(s); });
    const projectId = getProjectId();
    if (projectId) {
      sessionStatus.setRunning(sessionId, projectId);
    }
  }

  function getActiveSubagents() {
    return new Map(activeSubagents);
  }

  return {
    handleMessage,
    addUserMessage,
    getActiveSubagents,
  };
}
