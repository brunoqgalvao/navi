import type { ClaudeMessage, SystemMessage, AssistantMessage, UserMessage } from "../claude";
import { createMessageHandler, type MessageHandlerConfig } from "./messageHandler";
import type { UICommand, CompactMetadata, AskUserQuestionData, UntilDoneContinueData, UntilDoneCompleteData } from "./types";
import type { SessionHierarchyEvent } from "../features/session-hierarchy/types";
import type { ActiveWait } from "../stores/types";
import {
  sessionMessages,
  loadingSessions,
  sessionStatus,
  sessionTodos,
  sessionDebugInfo,
  sessionEvents,
  activeWaits,
  type SDKEvent,
  type SDKEventType,
} from "../stores";

export interface UseMessageHandlerOptions {
  getCurrentSessionId: () => string | null;
  getProjectId: () => string | null;
  onCostUpdate?: (sessionId: string, costUsd: number) => void;
  onUsageUpdate?: (inputTokens: number, outputTokens: number) => void;
  onPermissionRequest?: (data: { requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string }) => void;
  onAskUserQuestion?: (data: AskUserQuestionData) => void;
  onSubagentProgress?: (sessionId: string, toolUseId: string, elapsed: number) => void;
  onUICommand?: (command: UICommand) => void;
  scrollToBottom?: () => void;
  onNewContent?: () => void;
  onClaudeSessionInit?: (claudeSessionId: string, model: string) => void;
  onStreamingEnd?: (sessionId: string, reason: "done" | "aborted" | "error") => void;
  onCompactStart?: (sessionId: string) => void;
  onCompactEnd?: (sessionId: string, metadata?: CompactMetadata) => void;
  onContextOverflow?: (sessionId: string, autoRetry: boolean) => void;
  // Until Done (Ralph loop) mode callbacks
  onUntilDoneContinue?: (sessionId: string, data: UntilDoneContinueData) => void;
  onUntilDoneComplete?: (sessionId: string, data: UntilDoneCompleteData) => void;
  // Session Hierarchy (Multi-Agent) callbacks
  onSessionHierarchyEvent?: (event: SessionHierarchyEvent) => void;
  // Wait/Pause callbacks
  onWaitStart?: (wait: ActiveWait) => void;
  onWaitEnd?: (requestId: string, skipped: boolean) => void;
  onPlaySound?: (sound: string) => void;
}

/**
 * Type guard to check if a message has a uiSessionId property
 */
function hasUiSessionId(msg: ClaudeMessage): msg is ClaudeMessage & { uiSessionId: string } {
  return "uiSessionId" in msg && typeof (msg as { uiSessionId?: unknown }).uiSessionId === "string";
}

/**
 * Get the uiSessionId from a message if present
 */
function getUiSessionId(msg: ClaudeMessage): string | undefined {
  if (hasUiSessionId(msg)) {
    return msg.uiSessionId;
  }
  return undefined;
}

function getEventType(msg: ClaudeMessage): SDKEventType {
  switch (msg.type) {
    case "system":
      const systemMsg = msg as SystemMessage;
      if (systemMsg.subtype === "init") return "system_init";
      if (systemMsg.subtype === "status") return "system_status";
      if (systemMsg.subtype === "compact_boundary") return "system_compact";
      if (systemMsg.subtype === "hook_response") return "system_hook";
      return "system_init";
    case "assistant": return "assistant";
    case "user": return "user";
    case "result": return "result";
    case "error": return "error";
    case "tool_progress": return "tool_progress";
    case "permission_request": return "permission_request";
    case "stream_event": return "assistant_streaming";
    case "auth_status": return "auth_status";
    case "query_start": return "query_start";
    case "query_complete": return "query_complete";
    case "complete": return "complete";
    default: return "unknown";
  }
}

/**
 * Get common message properties for event logging
 */
function getMessageEventProps(msg: ClaudeMessage): { uuid?: string; timestamp?: number; parentToolUseId?: string | null } {
  if ("uuid" in msg) {
    const m = msg as { uuid?: string; timestamp?: number; parentToolUseId?: string | null };
    return {
      uuid: m.uuid,
      timestamp: m.timestamp,
      parentToolUseId: m.parentToolUseId ?? null,
    };
  }
  return { parentToolUseId: null };
}

function logEvent(sessionId: string, msg: ClaudeMessage) {
  const props = getMessageEventProps(msg);
  const event: SDKEvent = {
    id: props.uuid || crypto.randomUUID(),
    type: getEventType(msg),
    timestamp: props.timestamp || Date.now(),
    sessionId,
    parentToolUseId: props.parentToolUseId,
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
    onAskUserQuestion,
    onSubagentProgress,
    onUICommand,
    scrollToBottom,
    onNewContent,
    onClaudeSessionInit,
    onStreamingEnd: onStreamingEndCallback,
    onCompactStart,
    onCompactEnd,
    onContextOverflow,
    onUntilDoneContinue,
    onUntilDoneComplete,
    onSessionHierarchyEvent,
    onWaitStart,
    onWaitEnd,
    onPlaySound,
  } = options;

  const activeSubagents = new Map<string, { elapsed: number }>();

  const config: MessageHandlerConfig = {
    getCurrentSessionId,
    getProjectId,
    callbacks: {
      onSessionInit: (sessionId, data) => {
        sessionDebugInfo.setForSession(sessionId, {
          cwd: data.cwd || "",
          model: data.model || "",
          tools: data.tools || [],
          skills: data.skills || [],
          timestamp: new Date(),
        });
        // If claudeSessionId is present, notify the UI to update session state
        if (data.claudeSessionId && data.model) {
          onClaudeSessionInit?.(data.claudeSessionId, data.model);
        }
      },

      onClaudeSessionId: (sessionId, claudeSessionId) => {
        // Update session state when claudeSessionId becomes available (after query completes)
        if (sessionId === getCurrentSessionId()) {
          onClaudeSessionInit?.(claudeSessionId, "");
        }
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
      
      onStreamingEnd: (sessionId, reason) => {
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
        // Call the external callback so App.svelte can do additional work
        onStreamingEndCallback?.(sessionId, reason);
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
          console.log("[DEBUG onComplete] usage:", JSON.stringify(data.usage));
          const totalInputTokens = (data.usage.input_tokens || 0) +
            (data.usage.cache_creation_input_tokens || 0) +
            (data.usage.cache_read_input_tokens || 0);
          console.log("[DEBUG onComplete] totalInputTokens:", totalInputTokens);
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

      onAskUserQuestion: (data) => {
        const projectId = getProjectId();
        const sessionId = getCurrentSessionId();
        if (projectId && sessionId) {
          sessionStatus.setAwaitingInput(sessionId, projectId);
        }
        onAskUserQuestion?.(data);
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

      onCompactStart: (sessionId) => {
        onCompactStart?.(sessionId);
      },

      onCompactEnd: (sessionId, metadata) => {
        onCompactEnd?.(sessionId, metadata);
      },

      onContextOverflow: (sessionId, autoRetry) => {
        onContextOverflow?.(sessionId, autoRetry);
      },

      onUntilDoneContinue: (sessionId, data) => {
        onUntilDoneContinue?.(sessionId, data);
      },

      onUntilDoneComplete: (sessionId, data) => {
        onUntilDoneComplete?.(sessionId, data);
      },

      onSessionHierarchyEvent: (event) => {
        onSessionHierarchyEvent?.(event);
      },

      onWaitStart: (wait) => {
        // Update the store
        activeWaits.start(wait);
        // Call the external callback
        onWaitStart?.(wait);
      },

      onWaitEnd: (requestId, skipped) => {
        // Update the store
        activeWaits.end(requestId);
        // Call the external callback
        onWaitEnd?.(requestId, skipped);
      },

      onPlaySound: (sound) => {
        onPlaySound?.(sound);
      },

      scrollToBottom,
      onNewContent,
    },
  };

  const handler = createMessageHandler(config);

  function handleMessage(msg: ClaudeMessage) {
    const uiSessionId = getUiSessionId(msg);

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
