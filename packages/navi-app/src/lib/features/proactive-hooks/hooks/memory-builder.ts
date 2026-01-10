/**
 * Memory Builder Hook
 *
 * Learns about user preferences, tech stack, and patterns from conversations.
 * Prompts to save useful information to project memory (.claude/MEMORY.md).
 */

import type { ProactiveHook, HookContext, HookEvaluation, ProjectMemory } from "../types";
import { analyzeForMemory, summarizeConversation } from "../analyzer";
import { getServerUrl } from "$lib/config";

/**
 * Category display names and icons
 */
const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  preference: { label: "Preferences", icon: "⚙️" },
  stack: { label: "Tech Stack", icon: "🛠️" },
  pattern: { label: "Patterns", icon: "📐" },
  style: { label: "Style", icon: "🎨" },
  context: { label: "Context", icon: "📋" },
};

/**
 * The Memory Builder hook definition
 */
export const memoryBuilderHook: ProactiveHook = {
  id: "memory-builder",
  name: "Memory Builder",
  trigger: "onIdle",
  minMessages: 6,
  cooldownMs: 10 * 60 * 1000, // 10 minutes between prompts
  defaultEnabled: true,

  /**
   * Quick check - is this conversation worth analyzing for memory?
   */
  shouldEvaluate: (ctx: HookContext): boolean => {
    // Need a project context
    if (!ctx.project) return false;

    // Need decent conversation
    if (ctx.conversation.length < 6) return false;

    // Look for signals that we're learning something
    const signals = [
      /\bi prefer\b/i,
      /\bi like\b/i,
      /\balways use\b/i,
      /\bwe use\b/i,
      /\bour stack\b/i,
      /\bthis project uses\b/i,
      /\bkeep it\b/i,
      /\bmake it\b/i,
      /\bi want\b/i,
      /\bdon't use\b/i,
      /\bavoid\b/i,
    ];

    const userMessages = ctx.conversation.filter((m) => m.role === "user");
    for (const msg of userMessages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      for (const signal of signals) {
        if (signal.test(content)) {
          return true;
        }
      }
    }

    // Also trigger if conversation is substantial even without explicit signals
    return ctx.conversation.length >= 12;
  },

  /**
   * Analyze conversation for learnable information
   */
  evaluate: async (ctx: HookContext): Promise<HookEvaluation> => {
    if (!ctx.project) {
      return { shouldPrompt: false };
    }

    // Create conversation summary
    const summary = summarizeConversation(
      ctx.conversation.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }))
    );

    // Load existing memory to avoid duplicates
    let existingMemory: string | null = null;
    try {
      const response = await fetch(
        `${getServerUrl()}/api/projects/${ctx.project.id}/memory`
      );
      if (response.ok) {
        const data = await response.json();
        existingMemory = data.content;
      }
    } catch {
      // No existing memory, that's fine
    }

    try {
      // Server handles API key
      const analysis = await analyzeForMemory(summary, existingMemory);

      if (!analysis.shouldSuggest || analysis.entries.length === 0) {
        return { shouldPrompt: false };
      }

      // Format entries for display
      const entryLines = analysis.entries.map((e) => {
        const meta = CATEGORY_META[e.category] || { label: e.category, icon: "📝" };
        return `- ${meta.icon} **${meta.label}:** ${e.content}`;
      });

      return {
        shouldPrompt: true,
        type: "memory",
        priority: "low",
        title: "Save to memory?",
        description: `I learned ${analysis.entries.length} thing${analysis.entries.length > 1 ? "s" : ""} about your preferences`,
        expandedContent: `## Learned from this conversation

${entryLines.join("\n")}

These will be saved to \`.claude/MEMORY.md\` and automatically loaded in future sessions for this project.`,
        payload: {
          entries: analysis.entries,
        },
      };
    } catch (error) {
      console.error("[MemoryBuilder] Analysis failed:", error);
      return { shouldPrompt: false };
    }
  },

  /**
   * Save memory entries when user accepts
   */
  onAccept: async (ctx: HookContext, payload: Record<string, unknown>): Promise<void> => {
    if (!ctx.project) {
      console.error("[MemoryBuilder] No project context");
      return;
    }

    const { entries } = payload as {
      entries: Array<{
        category: string;
        content: string;
        confidence: number;
      }>;
    };

    try {
      const response = await fetch(`${getServerUrl()}/api/projects/${ctx.project.id}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((e) => ({
            category: e.category,
            content: e.content,
            sessionId: ctx.sessionId,
            timestamp: Date.now(),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save memory: ${await response.text()}`);
      }

      console.log(`[MemoryBuilder] Saved ${entries.length} memory entries`);
    } catch (error) {
      console.error("[MemoryBuilder] Failed to save memory:", error);
      throw error;
    }
  },
};

// =============================================================================
// MEMORY FILE UTILITIES
// =============================================================================

/**
 * Format memory entries as markdown
 */
export function formatMemoryMarkdown(memory: ProjectMemory): string {
  const sections: string[] = [
    "# Project Memory",
    "",
    "_Automatically learned from conversations. Edit freely._",
    "",
  ];

  const addSection = (title: string, items: string[], icon: string) => {
    if (items.length === 0) return;
    sections.push(`## ${icon} ${title}`, "");
    for (const item of items) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  };

  addSection("Preferences", memory.preferences, "⚙️");
  addSection("Tech Stack", memory.stack, "🛠️");
  addSection("Coding Patterns", memory.patterns, "📐");
  addSection("Style", memory.style, "🎨");
  addSection("Project Context", memory.context, "📋");

  sections.push(`---`, `_Last updated: ${new Date(memory.updatedAt).toISOString()}_`);

  return sections.join("\n");
}

/**
 * Parse memory markdown back to structure
 */
export function parseMemoryMarkdown(content: string): ProjectMemory {
  const memory: ProjectMemory = {
    preferences: [],
    stack: [],
    patterns: [],
    style: [],
    context: [],
    updatedAt: Date.now(),
  };

  const sectionMap: Record<string, keyof ProjectMemory> = {
    preferences: "preferences",
    "tech stack": "stack",
    "coding patterns": "patterns",
    style: "style",
    "project context": "context",
  };

  let currentSection: keyof ProjectMemory | null = null;
  const lines = content.split("\n");

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+.?\s*(.+)$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].toLowerCase().trim();
      currentSection = sectionMap[sectionName] || null;
      continue;
    }

    const itemMatch = line.match(/^-\s+(.+)$/);
    if (itemMatch && currentSection && Array.isArray(memory[currentSection])) {
      (memory[currentSection] as string[]).push(itemMatch[1].trim());
    }
  }

  return memory;
}

// Legacy export for backwards compatibility
export function setApiKeyGetter(_getter: () => string): void {
  // No-op - server handles API key
}
