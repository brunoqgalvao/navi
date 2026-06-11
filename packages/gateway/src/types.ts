import type { GatewayEvent, PermissionDecision } from "./events.js";

export type Capabilities = {
  streaming: boolean;
  thinkingStream: boolean;
  permissions: "callback" | "modes-only";
  resume: boolean;
  mcp: boolean;
  skills: "native" | "injected";
  models: Array<{ id: string; label: string; default?: boolean }>;
};

export type DetectResult = {
  installed: boolean;
  authed: boolean;
  version?: string;
  fixHint?: string;
};

export type McpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type SessionOptions = {
  cwd: string;
  model?: string;
  permissionMode: "prompt" | "acceptEdits" | "acceptAll" | "readOnly";
  mcpServers?: McpServerConfig[];
  systemContext?: string;
};

export type UserInput = { text: string };

export interface AgentSession {
  readonly id: string;
  send(input: UserInput): AsyncIterable<GatewayEvent>;
  respondToPermission(requestId: string, decision: PermissionDecision): void;
  cancel(): Promise<void>;
}

export type BackendId = "claude" | "codex" | "gemini";

export interface AgentBackend {
  readonly id: BackendId;
  capabilities(): Capabilities;
  detect(): Promise<DetectResult>;
  createSession(opts: SessionOptions): AgentSession;
  resumeSession(backendSessionId: string, opts: SessionOptions): AgentSession;
}
