/**
 * Verifier Agent - Full autonomous agent for loop verification
 *
 * The verifier is a complete agent that can:
 * - Run tests
 * - Read files
 * - Execute commands
 * - Browse the web
 * - Make intelligent decisions about task completion
 */

import { getSDK } from "../utils/sdk-loader";
import { buildClaudeCodeEnv, getClaudeCodeRuntimeOptions } from "../utils/claude-code";
import { resolveNaviClaudeAuth } from "../utils/navi-auth";
import {
  type LoopState,
  type VerifierDecision,
  generateVerifierPrompt,
  verifyDodItems,
  updateLoopContext,
} from "./loop-manager";

// ═══════════════════════════════════════════════════════════════════════════
// VERIFIER EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface VerifierResult {
  decision: VerifierDecision;
  tokensUsed: number;
  costUsd: number;
  rawOutput: string;
}

/**
 * Run the verifier agent to check if the loop task is complete
 *
 * The verifier has FULL tool access and can do anything needed to verify:
 * - Run tests (Bash)
 * - Read files (Read)
 * - Search code (Grep, Glob)
 * - Check deployments (WebFetch)
 * - And more
 */
export async function runVerifier(
  state: LoopState,
  projectPath: string
): Promise<VerifierResult> {
  const prompt = generateVerifierPrompt(state);

  // Use haiku by default for cost efficiency, but can use sonnet for complex verification
  const modelMap: Record<string, string> = {
    haiku: "claude-3-5-haiku-20241022",
    sonnet: "claude-sonnet-4-20250514",
  };
  const model = modelMap[state.verifierModel] || modelMap.haiku;

  const { overrides } = resolveNaviClaudeAuth(model);
  const { query } = await getSDK();

  let rawOutput = "";
  let tokensUsed = 0;
  let costUsd = 0;

  try {
    const q = query({
      prompt,
      options: {
        cwd: projectPath,
        // Full tool access - verifier can do anything
        allowedTools: [
          "Read",
          "Bash",
          "Glob",
          "Grep",
          "WebFetch",
          "WebSearch",
        ],
        maxTurns: 10, // Allow multiple tool calls for thorough verification
        model,
        env: buildClaudeCodeEnv(process.env, overrides),
        ...getClaudeCodeRuntimeOptions(),
      },
    });

    for await (const msg of q) {
      if (msg.type === "assistant") {
        const textBlock = msg.message.content.find((b: any) => b.type === "text");
        if (textBlock) {
          rawOutput += textBlock.text;
        }
      }
      if (msg.type === "result") {
        tokensUsed = (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
        costUsd = msg.total_cost_usd || 0;
      }
    }

    // Parse the verifier's decision from the output
    const decision = parseVerifierDecision(rawOutput, state);

    // Update loop state based on verifier's findings
    if (decision.verifiedItems.length > 0) {
      verifyDodItems(state.loopId, decision.verifiedItems, "verifier");
    }
    if (decision.updatedContext) {
      updateLoopContext(state.loopId, decision.updatedContext);
    }

    return {
      decision,
      tokensUsed,
      costUsd,
      rawOutput,
    };
  } catch (error) {
    console.error("[Verifier] Error running verifier agent:", error);

    // Return a safe default decision on error
    return {
      decision: {
        complete: false,
        confidence: 0,
        reason: `Verifier error: ${error instanceof Error ? error.message : "Unknown error"}`,
        shouldContinue: true, // Continue on error - let worker try again
        verifiedItems: [],
      },
      tokensUsed,
      costUsd,
      rawOutput,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse the verifier's JSON decision from its output
 */
function parseVerifierDecision(output: string, state: LoopState): VerifierDecision {
  // Try to find JSON block in the output
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : output;

  // Also try to find raw JSON object
  const rawJsonMatch = jsonStr.match(/\{[\s\S]*"complete"[\s\S]*\}/);

  try {
    const parsed = JSON.parse(rawJsonMatch ? rawJsonMatch[0] : jsonStr);

    return {
      complete: Boolean(parsed.complete),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: parsed.reason || "No reason provided",
      shouldContinue: parsed.shouldContinue !== false, // Default to continue
      nextActionHint: parsed.nextActionHint || parsed.nextAction,
      verifiedItems: Array.isArray(parsed.verifiedItems) ? parsed.verifiedItems : [],
      updatedContext: parsed.updatedContext,
    };
  } catch {
    // If parsing fails, try to infer from the text
    return inferDecisionFromText(output, state);
  }
}

/**
 * Infer a decision from unstructured text (fallback)
 */
function inferDecisionFromText(output: string, state: LoopState): VerifierDecision {
  const lowerOutput = output.toLowerCase();

  // Check for completion signals
  const completeSignals = [
    "all items verified",
    "task is complete",
    "all done",
    "definition of done satisfied",
    "everything is working",
    "all tests pass",
  ];

  const incompleteSignals = [
    "not complete",
    "still pending",
    "needs more work",
    "failed",
    "error",
    "missing",
    "incomplete",
  ];

  const isComplete = completeSignals.some(s => lowerOutput.includes(s));
  const isIncomplete = incompleteSignals.some(s => lowerOutput.includes(s));

  // Check for stuck signals
  const stuckSignals = [
    "stuck",
    "cannot proceed",
    "blocked",
    "impossible",
    "no progress",
    "same error",
  ];
  const isStuck = stuckSignals.some(s => lowerOutput.includes(s));

  // Try to find verified items by looking for DoD descriptions marked as done
  const verifiedItems: string[] = [];
  for (const dod of state.definitionOfDone) {
    if (!dod.verified) {
      // Check if the output mentions this item as verified/done
      const itemLower = dod.description.toLowerCase();
      if (
        lowerOutput.includes(`${itemLower}`) &&
        (lowerOutput.includes("verified") ||
          lowerOutput.includes("confirmed") ||
          lowerOutput.includes("done") ||
          lowerOutput.includes("pass"))
      ) {
        verifiedItems.push(dod.id);
      }
    }
  }

  return {
    complete: isComplete && !isIncomplete,
    confidence: isComplete ? 0.7 : isIncomplete ? 0.6 : 0.5,
    reason: isStuck
      ? "Task appears to be stuck"
      : isComplete
        ? "Completion signals detected in output"
        : "Work appears to be in progress",
    shouldContinue: !isComplete && !isStuck,
    verifiedItems,
    updatedContext: extractContextFromOutput(output),
  };
}

/**
 * Extract useful context from verifier output
 */
function extractContextFromOutput(output: string): string {
  // Look for a context section in the output
  const contextMatch = output.match(/(?:context|summary|status)[:\s]*([\s\S]{50,500}?)(?:\n\n|```|$)/i);
  if (contextMatch) {
    return contextMatch[1].trim();
  }

  // Otherwise, take the last meaningful paragraph
  const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 30);
  if (paragraphs.length > 0) {
    return paragraphs[paragraphs.length - 1].trim().slice(0, 500);
  }

  return "";
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK VERIFICATION (Pattern-based, no agent)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick pattern-based check before running full verifier
 * Returns null if unsure, requiring full verifier run
 */
export function quickVerifyCheck(lastOutput: string, state: LoopState): VerifierDecision | null {
  // Only do quick check if we have simple DoD items that can be pattern-matched
  const simpleChecks = state.definitionOfDone.filter(d =>
    d.description.toLowerCase().includes("file") ||
    d.description.toLowerCase().includes("commit") ||
    d.description.toLowerCase().includes("message")
  );

  // If DoD involves tests, deployment, or complex verification, always use full verifier
  const needsFullVerifier = state.definitionOfDone.some(d => {
    const lower = d.description.toLowerCase();
    return (
      lower.includes("test") ||
      lower.includes("deploy") ||
      lower.includes("build") ||
      lower.includes("work") ||
      lower.includes("correct") ||
      lower.includes("verify")
    );
  });

  if (needsFullVerifier) {
    return null; // Use full verifier
  }

  // Simple pattern-based check for very basic DoD
  const allVerified = state.definitionOfDone.every(d => d.verified);
  if (allVerified) {
    return {
      complete: true,
      confidence: 0.9,
      reason: "All Definition of Done items already verified",
      shouldContinue: false,
      verifiedItems: [],
    };
  }

  return null; // Use full verifier for uncertain cases
}
