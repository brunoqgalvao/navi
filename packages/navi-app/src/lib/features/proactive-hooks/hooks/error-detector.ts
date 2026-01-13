/**
 * Error Pattern Detector Hook
 *
 * Detects recurring errors in conversations and suggests fetching relevant documentation
 * or investigating root causes.
 */

import type { ProactiveHook, HookContext, HookEvaluation, ErrorPattern } from "../types";
import { analyzeErrorPattern, summarizeConversation } from "../analyzer";

/**
 * Known documentation URLs for common libraries
 */
const DOC_URLS: Record<string, string> = {
  react: "https://react.dev/reference/react",
  svelte: "https://svelte.dev/docs",
  vue: "https://vuejs.org/guide",
  "next.js": "https://nextjs.org/docs",
  express: "https://expressjs.com/en/api.html",
  prisma: "https://www.prisma.io/docs",
  "tailwind css": "https://tailwindcss.com/docs",
  typescript: "https://www.typescriptlang.org/docs",
  bun: "https://bun.sh/docs",
  tauri: "https://tauri.app/v1/guides",
  vite: "https://vitejs.dev/guide",
};

/**
 * The Error Pattern Detector hook definition
 */
export const errorDetectorHook: ProactiveHook = {
  id: "error-detector",
  name: "Error Pattern Detector",
  trigger: "postAssistantMessage",
  minMessages: 4, // Need some context
  cooldownMs: 2 * 60 * 1000, // 2 minutes between prompts
  defaultEnabled: true,

  /**
   * Quick check - do we have recurring errors?
   */
  shouldEvaluate: (ctx: HookContext): boolean => {
    // Need tracked errors
    if (ctx.recentErrors.length === 0) return false;

    // Check for recurring errors (seen 2+ times)
    const recurringErrors = ctx.recentErrors.filter((e) => e.count >= 2);

    return recurringErrors.length > 0;
  },

  /**
   * Analyze the error pattern
   */
  evaluate: async (ctx: HookContext): Promise<HookEvaluation> => {
    // Get the most significant recurring error
    const recurringErrors = ctx.recentErrors
      .filter((e) => e.count >= 2)
      .sort((a, b) => b.count - a.count);

    if (recurringErrors.length === 0) {
      return { shouldPrompt: false };
    }

    const primaryError = recurringErrors[0];

    // Build error summary
    const errorSummary = formatErrorSummary(primaryError);

    // Get recent conversation context
    const recentMessages = ctx.conversation.slice(-6);
    const contextSummary = summarizeConversation(
      recentMessages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      1000
    );

    try {
      // Server handles API key
      const analysis = await analyzeErrorPattern(errorSummary, contextSummary);

      if (!analysis.isRecurring) {
        return { shouldPrompt: false };
      }

      // Build the suggestion
      const title = analysis.suggestDocs
        ? `Check ${analysis.library || "docs"} documentation?`
        : "Investigate recurring error?";

      const docUrl = analysis.library
        ? DOC_URLS[analysis.library.toLowerCase()]
        : undefined;

      return {
        shouldPrompt: true,
        type: "docs",
        priority: "high",
        title,
        description: `This error has appeared ${primaryError.count} times: "${truncate(primaryError.message, 60)}"`,
        expandedContent: `## Recurring Error Detected

**Error:** \`${primaryError.message}\`
${primaryError.file ? `**File:** ${primaryError.file}${primaryError.line ? `:${primaryError.line}` : ""}` : ""}
**Occurrences:** ${primaryError.count} times

### Analysis
**Likely root cause:** ${analysis.rootCause}

**Suggestion:** ${analysis.fixSuggestion}

${analysis.suggestDocs && analysis.docsQuery ? `### Recommended Documentation
Search: "${analysis.docsQuery}"
${docUrl ? `\n[${analysis.library} Docs](${docUrl})` : ""}` : ""}`,
        payload: {
          error: primaryError,
          analysis,
          docUrl,
          docsQuery: analysis.docsQuery,
          library: analysis.library,
        },
      };
    } catch (error) {
      console.error("[ErrorDetector] Analysis failed:", error);
      return { shouldPrompt: false };
    }
  },

  /**
   * Handle user accepting - fetch docs or investigate
   */
  onAccept: async (_ctx: HookContext, payload: Record<string, unknown>): Promise<void> => {
    const { docUrl, docsQuery, library } = payload as {
      docUrl?: string;
      docsQuery?: string;
      library?: string;
    };

    if (docUrl) {
      // Emit event for UI to handle
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("navi:open-docs", {
            detail: { url: docUrl, query: docsQuery, library },
          })
        );
      }
    }
  },
};

/**
 * Format error for analysis
 */
function formatErrorSummary(error: ErrorPattern): string {
  let summary = `Error: ${error.message}`;
  if (error.file) {
    summary += `\nFile: ${error.file}`;
    if (error.line) {
      summary += `:${error.line}`;
    }
  }
  if (error.library) {
    summary += `\nLibrary: ${error.library}`;
  }
  summary += `\nOccurrences: ${error.count}`;
  return summary;
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// Legacy export for backwards compatibility
export function setApiKeyGetter(_getter: () => string): void {
  // No-op - server handles API key
}
