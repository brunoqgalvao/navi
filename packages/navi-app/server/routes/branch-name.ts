import { json } from "../utils/response";
import { execSync } from "child_process";

const LLM_SKILL_PATH = `${process.env.HOME}/.claude/skills/navi-llm/index.ts`;

/**
 * Generate a smart git branch name using an ephemeral LLM call
 * Uses haiku for speed and cost efficiency
 */
async function generateSmartBranchName(description: string): Promise<string> {
  const prompt = `Generate a git branch name for this task. Rules:
- Use kebab-case (lowercase-with-hyphens)
- Max 40 characters
- Be descriptive but concise
- No special characters except hyphens
- Start with a verb like: add, fix, update, refactor, implement, remove
- Output ONLY the branch name, nothing else

Task: ${description}`;

  try {
    // Use haiku for fast, cheap branch name generation
    const result = execSync(
      `bun "${LLM_SKILL_PATH}" haiku "${prompt.replace(/"/g, '\\"')}"`,
      {
        encoding: "utf-8",
        timeout: 10000, // 10 second timeout
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Clean up the result - remove any extra whitespace, quotes, or formatting
    let branchName = result
      .trim()
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/^`+|`+$/g, "") // Remove backticks
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") // Only allow lowercase, numbers, hyphens
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
      .slice(0, 40); // Max length

    // Validate we got something reasonable
    if (branchName.length < 3) {
      throw new Error("Generated name too short");
    }

    return branchName;
  } catch (error) {
    console.error("[BranchName] LLM generation failed:", error);
    // Fall back to simple sanitization
    return fallbackBranchName(description);
  }
}

/**
 * Fallback branch name generation (no LLM)
 */
function fallbackBranchName(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function handleBranchNameRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/branch-name/generate - Generate smart branch name
  if (url.pathname === "/api/branch-name/generate" && method === "POST") {
    try {
      const body = await req.json();
      const { description, useLlm = true } = body;

      if (!description || typeof description !== "string") {
        return json({ error: "description is required" }, 400);
      }

      let branchName: string;
      let generatedBy: "llm" | "fallback";

      if (useLlm) {
        branchName = await generateSmartBranchName(description);
        generatedBy = "llm";
      } else {
        branchName = fallbackBranchName(description);
        generatedBy = "fallback";
      }

      // Add session prefix
      const timestamp = Date.now().toString(36);
      const fullBranchName = `session/${branchName}-${timestamp}`;

      return json({
        branchName: fullBranchName,
        shortName: branchName,
        generatedBy,
      });
    } catch (error: any) {
      console.error("[BranchName] Error:", error);
      return json({ error: error.message || "Failed to generate branch name" }, 500);
    }
  }

  return null;
}
