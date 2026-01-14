/**
 * Navi Core Type System
 *
 * This file defines the unified type hierarchy for all UI/UX components in Navi.
 * Every renderable element in Navi falls into one of these categories.
 */

import type { ComponentType, SvelteComponent } from "svelte";

// =============================================================================
// 1. EXTENSIONS (Sidebar Panels)
// =============================================================================

/**
 * Extensions are sidebar panels that provide dedicated UI for specific features.
 * They appear as tabs in the right sidebar and can be enabled/disabled per project.
 *
 * Examples: Files, Git, Terminal, Preview, Kanban
 */
export interface Extension {
  id: ExtensionId;
  name: string;
  icon: string;
  description: string;
  panelMode: PanelMode;
  component?: ComponentType<SvelteComponent>;
  requiresProject: boolean;
  defaultEnabled: boolean;
  defaultOrder: number;
}

/**
 * All valid extension IDs - derived from registry
 */
export type ExtensionId =
  | "files"
  | "browser"
  | "git"
  | "terminal"
  | "processes"
  | "kanban"
  | "preview"
  | "context"         // Session context visibility
  | "email"           // Navi's email inbox
  | "browser-preview" // Browser-use live preview
  | "resources";      // Resource monitor (@experimental)

/**
 * Panel modes - what the right sidebar can display
 * This should match 1:1 with extensions
 */
export type PanelMode =
  | "files"
  | "browser"
  | "git"
  | "terminal"
  | "processes"
  | "kanban"
  | "preview-unified"
  | "context"         // Context sidebar view
  | "email"           // Email inbox view
  | "browser-preview" // Browser-use preview
  | "resources";      // Resource monitor (@experimental)

// =============================================================================
// 2. MESSAGE WIDGETS (Inline in Chat Messages)
// =============================================================================

/**
 * Message widgets render inline within chat messages.
 * They're triggered by content patterns (code blocks, tool results, etc.)
 *
 * Examples: Code blocks, Media, Mermaid diagrams, Tool results, Subagents
 */
export interface MessageWidget<TConfig = unknown> {
  type: MessageWidgetType;
  /** Pattern to match in message content */
  matcher: (content: unknown) => boolean;
  /** Svelte component to render */
  component: ComponentType<SvelteComponent>;
  /** Parse content into widget config */
  parseConfig?: (content: unknown) => TConfig;
}

export type MessageWidgetType =
  | "code-block"
  | "media"
  | "mermaid"
  | "json-tree"
  | "tool-result"
  | "subagent"
  | "generative-ui"
  | "copyable"
  | "todo-list"
  | "browser-action"    // Browser-use action/result
  | "email-notification" // Incoming email
  | "email-sent";        // Sent email confirmation

// =============================================================================
// 3. DASHBOARD WIDGETS (Project Landing Page)
// =============================================================================

/**
 * Dashboard widgets appear on the project landing page.
 * They're defined in `.claude/dashboard.md` using markdown code blocks.
 *
 * Examples: Git log, Preview, File viewer, Status checks
 */
export interface DashboardWidget<TConfig = unknown> {
  type: DashboardWidgetType;
  component: ComponentType<SvelteComponent>;
  /** Default configuration */
  defaultConfig?: Partial<TConfig>;
  /** Validate configuration from markdown */
  validateConfig?: (config: unknown) => TConfig;
}

export type DashboardWidgetType =
  | "git-log"
  | "preview"
  | "file"
  | "status"
  | "suggestions";

// =============================================================================
// 4. REFERENCES (Input @ Mentions)
// =============================================================================

/**
 * References are context attachments added via @ mentions in chat input.
 * They're resolved when the message is sent and injected into context.
 *
 * Examples: @file.ts, @terminal, @chat:session-id
 */
export interface Reference<TData = unknown> {
  id: string;
  type: ReferenceType;
  /** Display label in the chip */
  label: string;
  /** Icon name (Lucide) */
  icon: string;
  /** The actual reference data */
  data: TData;
  /** How to format this reference for the prompt */
  toPromptContent: () => string;
}

export type ReferenceType = "file" | "text" | "terminal" | "chat" | "url" | "integration";

/**
 * File reference - a file path
 */
export interface FileReferenceData {
  path: string;
  name: string;
  isDirectory: boolean;
}

/**
 * Text reference - selected text from preview
 */
export interface TextReferenceData {
  text: string;
  truncatedText: string;
  source: TextReferenceSource;
}

export interface TextReferenceSource {
  type: "code" | "csv" | "xlsx" | "json" | "markdown" | "text" | "url" | "terminal";
  path?: string;
  startLine?: number;
  endLine?: number;
  rows?: [number, number];
  columns?: string[];
  sheet?: string;
  jsonPath?: string;
  url?: string;
  terminalId?: string;
  terminalName?: string;
}

/**
 * Terminal reference - terminal buffer
 */
export interface TerminalReferenceData {
  terminalId: string;
  name: string;
  bufferLines: number;
}

/**
 * Chat reference - another chat session
 */
export interface ChatReferenceData {
  sessionId: string;
  title: string;
  messageCount: number;
  projectName: string | null;
  updatedAt: number;
}

/**
 * Integration reference - OAuth-connected service data
 */
export type IntegrationProvider = "google" | "github" | "notion" | "slack";
export type IntegrationService = "gmail" | "sheets" | "drive" | "calendar" | "repos" | "issues" | "prs" | "pages" | "databases" | "channels" | "messages";

export interface IntegrationReferenceData {
  provider: IntegrationProvider;
  service: IntegrationService;
  integrationId: string;
  resourceId?: string; // Specific email ID, sheet ID, etc.
  resourceLabel: string; // "Recent emails", "Budget 2024", etc.
  query?: string; // Optional query/filter
}

// =============================================================================
// 5. SKILLS (Claude Capability Extensions)
// =============================================================================

/**
 * Skills extend Claude's capabilities with specialized instructions.
 * Defined in `.claude/skills/` directories with SKILL.md frontmatter.
 *
 * Examples: playwright, github, generate-logo
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Where the skill was loaded from */
  source: "global" | "project";
  path: string;
  enabled: boolean;
  /** Frontmatter fields */
  tools?: string[];
  model?: "haiku" | "sonnet" | "opus";
}

// =============================================================================
// 6. AGENTS (AI Personas)
// =============================================================================

/**
 * Agents are specialized AI personas with custom instructions.
 * Defined in `.claude/agents/*.md` with frontmatter.
 *
 * Examples: code-reviewer, frontend-developer, test-writer
 */
export interface Agent {
  name: string;
  description: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  prompt: string;
  source: "global" | "project";
  path: string;
}

// =============================================================================
// 7. COMMANDS (Slash Commands)
// =============================================================================

/**
 * Commands are slash commands triggered with `/command-name` in chat input.
 * Defined in `.claude/commands/*.md` with optional frontmatter.
 *
 * Examples: /review, /test, /deploy
 */
export interface Command {
  name: string;
  description: string;
  argsHint?: string;
  source: "global" | "project";
  path: string;
  enabled: boolean;
  sortOrder: number;
}

// =============================================================================
// 8. HOOKS (Lifecycle Events)
// =============================================================================

/**
 * Hooks execute shell commands in response to Claude events.
 * Configured in `.claude/settings.json` or `.claude/settings.local.json`.
 *
 * Examples: pre-tool-use, post-tool-use, notification
 */
export interface Hook {
  event: HookEvent;
  /** Shell command or matcher patterns */
  commands: HookCommand[];
}

export type HookEvent =
  | "pre-tool-use"
  | "post-tool-use"
  | "notification"
  | "stop"
  | "subagent-spawn";

export interface HookCommand {
  /** Tool name pattern (glob) */
  matcher?: string;
  /** Shell command to execute */
  command: string;
  /** Timeout in ms */
  timeout?: number;
}

// =============================================================================
// 9. SUBAGENT TYPES (Native Agent Display)
// =============================================================================

/**
 * Subagent types determine how agent cards are rendered.
 * Each type has distinct visual treatment optimized for its purpose.
 */
export type SubagentType =
  | "browser"       // Web browsing, research, URL inspection
  | "coding"        // Code writing, file editing, refactoring
  | "research"      // Analysis, documentation, investigation
  | "runner"        // Command execution, build tasks, deployments
  | "reviewer"      // Code review, PR analysis
  | "red-team"      // Security analysis and edge case hunting
  | "goal-agent"    // Declarative goal pursuit
  | "healer-agent"  // Build/type error fixing
  | "consensus"     // Multi-model voting coordinator
  | "general";      // Default fallback

/**
 * Subagent visual config for UI rendering
 */
export interface SubagentTypeConfig {
  type: SubagentType;
  label: string;
  icon: string;           // Lucide icon name
  color: string;          // Tailwind color prefix (e.g., "indigo", "emerald")
  bgColor: string;        // Background color class
  borderColor: string;    // Border color class
  accentColor: string;    // Accent/badge color class
}

/**
 * Subagent activity types for real-time display
 */
export type SubagentActivityType =
  | "browsing"     // Visiting URLs
  | "reading"      // Reading files
  | "writing"      // Creating/editing files
  | "running"      // Executing commands
  | "thinking"     // Processing/analyzing
  | "searching"    // Grep/Glob operations
  | "complete";    // Finished

/**
 * Extracted info from subagent for display
 */
export interface SubagentDisplayInfo {
  type: SubagentType;
  activity: SubagentActivityType;
  /** Current URL for browser agents */
  currentUrl?: string;
  /** Files being worked on for coding agents */
  activeFiles?: string[];
  /** Current command for runner agents */
  currentCommand?: string;
  /** Key findings/summary */
  summary?: string;
  /** Progress (0-100) if determinable */
  progress?: number;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isExtension(obj: unknown): obj is Extension {
  return typeof obj === "object" && obj !== null && "panelMode" in obj && "defaultOrder" in obj;
}

export function isReference(obj: unknown): obj is Reference {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "type" in obj &&
    "data" in obj &&
    "toPromptContent" in obj
  );
}

// =============================================================================
// REGISTRY TYPES
// =============================================================================

/**
 * Generic registry interface for registrable components
 */
export interface Registry<T> {
  register(item: T): void;
  get(id: string): T | undefined;
  getAll(): T[];
  has(id: string): boolean;
  unregister(id: string): boolean;
}
