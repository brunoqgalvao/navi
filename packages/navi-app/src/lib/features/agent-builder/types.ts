// Agent Builder Types
// Filesystem-first agent/skill definitions

export interface AgentDefinition {
  id: string; // derived from path
  name: string;
  type: "agent" | "skill";
  path: string; // filesystem path to agent folder
  prompt: string; // main markdown content

  // Optional typed I/O (agents only, not skills)
  inputSchema?: SchemaDefinition;
  outputSchema?: SchemaDefinition;

  // Capabilities
  tools: string[];
  skills: SkillRef[];
  subAgents: SubAgentRef[];
  scripts: ScriptRef[];

  // Metadata from frontmatter
  model?: "haiku" | "sonnet" | "opus";
  description?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  path: string;
  prompt: string;
  tools: string[];
  scripts: ScriptRef[];
  description?: string;
}

export interface SchemaDefinition {
  raw: string; // TypeScript source
  parsed?: JSONSchema; // Parsed schema for validation
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  // FileRef marker
  $ref?: string;
}

export interface SkillRef {
  id: string;
  type: "local" | "library"; // local = editable in this agent, library = reference
  path?: string; // for local skills
}

export interface SubAgentRef {
  id: string;
  type: "inline" | "reference";
  path?: string; // for inline sub-agents
  agentId?: string; // for library references
}

export interface ScriptRef {
  id: string;
  name: string;
  path: string;
  language: "typescript" | "javascript" | "python" | "shell";
}

// Filesystem structure types
export interface AgentFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: AgentFileNode[];
  // For files
  extension?: string;
  editorType?: EditorType;
}

export type EditorType =
  | "prompt"      // agent.md, skill.md
  | "schema"      // schema.ts
  | "skill"       // skills/*.md
  | "agent"       // sub-agents/*/agent.md
  | "code"        // scripts/*
  | "config";     // other config files

// Test harness types
export interface TestRun {
  id: string;
  agentId: string;
  input: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  output?: Record<string, unknown>;
  files?: TestOutputFile[];
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  logs: TestLogEntry[];
}

export interface TestOutputFile {
  name: string;
  path: string; // temp dir path
  mimeType?: string;
  size: number;
}

export interface TestLogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
}

// FileRef type for agent outputs
export interface FileRef {
  type: "file";
  path: string;
  mimeType?: string;
}

// Agent frontmatter (parsed from agent.md)
export interface AgentFrontmatter {
  name: string;
  description?: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  skills?: string[]; // paths or library:id
  subAgents?: string[]; // paths
  scripts?: string[]; // paths
}

// Editor state
export interface EditorState {
  currentPath: string | null;
  editorType: EditorType | null;
  isDirty: boolean;
  content: string;
}

// Available tools (hardcoded for now)
export const AVAILABLE_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "Task",
  "TaskOutput",
  "NotebookEdit",
] as const;

export type AvailableTool = typeof AVAILABLE_TOOLS[number];
