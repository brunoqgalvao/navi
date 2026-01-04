import { useCallback, useRef } from "react";
import type {
  ClaudeMessage,
  StreamEventMessage,
  ToolProgressMessage,
  PermissionRequestMessage,
  ContentBlock,
  ToolUseBlock,
} from "~/lib/claude";
import { useMessageStore } from "~/stores/messageStore";
import { useStreamingStore } from "~/stores/streamingStore";
import { useTodoStore } from "~/stores/todoStore";

export interface ChildProcess {
  pid: number;
  command: string;
  runtime: number;
}

export interface MessageHandlerCallbacks {
  onSessionInit?: (
    sessionId: string,
    info: { model?: string; cwd?: string; tools?: string[]; skills?: string[] }
  ) => void;
  onStreamingStart?: (sessionId: string) => void;
  onStreamingEnd?: (sessionId: string) => void;
  onMessageUpdate?: (sessionId: string) => void;
  onComplete?: (
    sessionId: string,
    data: { costUsd: number; usage?: { input_tokens: number; output_tokens: number } }
  ) => void;
  onError?: (sessionId: string, error: string) => void;
  onTodoUpdate?: (sessionId: string, todos: any[]) => void;
  onPermissionRequest?: (request: {
    requestId: string;
    tools: string[];
    toolInput?: Record<string, unknown>;
    message: string;
  }) => void;
  onSubagentProgress?: (
    sessionId: string,
    parentToolUseId: string,
    elapsedSeconds: number
  ) => void;
  onUICommand?: (command: { command: string; payload: Record<string, unknown> }) => void;
  onChildProcesses?: (sessionId: string, processes: ChildProcess[]) => void;
  scrollToBottom?: () => void;
}

interface UseMessageHandlerOptions {
  getCurrentSessionId: () => string | null;
  getProjectId: () => string | null;
  callbacks?: MessageHandlerCallbacks;
}

function extractTodos(content: ContentBlock[]): any[] | null {
  const todoTool = content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === "TodoWrite"
  );
  return todoTool?.input?.todos || null;
}

export function useMessageHandler(options: UseMessageHandlerOptions) {
  const { getCurrentSessionId, getProjectId, callbacks = {} } = options;

  const messageStore = useMessageStore();
  const streamingStore = useStreamingStore();
  const todoStore = useTodoStore();

  // Use refs to avoid stale closures
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleStreamEvent = useCallback(
    (sessionId: string, msg: StreamEventMessage) => {
      const event = msg.event;
      if (!event) return;

      switch (event.type) {
        case "message_start":
          streamingStore.start(sessionId);
          break;

        case "content_block_start":
          if (event.content_block) {
            streamingStore.addBlock(sessionId, event.content_block);
          }
          break;

        case "content_block_delta":
          if (event.delta) {
            streamingStore.appendDelta(sessionId, event.delta);
          }
          break;

        case "content_block_stop":
          streamingStore.finishBlock(sessionId);
          break;

        case "message_stop":
        case "message_delta":
          streamingStore.stop(sessionId);
          break;
      }
    },
    [streamingStore]
  );

  const handle = useCallback(
    (msg: ClaudeMessage) => {
      const uiSessionId = (msg as any).uiSessionId;
      const currentSessionId = getCurrentSessionId();
      const cbs = callbacksRef.current;

      switch (msg.type) {
        case "system":
          if (
            (msg as any).subtype === "init" &&
            uiSessionId &&
            uiSessionId === currentSessionId
          ) {
            cbs.onSessionInit?.(uiSessionId, {
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
              cbs.onStreamingStart?.(uiSessionId);
            }
            handleStreamEvent(uiSessionId, msg as StreamEventMessage);
            cbs.onMessageUpdate?.(uiSessionId);
            if (uiSessionId === currentSessionId) {
              cbs.scrollToBottom?.();
            }
          }
          break;

        case "assistant":
          if (!uiSessionId) break;
          const parentId = (msg as any).parentToolUseId || null;
          const content = (msg as any).content as ContentBlock[];
          const msgUuid = (msg as any).uuid || crypto.randomUUID();

          if (content && content.length > 0) {
            messageStore.addMessage(uiSessionId, {
              id: msgUuid,
              role: "assistant",
              content,
              timestamp: new Date(),
              parentToolUseId: parentId,
            });
          }

          const todos = extractTodos(content);
          if (todos) {
            todoStore.setTodos(uiSessionId, todos);
            cbs.onTodoUpdate?.(uiSessionId, todos);
          }

          const usage = (msg as any).usage;
          if (!parentId && usage && uiSessionId === currentSessionId) {
            cbs.onComplete?.(uiSessionId, { costUsd: 0, usage });
          }

          cbs.onMessageUpdate?.(uiSessionId);
          if (uiSessionId === currentSessionId) {
            cbs.scrollToBottom?.();
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
            messageStore.addMessage(uiSessionId, {
              id: crypto.randomUUID(),
              role: "user",
              content: userContent,
              timestamp: new Date(),
              parentToolUseId: (msg as any).parentToolUseId ?? undefined,
              isSynthetic,
            });
            cbs.onMessageUpdate?.(uiSessionId);
            if (uiSessionId === currentSessionId) {
              cbs.scrollToBottom?.();
            }
          }
          break;

        case "tool_progress":
          if (uiSessionId && uiSessionId === currentSessionId) {
            const progressMsg = msg as ToolProgressMessage;
            if (progressMsg.parentToolUseId) {
              cbs.onSubagentProgress?.(
                uiSessionId,
                progressMsg.parentToolUseId,
                progressMsg.elapsedTimeSeconds
              );
            }
          }
          break;

        case "result":
          const resultCost = (msg as any).costUsd || 0;
          if (uiSessionId) {
            cbs.onComplete?.(uiSessionId, {
              costUsd: resultCost,
              usage: (msg as any).usage,
            });
            cbs.onStreamingEnd?.(uiSessionId);
          }
          break;

        case "error":
          if (uiSessionId) {
            messageStore.addMessage(uiSessionId, {
              id: crypto.randomUUID(),
              role: "system",
              content: `Error: ${(msg as any).error}`,
              timestamp: new Date(),
            });
            cbs.onError?.(uiSessionId, (msg as any).error);
            cbs.onStreamingEnd?.(uiSessionId);
          }
          break;

        case "done":
          if (uiSessionId) {
            const finalMessageId = (msg as any).finalMessageId;
            if (finalMessageId) {
              messageStore.markFinal(uiSessionId, finalMessageId);
            }
            cbs.onStreamingEnd?.(uiSessionId);
          }
          break;

        case "aborted":
          if (uiSessionId) {
            messageStore.addMessage(uiSessionId, {
              id: crypto.randomUUID(),
              role: "system",
              content: "Request stopped",
              timestamp: new Date(),
            });
            cbs.onStreamingEnd?.(uiSessionId);
          }
          break;

        case "child_processes":
          if (uiSessionId) {
            const processes = (msg as any).processes as ChildProcess[];
            cbs.onChildProcesses?.(uiSessionId, processes);
          }
          break;

        case "permission_request":
          const permMsg = msg as PermissionRequestMessage;
          cbs.onPermissionRequest?.({
            requestId: permMsg.requestId,
            tools: permMsg.tools,
            toolInput: permMsg.toolInput,
            message: permMsg.message,
          });
          break;

        case "ui_command":
          const uiCommand = msg as unknown as {
            type: "ui_command";
            command: string;
            payload: Record<string, unknown>;
          };
          cbs.onUICommand?.({
            command: uiCommand.command,
            payload: uiCommand.payload,
          });
          break;
      }
    },
    [getCurrentSessionId, handleStreamEvent, messageStore, todoStore]
  );

  return { handle };
}
