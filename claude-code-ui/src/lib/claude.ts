export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface SystemMessage {
  type: "system";
  sessionId: string;
  subtype: "init" | "success" | "error";
  cwd?: string;
  model?: string;
  tools?: string[];
}

export interface AssistantMessage {
  type: "assistant";
  sessionId: string;
  content: ContentBlock[];
  parentToolUseId: string | null;
}

export interface UserMessage {
  type: "user";
  content: ContentBlock[];
  parentToolUseId: string | null;
}

export interface ResultMessage {
  type: "result";
  sessionId: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ErrorMessage {
  type: "error";
  error: string;
}

export interface DoneMessage {
  type: "done";
}

export interface ToolProgressMessage {
  type: "tool_progress";
  toolUseId: string;
  toolName: string;
  parentToolUseId: string | null;
  elapsedTimeSeconds: number;
}

export type ClaudeMessage =
  | SystemMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | ErrorMessage
  | DoneMessage
  | ToolProgressMessage
  | { type: "connected" }
  | { type: "aborted"; sessionId?: string };

export class ClaudeClient {
  private ws: WebSocket | null = null;
  private listeners: ((msg: ClaudeMessage) => void)[] = [];
  private url: string;

  constructor(url = "ws://localhost:3001/ws") {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("Connected to Claude server");
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ClaudeMessage = JSON.parse(event.data);
          this.listeners.forEach((fn) => fn(msg));
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("Disconnected from Claude server");
      };
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  onMessage(fn: (msg: ClaudeMessage) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  query(options: {
    prompt: string;
    projectId?: string;
    sessionId?: string;
    claudeSessionId?: string;
    workingDirectory?: string;
    allowedTools?: string[];
    model?: string;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "query",
        ...options,
      })
    );
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  abort(sessionId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "abort",
        sessionId,
      })
    );
  }
}
