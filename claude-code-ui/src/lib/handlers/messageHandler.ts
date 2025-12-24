import type { ClaudeMessage, StreamEventMessage, ToolProgressMessage, PermissionRequestMessage, ContentBlock, ToolUseBlock } from "../claude";
import type { HandlerCallbacks } from "./types";
import { chatStore } from "./messageStore";
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
        
        chatStore.addAssistantMessage(uiSessionId, content, parentId);
        
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
          chatStore.addSystemMessage(uiSessionId, `Error: ${(msg as any).error}`);
          callbacks.onError?.(uiSessionId, (msg as any).error);
          callbacks.onStreamingEnd?.(uiSessionId);
        }
        break;

      case "done":
        if (uiSessionId) {
          callbacks.onStreamingEnd?.(uiSessionId);
        }
        break;

      case "aborted":
        if (uiSessionId) {
          chatStore.addSystemMessage(uiSessionId, "Request stopped");
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
    }
  }

  return { handle };
}
