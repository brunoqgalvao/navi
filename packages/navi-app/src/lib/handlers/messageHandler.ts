import type {
  ClaudeMessage,
  StreamEventMessage,
  ToolProgressMessage,
  PermissionRequestMessage,
  AskUserQuestionMessage,
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
import { get } from "svelte/store";

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
            claudeSessionId: systemMsg.claudeSessionId,
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
        if (uiSessionId) {
          if (resultCost) {
            callbacks.onComplete?.(uiSessionId, { costUsd: resultCost });
          }
          // Result event signals query completion - end streaming
          callbacks.onStreamingEnd?.(uiSessionId, "done");
        }
        break;
      }

      case "error": {
        if (uiSessionId) {
          const errorMsg = msg as ErrorMessage;
          const errorText = errorMsg.error || "";

          // Check for context overflow errors
          // Also check the last assistant message for "prompt is too long" text
          const messagesMap = get(sessionMessages);
          const lastMessages = messagesMap.get(uiSessionId) || [];
          const lastAssistantContent = lastMessages
            .filter(m => m.role === "assistant")
            .slice(-1)
            .map(m => {
              if (typeof m.content === "string") return m.content;
              if (Array.isArray(m.content)) {
                return m.content
                  .filter((b): b is { type: "text"; text: string } => b.type === "text")
                  .map(b => b.text)
                  .join(" ");
              }
              return "";
            })
            .join(" ")
            .toLowerCase();

          const isContextOverflow =
            errorText.toLowerCase().includes("prompt is too long") ||
            errorText.toLowerCase().includes("request too large") ||
            errorText.toLowerCase().includes("context length") ||
            errorText.toLowerCase().includes("maximum context") ||
            errorText.toLowerCase().includes("token limit") ||
            errorText.toLowerCase().includes("exceeds the model") ||
            lastAssistantContent.includes("prompt is too long") ||
            lastAssistantContent.includes("request too large");

          if (isContextOverflow) {
            // Add a friendly system message explaining the situation
            sessionMessages.addMessage(uiSessionId, {
              id: crypto.randomUUID(),
              role: "system",
              content: "⚠️ **Context limit reached** — The conversation is too long. You can:\n• Type `/compact` to summarize and continue\n• Start a new chat\n• Ask a shorter question",
              timestamp: new Date(),
            });

            // Signal context overflow (don't auto-retry - let user decide)
            callbacks.onContextOverflow?.(uiSessionId, false);

            // IMPORTANT: End streaming state so chat isn't stuck
            callbacks.onStreamingEnd?.(uiSessionId, "error");
            return;
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
          // Notify about claudeSessionId so frontend can update session state
          if (doneMsg.claudeSessionId) {
            callbacks.onClaudeSessionId?.(uiSessionId, doneMsg.claudeSessionId);
          }
          callbacks.onStreamingEnd?.(uiSessionId, "done");
        }
        break;
      }

      // Multi-backend start event (Codex, Gemini) - shows running status
      case "query_start": {
        if (uiSessionId) {
          callbacks.onStreamingStart?.(uiSessionId);
        }
        break;
      }

      // Multi-backend completion event (Codex, Gemini)
      case "query_complete": {
        if (uiSessionId) {
          callbacks.onStreamingEnd?.(uiSessionId, "done");
        }
        break;
      }

      // Multi-backend complete event (from adapter)
      case "complete": {
        if (uiSessionId) {
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

      case "ask_user_question": {
        const questionMsg = msg as AskUserQuestionMessage;
        callbacks.onAskUserQuestion?.({
          requestId: questionMsg.requestId,
          sessionId: questionMsg.sessionId,
          questions: questionMsg.questions,
        });
        break;
      }

      case "ui_command": {
        const uiCommand = msg as { type: "ui_command"; command: string; payload: Record<string, unknown> };
        callbacks.onUICommand?.({
          command: uiCommand.command as UICommand["command"],
          payload: uiCommand.payload,
        });
        break;
      }

      case "until_done_continue": {
        if (uiSessionId) {
          const continueMsg = msg as {
            type: "until_done_continue";
            iteration: number;
            maxIterations: number;
            totalCost: number;
            reason: string;
          };
          callbacks.onUntilDoneContinue?.(uiSessionId, {
            iteration: continueMsg.iteration,
            maxIterations: continueMsg.maxIterations,
            totalCost: continueMsg.totalCost,
            reason: continueMsg.reason,
          });
        }
        break;
      }

      case "until_done_complete": {
        if (uiSessionId) {
          const completeMsg = msg as {
            type: "until_done_complete";
            totalIterations: number;
            totalCost: number;
            reason: string;
          };
          callbacks.onUntilDoneComplete?.(uiSessionId, {
            totalIterations: completeMsg.totalIterations,
            totalCost: completeMsg.totalCost,
            reason: completeMsg.reason,
          });
        }
        break;
      }

      // Session Hierarchy Events (Multi-Agent)
      case "session:spawned":
      case "session:status_changed":
      case "session:escalated":
      case "session:escalation_resolved":
      case "session:delivered":
      case "session:archived":
      case "session:decision_logged":
      case "session:artifact_created": {
        // Forward to session hierarchy handler
        callbacks.onSessionHierarchyEvent?.(msg as any);
        break;
      }

      // Wait/Pause Events
      case "session:wait_start": {
        const waitMsg = msg as {
          type: "session:wait_start";
          requestId: string;
          sessionId: string;
          seconds: number;
          endTime: number;
          reason: string;
        };
        callbacks.onWaitStart?.({
          requestId: waitMsg.requestId,
          sessionId: waitMsg.sessionId,
          seconds: waitMsg.seconds,
          endTime: waitMsg.endTime,
          reason: waitMsg.reason,
        });
        break;
      }

      case "session:wait_end": {
        const waitMsg = msg as {
          type: "session:wait_end";
          requestId: string;
          sessionId: string;
          skipped: boolean;
        };
        callbacks.onWaitEnd?.(waitMsg.requestId, waitMsg.skipped);
        break;
      }

      case "play_sound": {
        const soundMsg = msg as { type: "play_sound"; sound: string };
        callbacks.onPlaySound?.(soundMsg.sound);
        break;
      }
    }
  }

  return { handle };
}
