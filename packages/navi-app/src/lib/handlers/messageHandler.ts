import type {
  ClaudeMessage,
  StreamEventMessage,
  ToolProgressMessage,
  PermissionRequestMessage,
  ContentBlock,
  ToolUseBlock,
  SystemMessage,
  AssistantMessage,
  UserMessage,
  ResultMessage,
  ErrorMessage,
  DoneMessage
} from "../claude";
import type { HandlerCallbacks, UICommand } from "./types";
import type { TodoItem } from "../stores/types";
import { sessionMessages } from "../stores";
import { handleStreamEvent } from "./streamHandler";

export interface MessageHandlerConfig {
  callbacks: HandlerCallbacks;
  getCurrentSessionId: () => string | null;
  getProjectId: () => string | null;
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

/**
 * Extract todo items from assistant message content
 */
function extractTodos(content: ContentBlock[]): TodoItem[] | null {
  const todoTool = content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === "TodoWrite"
  );
  if (!todoTool?.input?.todos) return null;

  // Validate the todo structure
  const todos = todoTool.input.todos;
  if (!Array.isArray(todos)) return null;

  return todos as TodoItem[];
}

export function createMessageHandler(config: MessageHandlerConfig) {
  const { callbacks, getCurrentSessionId } = config;

  function handle(msg: ClaudeMessage): void {
    const uiSessionId = getUiSessionId(msg);
    const currentSessionId = getCurrentSessionId();

    switch (msg.type) {
      case "system": {
        const systemMsg = msg as SystemMessage;
        if (systemMsg.subtype === "init" && uiSessionId && uiSessionId === currentSessionId) {
          callbacks.onSessionInit?.(uiSessionId, {
            model: systemMsg.model,
            cwd: systemMsg.cwd,
            tools: systemMsg.tools,
            skills: systemMsg.skills,
          });
        }
        // Handle compacting status
        if (systemMsg.status === "compacting" && uiSessionId) {
          callbacks.onCompactStart?.(uiSessionId);
        }
        // Handle compact_boundary (compaction complete)
        if (systemMsg.subtype === "compact_boundary" && uiSessionId) {
          callbacks.onCompactEnd?.(uiSessionId, systemMsg.compactMetadata);
        }
        break;
      }

      case "stream_event": {
        if (uiSessionId) {
          const streamMsg = msg as StreamEventMessage;
          const eventType = streamMsg.event?.type;
          if (eventType === "message_start") {
            callbacks.onStreamingStart?.(uiSessionId);
          }
          handleStreamEvent(uiSessionId, streamMsg);
          callbacks.onMessageUpdate?.(uiSessionId);
          if (uiSessionId === currentSessionId) {
            callbacks.scrollToBottom?.();
          }
        }
        break;
      }

      case "assistant": {
        if (!uiSessionId) break;
        const assistantMsg = msg as AssistantMessage;
        const parentId = assistantMsg.parentToolUseId || null;
        const content = assistantMsg.content;
        const msgUuid = assistantMsg.uuid || crypto.randomUUID();

        if (content && content.length > 0) {
          sessionMessages.addMessage(uiSessionId, {
            id: msgUuid,
            role: "assistant",
            content,
            timestamp: new Date(),
            parentToolUseId: parentId,
          });
        }

        const todos = extractTodos(content);
        if (todos) {
          callbacks.onTodoUpdate?.(uiSessionId, todos);
        }

        callbacks.onMessageUpdate?.(uiSessionId);
        if (uiSessionId === currentSessionId) {
          callbacks.scrollToBottom?.();
          callbacks.onNewContent?.();
        }
        break;
      }

      case "user": {
        if (!uiSessionId) break;
        const userMsg = msg as UserMessage;
        const userContent = userMsg.content;
        const isSynthetic = !!userMsg.isSynthetic;
        const hasToolResult = Array.isArray(userContent)
          ? userContent.some((block) => block.type === "tool_result")
          : false;
        if (isSynthetic || hasToolResult) {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "user",
            content: userContent,
            timestamp: new Date(),
            parentToolUseId: userMsg.parentToolUseId ?? undefined,
            isSynthetic,
          });
          callbacks.onMessageUpdate?.(uiSessionId);
          if (uiSessionId === currentSessionId) {
            callbacks.scrollToBottom?.();
            callbacks.onNewContent?.();
          }
        }
        break;
      }

      case "tool_progress": {
        if (uiSessionId && uiSessionId === currentSessionId) {
          const progressMsg = msg as ToolProgressMessage;
          if (progressMsg.parentToolUseId) {
            callbacks.onSubagentProgress?.(uiSessionId, progressMsg.parentToolUseId, progressMsg.elapsedTimeSeconds);
          }
        }
        break;
      }

      case "result": {
        const resultMsg = msg as ResultMessage;
        const resultCost = resultMsg.costUsd || 0;
        if (uiSessionId && resultCost) {
          callbacks.onComplete?.(uiSessionId, { costUsd: resultCost });
        }
        break;
      }

      case "error": {
        if (uiSessionId) {
          const errorMsg = msg as ErrorMessage;
          const errorText = errorMsg.error || "";

          // Check for context overflow errors
          const isContextOverflow =
            errorText.toLowerCase().includes("prompt is too long") ||
            errorText.toLowerCase().includes("context length") ||
            errorText.toLowerCase().includes("maximum context") ||
            errorText.toLowerCase().includes("token limit");

          if (isContextOverflow) {
            // Don't add a scary error message - let the callback handle it gracefully
            callbacks.onContextOverflow?.(uiSessionId);
          } else {
            // Regular error handling
            sessionMessages.addMessage(uiSessionId, {
              id: crypto.randomUUID(),
              role: "system",
              content: `Error: ${errorMsg.error}`,
              timestamp: new Date(),
            });
          }

          callbacks.onError?.(uiSessionId, errorMsg.error);
          callbacks.onStreamingEnd?.(uiSessionId, "error");
        }
        break;
      }

      case "done": {
        if (uiSessionId) {
          const doneMsg = msg as DoneMessage;
          if (doneMsg.finalMessageId) {
            sessionMessages.markFinal(uiSessionId, doneMsg.finalMessageId);
          }
          if (doneMsg.usage) {
            callbacks.onComplete?.(uiSessionId, { costUsd: 0, usage: doneMsg.usage });
          }
          callbacks.onStreamingEnd?.(uiSessionId, "done");
        }
        break;
      }

      case "aborted": {
        if (uiSessionId) {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "system",
            content: "Request stopped",
            timestamp: new Date(),
          });
          callbacks.onStreamingEnd?.(uiSessionId, "aborted");
        }
        break;
      }

      case "permission_request": {
        const permMsg = msg as PermissionRequestMessage;
        callbacks.onPermissionRequest?.({
          requestId: permMsg.requestId,
          tools: permMsg.tools,
          toolInput: permMsg.toolInput,
          message: permMsg.message,
        });
        break;
      }

      case "ui_command": {
        // ui_command is an inline type in ClaudeMessage union
        const uiCommand = msg as { type: "ui_command"; command: string; payload: Record<string, unknown> };
        callbacks.onUICommand?.({
          command: uiCommand.command as UICommand["command"],
          payload: uiCommand.payload,
        });
        break;
      }
    }
  }

  return { handle };
}
