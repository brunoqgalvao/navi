/**
 * Navi Core Module
 *
 * This module defines the unified architecture for all UI/UX components in Navi.
 * Import from here for all core types, registries, and utilities.
 *
 * ## Architecture Overview
 *
 * Navi has 10 distinct component categories:
 *
 * 1. **Extensions** - Sidebar panels (Files, Git, Terminal, Preview, etc.)
 * 2. **Message Widgets** - Inline renderers in chat (code blocks, media, tools)
 * 3. **Dashboard Widgets** - Project landing page components
 * 4. **References** - @ mentions in chat input (files, terminals, chats)
 * 5. **Skills** - Claude capability extensions (.claude/skills/)
 * 6. **Agents** - AI personas (.claude/agents/)
 * 7. **Commands** - Slash commands (.claude/commands/)
 * 8. **Hooks** - Lifecycle event handlers
 * 9. **Subagents** - Task tool agent rendering configs
 * 10. **Tool Groups** - Collapsible tool activity rendering (Search, FileOps, Browser, etc.)
 *
 * Each category has:
 * - Type definitions in `types.ts`
 * - A registry in `registries.ts` or dedicated file (for extensible components)
 * - Factory functions for creating instances
 *
 * @example
 * ```ts
 * import {
 *   // Types
 *   type Extension,
 *   type Reference,
 *   type MessageWidget,
 *   type ToolGroup,
 *
 *   // Registries
 *   extensionRegistry,
 *   messageWidgetRegistry,
 *   toolGroupRegistry,
 *
 *   // Factories
 *   createFileReference,
 *   createTerminalReference,
 *
 *   // Grouping
 *   groupToolBlocks,
 *
 *   // Stores
 *   references,
 * } from "$lib/core";
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Extensions
  Extension,
  ExtensionId,
  PanelMode,

  // Message Widgets
  MessageWidget,
  MessageWidgetType,

  // Dashboard Widgets
  DashboardWidget,
  DashboardWidgetType,

  // References
  Reference,
  ReferenceType,
  FileReferenceData,
  TextReferenceData,
  TextReferenceSource,
  TerminalReferenceData,
  ChatReferenceData,

  // Skills, Agents, Commands, Hooks
  Skill,
  Agent,
  Command,
  Hook,
  HookEvent,
  HookCommand,

  // Subagent types
  SubagentType,
  SubagentTypeConfig,
  SubagentActivityType,
  SubagentDisplayInfo,

  // Registry interface
  Registry,
} from "./types";

export { isExtension, isReference } from "./types";

// =============================================================================
// REGISTRIES
// =============================================================================

export {
  // Singleton instances
  extensionRegistry,
  messageWidgetRegistry,
  dashboardWidgetRegistry,

  // Default data
  DEFAULT_EXTENSIONS,

  // Initialization
  initializeRegistries,
  resetRegistries,
} from "./registries";

// =============================================================================
// REFERENCES
// =============================================================================

export {
  // Factory functions
  createFileReference,
  createTextReference,
  createTerminalReference,
  createChatReference,

  // Unified store
  references,

  // Derived stores
  fileReferences,
  textReferences,
  terminalReferences,
  chatReferences,
  referenceCount,

  // Legacy adapters (deprecated)
  fromLegacyTextReference,
  fromLegacyTerminalReference,
  fromLegacyChatReference,
} from "./references";

// =============================================================================
// MESSAGE WIDGETS
// =============================================================================

export {
  // Registration helpers
  registerCodeBlockWidget,
  registerToolWidget,
  registerContentWidget,

  // Content matching
  findWidgetForContent,
  hasSpecialWidget,

  // Special languages
  SPECIAL_CODE_LANGUAGES,
  isSpecialCodeLanguage,

  // Types
  type CodeBlock,
  type MediaBlock,
  type MediaItem,
  type ToolResultBlock,
  type ContentBlock,
  type WidgetRenderContext,
  type BaseWidgetProps,
  type SpecialCodeLanguage,
} from "./message-widgets";

// =============================================================================
// SUBAGENTS (Legacy - for Claude SDK Task tool)
// =============================================================================

export {
  // Configs
  SUBAGENT_CONFIGS,
  ACTIVITY_LABELS,
  ACTIVITY_ICONS,

  // Inference & extraction
  inferSubagentType,
  getSubagentConfig,
  inferActivity,
  extractDisplayInfo,
} from "./subagents";

// =============================================================================
// AGENT TYPES (New - for Navi's native agent framework)
// =============================================================================

export type {
  AgentType,
  AgentCapabilities,
  AgentDefinition,
  UserAgentDefinition,
} from "./agent-types";

export {
  // Built-in definitions
  BUILTIN_AGENTS,

  // Helpers
  getAgentDefinition,
  getBuiltinAgentTypes,
  hasNativeUI,
  inferAgentTypeFromRole,
  getAgentDisplayConfig,

  // User agent parsing
  parseUserAgentFrontmatter,
} from "./agent-types";

// =============================================================================
// TOOL GROUPS (Collapsible Tool Activity)
// =============================================================================

export type {
  ToolGroupType,
  ToolStep,
  ToolGroup,
  ToolGroupConfig,
  GroupedContentItem,
} from "./tool-groups";

export {
  // Config
  TOOL_GROUP_CONFIG,

  // Grouping logic
  getToolGroupType,
  shouldGroupTogether,
  generateGroupSummary,
  getGroupStats,
  groupToolBlocks,

  // Type guards
  isToolGroup,
  isSingleTool,

  // Helpers
  extractToolResultText,
} from "./tool-groups";
