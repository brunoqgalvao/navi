export interface HandlerCallbacks {
  onSessionInit?: (sessionId: string, data: { model?: string; cwd?: string; tools?: string[]; skills?: string[] }) => void;
  onMessageUpdate?: (sessionId: string) => void;
  onStreamingStart?: (sessionId: string) => void;
  onStreamingEnd?: (sessionId: string) => void;
  onError?: (sessionId: string, error: string) => void;
  onComplete?: (sessionId: string, data: { costUsd: number; usage?: any }) => void;
  onPermissionRequest?: (data: { requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string }) => void;
  onTodoUpdate?: (sessionId: string, todos: any[]) => void;
  onSubagentProgress?: (sessionId: string, toolUseId: string, elapsed: number) => void;
  scrollToBottom?: () => void;
}
