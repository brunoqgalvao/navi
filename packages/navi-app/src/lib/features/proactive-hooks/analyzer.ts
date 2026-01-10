/**
 * Proactive Hooks - Haiku Analyzer
 *
 * Calls the server-side analyze API endpoint which handles
 * the Haiku calls securely with the stored API key.
 */

import { getServerUrl } from "$lib/config";

/**
 * Reset client (no-op for server-side analysis)
 */
export function resetAnalyzerClient(): void {
  // No client to reset - analysis happens server-side
}

// =============================================================================
// SPECIALIZED ANALYZERS (via server API)
// =============================================================================

export interface SkillAnalysis {
  shouldSuggest: boolean;
  reason: string;
  skillName: string;
  description: string;
  pattern: string;
}

export interface MemoryAnalysis {
  shouldSuggest: boolean;
  entries: Array<{
    category: "preference" | "stack" | "pattern" | "style" | "context";
    content: string;
    confidence: number;
  }>;
}

export interface ErrorAnalysis {
  isRecurring: boolean;
  rootCause: string;
  library?: string;
  suggestDocs: boolean;
  docsQuery?: string;
  fixSuggestion: string;
}

interface AnalyzeResponse<T> {
  success?: boolean;
  type?: string;
  result?: T;
  error?: string;
  enabled?: boolean;
}

/**
 * Call server-side analysis endpoint
 */
async function serverAnalyze<T>(
  type: "skill" | "memory" | "error",
  data: Record<string, string | undefined>
): Promise<T> {
  const response = await fetch(`${getServerUrl()}/api/proactive-hooks/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...data }),
  });

  const json = await response.json() as AnalyzeResponse<T>;

  if (!response.ok || json.error) {
    throw new Error(json.error || `Analysis failed: ${response.status}`);
  }

  if (!json.result) {
    throw new Error("No result from analysis");
  }

  return json.result;
}

/**
 * Analyze conversation for skill extraction opportunities
 *
 * Note: apiKey parameter is ignored - server uses stored key
 */
export async function analyzeForSkill(
  conversationSummary: string,
  _apiKey?: string
): Promise<SkillAnalysis> {
  return serverAnalyze<SkillAnalysis>("skill", { conversationSummary });
}

/**
 * Analyze conversation for memory/preference extraction
 *
 * Note: apiKey parameter is ignored - server uses stored key
 */
export async function analyzeForMemory(
  conversationSummary: string,
  existingMemory: string | null,
  _apiKey?: string
): Promise<MemoryAnalysis> {
  return serverAnalyze<MemoryAnalysis>("memory", {
    conversationSummary,
    existingMemory: existingMemory || undefined,
  });
}

/**
 * Analyze error patterns for root cause and documentation
 *
 * Note: apiKey parameter is ignored - server uses stored key
 */
export async function analyzeErrorPattern(
  errorSummary: string,
  conversationContext: string,
  _apiKey?: string
): Promise<ErrorAnalysis> {
  return serverAnalyze<ErrorAnalysis>("error", {
    errorSummary,
    conversationContext,
  });
}

/**
 * Check if proactive hooks are available (API key configured)
 */
export async function checkHooksStatus(): Promise<{ enabled: boolean; hasApiKey: boolean }> {
  try {
    const response = await fetch(`${getServerUrl()}/api/proactive-hooks/status`);
    if (!response.ok) {
      return { enabled: false, hasApiKey: false };
    }
    return await response.json();
  } catch {
    return { enabled: false, hasApiKey: false };
  }
}

// =============================================================================
// CONVERSATION SUMMARIZER
// =============================================================================

/**
 * Create a compact summary of conversation for analysis
 * This runs locally, no API call needed
 */
export function summarizeConversation(
  messages: Array<{ role: string; content: string | unknown }>,
  maxLength: number = 2000
): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    let content = "";

    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Handle content blocks
      content = (msg.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("\n");
    }

    // Truncate long messages
    if (content.length > 500) {
      content = content.slice(0, 500) + "...";
    }

    lines.push(`${role}: ${content}`);

    // Check total length
    if (lines.join("\n").length > maxLength) {
      lines.pop();
      lines.push("...(truncated)");
      break;
    }
  }

  return lines.join("\n");
}

// =============================================================================
// LEGACY EXPORTS (for backwards compatibility)
// =============================================================================

// These are kept for type exports but the implementations now use server-side
export interface AnalyzeOptions {
  prompt: string;
  system?: string;
  maxTokens?: number;
  apiKey: string;
}

/**
 * @deprecated Use specific analyze functions instead
 */
export async function analyze<T = unknown>(_options: AnalyzeOptions): Promise<T> {
  throw new Error(
    "Direct analyze() is deprecated. Use analyzeForSkill(), analyzeForMemory(), or analyzeErrorPattern() instead."
  );
}
