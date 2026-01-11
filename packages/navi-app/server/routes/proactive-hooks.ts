/**
 * @experimental This feature is experimental and may change or be removed.
 *
 * Proactive Hooks - Server Routes
 *
 * Server-side endpoints for running proactive hook analysis.
 * This keeps the API key secure on the server while allowing
 * the frontend to trigger analysis.
 */

import { json } from "../utils/response";
import { globalSettings } from "../db";

const HAIKU_MODEL = "claude-3-5-haiku-20241022";
const API_URL = "https://api.anthropic.com/v1/messages";

interface AnalyzeRequest {
  type: "skill" | "memory" | "error";
  conversationSummary: string;
  existingMemory?: string;
  errorSummary?: string;
  conversationContext?: string;
}

interface SkillAnalysis {
  shouldSuggest: boolean;
  reason: string;
  skillName: string;
  description: string;
  pattern: string;
}

interface MemoryAnalysis {
  shouldSuggest: boolean;
  entries: Array<{
    category: "preference" | "stack" | "pattern" | "style" | "context";
    content: string;
    confidence: number;
  }>;
}

interface ErrorAnalysis {
  isRecurring: boolean;
  rootCause: string;
  library?: string;
  suggestDocs: boolean;
  docsQuery?: string;
  fixSuggestion: string;
}

/**
 * Call Haiku for cheap analysis
 */
async function callHaiku(
  apiKey: string,
  system: string,
  prompt: string,
  maxTokens: number = 256
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const result = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = result.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text in response");
  }

  return textBlock.text;
}

/**
 * Parse JSON from Haiku response (handles markdown code blocks)
 */
function parseJson<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

export async function handleProactiveHooksRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/proactive-hooks/analyze - Run analysis
  if (url.pathname === "/api/proactive-hooks/analyze" && method === "POST") {
    try {
      const apiKey = globalSettings.get("anthropicApiKey") as string | null;
      if (!apiKey) {
        return json({ error: "No API key configured", enabled: false }, 400);
      }

      const body = await req.json() as AnalyzeRequest;
      const { type, conversationSummary, existingMemory, errorSummary, conversationContext } = body;

      if (!type || !conversationSummary) {
        return json({ error: "type and conversationSummary required" }, 400);
      }

      const systemPrompt = "You are a helpful assistant that analyzes conversations and returns structured JSON responses. Always respond with valid JSON only, no markdown code blocks.";

      let result: SkillAnalysis | MemoryAnalysis | ErrorAnalysis;

      switch (type) {
        case "skill": {
          const prompt = `Analyze this conversation for potential skill extraction.

A skill is worth suggesting when:
- A multi-step workflow was repeated or could be reusable
- Domain-specific instructions were given that could apply to future tasks
- A complex task was completed that others might benefit from

Conversation summary:
${conversationSummary}

Return JSON:
{
  "shouldSuggest": boolean,
  "reason": "why this would make a good skill (or why not)",
  "skillName": "kebab-case-name",
  "description": "when to use this skill",
  "pattern": "the reusable pattern identified"
}`;

          const text = await callHaiku(apiKey, systemPrompt, prompt);
          result = parseJson<SkillAnalysis>(text);
          break;
        }

        case "memory": {
          const prompt = `Analyze this conversation to extract learnable information about the user.

Look for:
- Tool/framework preferences (e.g., "prefers Bun over npm")
- Tech stack info (e.g., "uses Svelte 5, Tailwind")
- Coding patterns (e.g., "likes functional style")
- Communication style (e.g., "appreciates concise answers")
- Project context (e.g., "building a desktop app")

${existingMemory ? `Existing memory (don't repeat):\n${existingMemory}\n` : ""}

Conversation:
${conversationSummary}

Return JSON:
{
  "shouldSuggest": boolean,
  "entries": [
    {
      "category": "preference" | "stack" | "pattern" | "style" | "context",
      "content": "the learned information",
      "confidence": 0.0-1.0
    }
  ]
}

Only include entries with confidence > 0.7. Return empty entries array if nothing worth saving.`;

          const text = await callHaiku(apiKey, systemPrompt, prompt);
          result = parseJson<MemoryAnalysis>(text);
          break;
        }

        case "error": {
          const prompt = `Analyze this recurring error pattern.

Error info:
${errorSummary || "Unknown error"}

Context from conversation:
${conversationContext || conversationSummary}

Return JSON:
{
  "isRecurring": boolean,
  "rootCause": "likely root cause of the error",
  "library": "library/framework name if applicable",
  "suggestDocs": boolean,
  "docsQuery": "search query for docs if suggestDocs is true",
  "fixSuggestion": "brief suggestion for fixing"
}`;

          const text = await callHaiku(apiKey, systemPrompt, prompt);
          result = parseJson<ErrorAnalysis>(text);
          break;
        }

        default:
          return json({ error: `Unknown analysis type: ${type}` }, 400);
      }

      return json({ success: true, type, result });
    } catch (e: any) {
      console.error("[ProactiveHooks] Analysis failed:", e);
      return json({ error: e.message || "Analysis failed" }, 500);
    }
  }

  // GET /api/proactive-hooks/status - Check if hooks are available
  if (url.pathname === "/api/proactive-hooks/status" && method === "GET") {
    const apiKey = globalSettings.get("anthropicApiKey") as string | null;
    return json({
      enabled: !!apiKey,
      hasApiKey: !!apiKey,
    });
  }

  return null;
}
