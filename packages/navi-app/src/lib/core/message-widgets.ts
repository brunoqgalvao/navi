/**
 * Message Widget System
 *
 * Provides a unified way to render inline widgets within chat messages.
 * Instead of conditional branches in AssistantMessage.svelte, widgets
 * register themselves and are matched against content.
 */

import type { ComponentType, SvelteComponent } from "svelte";
import { messageWidgetRegistry } from "./registries";
import type { MessageWidget, MessageWidgetType } from "./types";

// =============================================================================
// WIDGET REGISTRATION HELPERS
// =============================================================================

/**
 * Register a code block widget (```lang ... ```)
 */
export function registerCodeBlockWidget(
  language: string,
  component: ComponentType<SvelteComponent>,
  options: {
    parseConfig?: (content: string, meta?: string) => unknown;
  } = {}
): void {
  messageWidgetRegistry.register({
    type: `code-block-${language}` as MessageWidgetType,
    component,
    matcher: (content) => {
      if (typeof content !== "object" || content === null) return false;
      const block = content as { type?: string; language?: string };
      return block.type === "code" && block.language === language;
    },
    parseConfig: options.parseConfig
      ? (content: unknown) => {
          const block = content as CodeBlock;
          return options.parseConfig!(block.content, block.meta);
        }
      : undefined,
  });
}

/**
 * Register a tool result widget
 */
export function registerToolWidget(
  toolName: string,
  component: ComponentType<SvelteComponent>,
  options: {
    parseConfig?: (result: unknown) => unknown;
  } = {}
): void {
  messageWidgetRegistry.register({
    type: `tool-${toolName}` as MessageWidgetType,
    component,
    matcher: (content) => {
      if (typeof content !== "object" || content === null) return false;
      const block = content as { type?: string; name?: string };
      return block.type === "tool_result" && block.name === toolName;
    },
    parseConfig: options.parseConfig,
  });
}

/**
 * Register a generic content widget
 */
export function registerContentWidget(
  type: MessageWidgetType,
  component: ComponentType<SvelteComponent>,
  matcher: (content: unknown) => boolean,
  options: {
    parseConfig?: (content: unknown) => unknown;
  } = {}
): void {
  messageWidgetRegistry.register({
    type,
    component,
    matcher,
    parseConfig: options.parseConfig,
  });
}

// =============================================================================
// CONTENT MATCHING
// =============================================================================

/**
 * Content block types that can appear in messages
 */
export interface CodeBlock {
  type: "code";
  language: string;
  content: string;
  meta?: string;
}

export interface MediaBlock {
  type: "media";
  items: MediaItem[];
}

export interface MediaItem {
  src: string;
  alt?: string;
  caption?: string;
  type?: "image" | "audio" | "video";
}

export interface ToolResultBlock {
  type: "tool_result";
  name: string;
  result: unknown;
  error?: string;
}

export type ContentBlock = CodeBlock | MediaBlock | ToolResultBlock | { type: string; [key: string]: unknown };

/**
 * Find the best widget for a content block
 */
export function findWidgetForContent(content: ContentBlock): MessageWidget | undefined {
  return messageWidgetRegistry.findMatch(content);
}

/**
 * Check if content should be rendered with a special widget
 */
export function hasSpecialWidget(content: ContentBlock): boolean {
  return messageWidgetRegistry.findMatch(content) !== undefined;
}

// =============================================================================
// SPECIAL CODE BLOCK LANGUAGES
// =============================================================================

/**
 * Code block languages that have special rendering
 */
export const SPECIAL_CODE_LANGUAGES = [
  "mermaid",
  "media",
  "genui",
  "copyable",
  "json",
  "actions", // dashboard actions
  "widget",  // dashboard widgets
] as const;

export type SpecialCodeLanguage = (typeof SPECIAL_CODE_LANGUAGES)[number];

/**
 * Check if a language has special rendering
 */
export function isSpecialCodeLanguage(language: string): language is SpecialCodeLanguage {
  return SPECIAL_CODE_LANGUAGES.includes(language as SpecialCodeLanguage);
}

// =============================================================================
// WIDGET RENDER CONTEXT
// =============================================================================

/**
 * Context passed to widget components
 */
export interface WidgetRenderContext {
  /** The message this widget belongs to */
  messageId: string;
  /** Session ID for context-aware operations */
  sessionId: string;
  /** Project path if available */
  projectPath?: string;
  /** Callbacks for widget actions */
  callbacks: {
    onPreview?: (url: string) => void;
    onFileClick?: (path: string) => void;
    onTerminalOpen?: (command: string) => void;
    onCopy?: (text: string) => void;
  };
}

/**
 * Props that all widget components receive
 */
export interface BaseWidgetProps<TConfig = unknown> {
  content: ContentBlock;
  config: TConfig;
  context: WidgetRenderContext;
  compact?: boolean;
}
