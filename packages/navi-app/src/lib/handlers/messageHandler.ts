import type { ClaudeMessage, StreamEventMessage, ToolProgressMessage, PermissionRequestMessage, ContentBlock, ToolUseBlock } from "../claude";
import type { HandlerCallbacks, UICommand } from "./types";
import { sessionMessages } from "../stores";
import { handleStreamEvent } from "./streamHandler";

export interface MessageHandlerConfig {
  callbacks: HandlerCallbacks;
  getCurrentSessionId: () => string | null;
  getProjectId: () => string | null;
}

function extractTodos(content: ContentBlock[]): any[] | null {
  const todoTool = content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === "TodoWrite"
  );
  return todoTool?.input?.todos || null;
}

export function createMessageHandler(config: MessageHandlerConfig) {
  const { callbacks, getCurrentSessionId, getProjectId } = config;

  function handle(msg: ClaudeMessage): void {
    const uiSessionId = (msg as any).uiSessionId;
    const currentSessionId = getCurrentSessionId();
    
    switch (msg.type) {
      case "system":
        if ((msg as any).subtype === "init" && uiSessionId && uiSessionId === currentSessionId) {
          callbacks.onSessionInit?.(uiSessionId, {
            model: (msg as any).model,
            cwd: (msg as any).cwd,
            tools: (msg as any).tools,
            skills: (msg as any).skills,
          });
        }
        break;

      case "stream_event":
        if (uiSessionId) {
          const eventType = (msg as StreamEventMessage).event?.type;
          if (eventType === "message_start") {
            callbacks.onStreamingStart?.(uiSessionId);
          }
          handleStreamEvent(uiSessionId, msg as StreamEventMessage);
          callbacks.onMessageUpdate?.(uiSessionId);
          if (uiSessionId === currentSessionId) {
            callbacks.scrollToBottom?.();
          }
        }
        break;

      case "assistant":
        if (!uiSessionId) break;
        const parentId = (msg as any).parentToolUseId || null;
        const content = (msg as any).content as ContentBlock[];
        const msgUuid = (msg as any).uuid || crypto.randomUUID();
        
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
        
        const usage = (msg as any).usage;
        if (!parentId && usage && uiSessionId === currentSessionId) {
          callbacks.onComplete?.(uiSessionId, { costUsd: 0, usage });
        }
        
        callbacks.onMessageUpdate?.(uiSessionId);
        if (uiSessionId === currentSessionId) {
          callbacks.scrollToBottom?.();
        }
        break;

      case "user":
        if (!uiSessionId) break;
        const userContent = (msg as any).content as ContentBlock[] | string;
        const isSynthetic = !!(msg as any).isSynthetic;
        const hasToolResult = Array.isArray(userContent)
          ? userContent.some((block) => block.type === "tool_result")
          : false;
        if (isSynthetic || hasToolResult) {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "user",
            content: userContent,
            timestamp: new Date(),
            parentToolUseId: (msg as any).parentToolUseId ?? undefined,
            isSynthetic,
          });
          callbacks.onMessageUpdate?.(uiSessionId);
          if (uiSessionId === currentSessionId) {
            callbacks.scrollToBottom?.();
          }
        }
        break;

      case "tool_progress":
        if (uiSessionId && uiSessionId === currentSessionId) {
          const progressMsg = msg as ToolProgressMessage;
          if (progressMsg.parentToolUseId) {
            callbacks.onSubagentProgress?.(uiSessionId, progressMsg.parentToolUseId, progressMsg.elapsedTimeSeconds);
          }
        }
        break;

      case "result":
        const resultCost = (msg as any).costUsd || 0;
        if (uiSessionId) {
          callbacks.onComplete?.(uiSessionId, { costUsd: resultCost, usage: (msg as any).usage });
          callbacks.onStreamingEnd?.(uiSessionId);
        }
        break;

      case "error":
        if (uiSessionId) {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "system",
            content: `Error: ${(msg as any).error}`,
            timestamp: new Date(),
          });
          callbacks.onError?.(uiSessionId, (msg as any).error);
          callbacks.onStreamingEnd?.(uiSessionId);
        }
        break;

      case "done":
        if (uiSessionId) {
          const finalMessageId = (msg as any).finalMessageId;
          if (finalMessageId) {
            sessionMessages.markFinal(uiSessionId, finalMessageId);
          }
          callbacks.onStreamingEnd?.(uiSessionId);
        }
        break;

      case "aborted":
        if (uiSessionId) {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "system",
            content: "Request stopped",
            timestamp: new Date(),
          });
          callbacks.onStreamingEnd?.(uiSessionId);
        }
        break;

      case "permission_request":
        const permMsg = msg as PermissionRequestMessage;
        callbacks.onPermissionRequest?.({
          requestId: permMsg.requestId,
          tools: permMsg.tools,
          toolInput: permMsg.toolInput,
          message: permMsg.message,
        });
        break;

      case "ui_command":
        const uiCommand = msg as unknown as { type: "ui_command"; command: string; payload: Record<string, unknown> };
        callbacks.onUICommand?.({
          command: uiCommand.command as UICommand["command"],
          payload: uiCommand.payload,
        });
        break;
    }
  }

  return { handle };
}
