/**
 * Skill Scout Hook
 *
 * Watches conversations for patterns that could be extracted into reusable skills.
 * When it detects a workflow worth saving, it prompts the user to create a skill.
 */

import type { ProactiveHook, HookContext, HookEvaluation } from "../types";
import { analyzeForSkill, summarizeConversation } from "../analyzer";
import { getServerUrl } from "$lib/config";

/**
 * The Skill Scout hook definition
 */
export const skillScoutHook: ProactiveHook = {
  id: "skill-scout",
  name: "Skill Scout",
  trigger: "onIdle",
  minMessages: 8, // Need enough conversation to analyze
  cooldownMs: 5 * 60 * 1000, // 5 minutes between prompts
  defaultEnabled: true,

  /**
   * Quick check before expensive API call
   */
  shouldEvaluate: (ctx: HookContext): boolean => {
    // Need a project to save skills to
    if (!ctx.project) return false;

    // Need substantial conversation
    if (ctx.conversation.length < 8) return false;

    // Check for tool-heavy conversations (likely workflows)
    const toolUseCount = ctx.conversation.filter(
      (m) => m.role === "assistant" && hasToolUse(m.content)
    ).length;

    // At least 3 tool uses suggests a workflow
    return toolUseCount >= 3;
  },

  /**
   * Analyze conversation for skill extraction
   */
  evaluate: async (ctx: HookContext): Promise<HookEvaluation> => {
    // Create conversation summary
    const summary = summarizeConversation(
      ctx.conversation.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }))
    );

    try {
      // Server handles API key - no need to pass it
      const analysis = await analyzeForSkill(summary);

      if (!analysis.shouldSuggest) {
        return { shouldPrompt: false };
      }

      return {
        shouldPrompt: true,
        type: "skill",
        priority: "medium",
        title: "Save as Skill?",
        description: `I noticed a reusable pattern: "${analysis.skillName}"`,
        expandedContent: `## ${analysis.skillName}

**What I noticed:** ${analysis.reason}

**Pattern:** ${analysis.pattern}

**Description:** ${analysis.description}

This skill would be saved to \`.claude/skills/${analysis.skillName}/\` and can be reused in future conversations.`,
        payload: {
          skillName: analysis.skillName,
          description: analysis.description,
          pattern: analysis.pattern,
          conversationSummary: summary,
        },
      };
    } catch (error) {
      console.error("[SkillScout] Analysis failed:", error);
      return { shouldPrompt: false };
    }
  },

  /**
   * Generate and save the skill when user accepts
   */
  onAccept: async (ctx: HookContext, payload: Record<string, unknown>): Promise<void> => {
    const { skillName, description, pattern, conversationSummary } = payload as {
      skillName: string;
      description: string;
      pattern: string;
      conversationSummary: string;
    };

    if (!ctx.project) {
      console.error("[SkillScout] No project context for skill creation");
      return;
    }

    // Call the backend to generate and save the skill
    try {
      const response = await fetch(`${getServerUrl()}/api/skills/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: ctx.project.path,
          skillName,
          description,
          pattern,
          conversationSummary,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate skill: ${await response.text()}`);
      }

      console.log(`[SkillScout] Skill "${skillName}" created successfully`);
    } catch (error) {
      console.error("[SkillScout] Failed to create skill:", error);
      throw error;
    }
  },
};

/**
 * Check if message content contains tool use
 */
function hasToolUse(content: unknown): boolean {
  if (typeof content === "string") {
    return false;
  }
  if (Array.isArray(content)) {
    return content.some(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: string }).type === "tool_use"
    );
  }
  return false;
}

// Legacy export for backwards compatibility
export function setApiKeyGetter(_getter: () => string): void {
  // No-op - server handles API key
}
