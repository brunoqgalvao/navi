/**
 * Loop Manager - Infinite Loop Mode with Context Reset & Verifier Agent
 *
 * The "Ralph Wiggum" approach:
 * 1. Worker agent executes task
 * 2. At 70% context OR iteration end → verifier agent runs
 * 3. Verifier (full agent) checks if Definition of Done is satisfied
 * 4. If not done → reset context, start fresh session with STATUS.md
 * 5. Loop until done or limits reached
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DefinitionOfDone {
  id: string;
  description: string;
  verified: boolean;
  verifiedAt?: number;
  verifiedBy?: "worker" | "verifier";
}

export interface LoopIteration {
  iteration: number;
  startedAt: number;
  endedAt?: number;
  tokensUsed: number;
  costUsd: number;
  contextResetAfter: boolean;
  outcome: "partial" | "complete" | "error" | "context_overflow";
  summary?: string;
}

export interface LoopState {
  // Identity
  loopId: string;
  sessionId: string;
  projectId: string;

  // Task definition
  originalPrompt: string;
  definitionOfDone: DefinitionOfDone[];

  // Tracking
  iteration: number;
  contextResets: number;
  iterations: LoopIteration[];

  // Limits
  maxIterations: number;      // Default: 100 (effectively infinite)
  maxCost: number;            // Default: $50
  maxDurationMs: number;      // Default: 24 hours
  contextResetThreshold: number; // Default: 0.7 (70%)

  // Totals
  totalCost: number;
  totalTokens: number;
  startedAt: number;

  // Session management
  currentClaudeSessionId?: string;

  // Status
  status: "running" | "paused" | "completed" | "failed" | "stopped";
  statusReason?: string;

  // Model config
  workerModel?: string;
  verifierModel: "haiku" | "sonnet";

  // Context for handoff
  lastContext?: string;       // Summary for next iteration
}

export interface VerifierDecision {
  complete: boolean;
  confidence: number;         // 0.0 - 1.0
  reason: string;
  shouldContinue: boolean;
  nextActionHint?: string;
  verifiedItems: string[];    // DoD item IDs that are now verified
  updatedContext?: string;    // Context summary for next iteration
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const LOOPS_DIR = join(homedir(), ".claude-code-ui", "loops");

// Ensure loops directory exists
if (!existsSync(LOOPS_DIR)) {
  mkdirSync(LOOPS_DIR, { recursive: true });
}

// In-memory cache of active loops
const activeLoops = new Map<string, LoopState>();

/**
 * Get the file path for a loop's persistent state
 */
function getLoopFilePath(loopId: string): string {
  return join(LOOPS_DIR, `${loopId}.json`);
}

/**
 * Get the file path for a loop's STATUS.md
 */
function getStatusFilePath(loopId: string): string {
  return join(LOOPS_DIR, `${loopId}-status.md`);
}

/**
 * Save loop state to disk
 */
function persistLoop(state: LoopState): void {
  const filePath = getLoopFilePath(state.loopId);
  writeFileSync(filePath, JSON.stringify(state, null, 2));

  // Also update STATUS.md
  const statusMd = generateStatusMd(state);
  writeFileSync(getStatusFilePath(state.loopId), statusMd);
}

/**
 * Load loop state from disk
 */
function loadLoop(loopId: string): LoopState | null {
  const filePath = getLoopFilePath(loopId);
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as LoopState;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS.MD GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate STATUS.md content from loop state
 */
export function generateStatusMd(state: LoopState): string {
  const dodChecklist = state.definitionOfDone
    .map(d => `- [${d.verified ? "x" : " "}] ${d.description}`)
    .join("\n");

  const completedTasks = state.iterations
    .filter(i => i.outcome === "complete" || i.summary)
    .map(i => `- [x] Iteration ${i.iteration}: ${i.summary || "Completed"}`)
    .join("\n") || "- (none yet)";

  const iterationsTable = state.iterations
    .map(i => `| ${i.iteration} | ${i.tokensUsed.toLocaleString()} | $${i.costUsd.toFixed(4)} | ${Math.round((i.endedAt || Date.now()) - i.startedAt) / 1000}s | ${i.outcome} |`)
    .join("\n");

  const elapsedMs = Date.now() - state.startedAt;
  const elapsedStr = formatDuration(elapsedMs);

  return `# Loop Strategy: ${state.loopId}
Created: ${new Date(state.startedAt).toISOString()}
Loop ID: ${state.loopId}
Session ID: ${state.sessionId}

## 🎯 Definition of Done
${dodChecklist}

## 📊 Current Status
**Status:** ${state.status}${state.statusReason ? ` (${state.statusReason})` : ""}
**Iteration:** ${state.iteration} of ${state.maxIterations === 100 ? "∞" : state.maxIterations}
**Context Resets:** ${state.contextResets}
**Elapsed:** ${elapsedStr}
**Total Cost:** $${state.totalCost.toFixed(4)} / $${state.maxCost.toFixed(2)} limit

## ✅ Completed Work
${completedTasks}

## 🧠 Context for Next Iteration
${state.lastContext || "(No context saved yet - first iteration)"}

## 📈 Iteration History
| Iteration | Tokens | Cost | Duration | Outcome |
|-----------|--------|------|----------|---------|
${iterationsTable || "| (none) | - | - | - | - |"}

## 🛑 Stop Conditions
- Max iterations: ${state.maxIterations === 100 ? "∞ (unlimited)" : state.maxIterations}
- Max cost: $${state.maxCost.toFixed(2)}
- Max duration: ${formatDuration(state.maxDurationMs)}
- Context reset threshold: ${Math.round(state.contextResetThreshold * 100)}%
`;
}

/**
 * Parse STATUS.md to extract context (for verifier or handoff)
 */
export function parseStatusMd(content: string): {
  definitionOfDone: { description: string; verified: boolean }[];
  lastContext: string;
  iteration: number;
} {
  const dodMatch = content.match(/## 🎯 Definition of Done\n([\s\S]*?)(?=\n##|$)/);
  const contextMatch = content.match(/## 🧠 Context for Next Iteration\n([\s\S]*?)(?=\n##|$)/);
  const iterationMatch = content.match(/\*\*Iteration:\*\* (\d+)/);

  const definitionOfDone: { description: string; verified: boolean }[] = [];
  if (dodMatch) {
    const lines = dodMatch[1].trim().split("\n");
    for (const line of lines) {
      const match = line.match(/- \[([ x])\] (.+)/);
      if (match) {
        definitionOfDone.push({
          description: match[2],
          verified: match[1] === "x",
        });
      }
    }
  }

  return {
    definitionOfDone,
    lastContext: contextMatch ? contextMatch[1].trim() : "",
    iteration: iterationMatch ? parseInt(iterationMatch[1]) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOOP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new infinite loop
 */
export function createLoop(config: {
  sessionId: string;
  projectId: string;
  originalPrompt: string;
  definitionOfDone: string[];
  workerModel?: string;
  verifierModel?: "haiku" | "sonnet";
  maxIterations?: number;
  maxCost?: number;
  maxDurationMs?: number;
  contextResetThreshold?: number;
}): LoopState {
  const loopId = `loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const state: LoopState = {
    loopId,
    sessionId: config.sessionId,
    projectId: config.projectId,
    originalPrompt: config.originalPrompt,
    definitionOfDone: config.definitionOfDone.map((desc, i) => ({
      id: `dod-${i}`,
      description: desc,
      verified: false,
    })),
    iteration: 0,
    contextResets: 0,
    iterations: [],
    maxIterations: config.maxIterations ?? 100,
    maxCost: config.maxCost ?? 50,
    maxDurationMs: config.maxDurationMs ?? 24 * 60 * 60 * 1000, // 24 hours
    contextResetThreshold: config.contextResetThreshold ?? 0.7,
    totalCost: 0,
    totalTokens: 0,
    startedAt: Date.now(),
    status: "running",
    workerModel: config.workerModel,
    verifierModel: config.verifierModel ?? "haiku",
  };

  activeLoops.set(loopId, state);
  persistLoop(state);

  return state;
}

/**
 * Get loop by ID (from memory or disk)
 */
export function getLoop(loopId: string): LoopState | null {
  // Check memory first
  if (activeLoops.has(loopId)) {
    return activeLoops.get(loopId)!;
  }

  // Try loading from disk
  const loaded = loadLoop(loopId);
  if (loaded) {
    activeLoops.set(loopId, loaded);
  }
  return loaded;
}

/**
 * Get loop by session ID
 */
export function getLoopBySession(sessionId: string): LoopState | null {
  for (const loop of Array.from(activeLoops.values())) {
    if (loop.sessionId === sessionId) {
      return loop;
    }
  }
  return null;
}

/**
 * Start a new iteration
 */
export function startIteration(loopId: string): LoopIteration | null {
  const state = getLoop(loopId);
  if (!state || state.status !== "running") return null;

  state.iteration++;

  const iteration: LoopIteration = {
    iteration: state.iteration,
    startedAt: Date.now(),
    tokensUsed: 0,
    costUsd: 0,
    contextResetAfter: false,
    outcome: "partial",
  };

  state.iterations.push(iteration);
  persistLoop(state);

  return iteration;
}

/**
 * End current iteration and record results
 */
export function endIteration(
  loopId: string,
  result: {
    tokensUsed: number;
    costUsd: number;
    outcome: LoopIteration["outcome"];
    summary?: string;
    contextResetAfter?: boolean;
  }
): void {
  const state = getLoop(loopId);
  if (!state) return;

  const currentIteration = state.iterations[state.iterations.length - 1];
  if (!currentIteration) return;

  currentIteration.endedAt = Date.now();
  currentIteration.tokensUsed = result.tokensUsed;
  currentIteration.costUsd = result.costUsd;
  currentIteration.outcome = result.outcome;
  currentIteration.summary = result.summary;
  currentIteration.contextResetAfter = result.contextResetAfter ?? false;

  state.totalCost += result.costUsd;
  state.totalTokens += result.tokensUsed;

  if (result.contextResetAfter) {
    state.contextResets++;
  }

  persistLoop(state);
}

/**
 * Update loop context (for handoff to next iteration)
 */
export function updateLoopContext(loopId: string, context: string): void {
  const state = getLoop(loopId);
  if (!state) return;

  state.lastContext = context;
  persistLoop(state);
}

/**
 * Mark DoD items as verified
 */
export function verifyDodItems(loopId: string, itemIds: string[], verifiedBy: "worker" | "verifier"): void {
  const state = getLoop(loopId);
  if (!state) return;

  for (const item of state.definitionOfDone) {
    if (itemIds.includes(item.id)) {
      item.verified = true;
      item.verifiedAt = Date.now();
      item.verifiedBy = verifiedBy;
    }
  }

  persistLoop(state);
}

/**
 * Check if all DoD items are verified
 */
export function isLoopComplete(loopId: string): boolean {
  const state = getLoop(loopId);
  if (!state) return false;

  return state.definitionOfDone.every(d => d.verified);
}

/**
 * Check if loop should stop (limits reached)
 */
export function shouldStopLoop(loopId: string): { stop: boolean; reason?: string } {
  const state = getLoop(loopId);
  if (!state) return { stop: true, reason: "Loop not found" };

  if (state.status !== "running") {
    return { stop: true, reason: `Loop is ${state.status}` };
  }

  if (state.iteration >= state.maxIterations) {
    return { stop: true, reason: `Max iterations (${state.maxIterations}) reached` };
  }

  if (state.totalCost >= state.maxCost) {
    return { stop: true, reason: `Max cost ($${state.maxCost}) reached` };
  }

  const elapsed = Date.now() - state.startedAt;
  if (elapsed >= state.maxDurationMs) {
    return { stop: true, reason: `Max duration (${formatDuration(state.maxDurationMs)}) reached` };
  }

  return { stop: false };
}

/**
 * Check if context reset is needed based on token usage
 */
export function shouldResetContext(
  loopId: string,
  currentTokens: number,
  contextWindow: number
): boolean {
  const state = getLoop(loopId);
  if (!state) return false;

  const usagePercent = currentTokens / contextWindow;
  return usagePercent >= state.contextResetThreshold;
}

/**
 * Update Claude session ID (after context reset creates new session)
 */
export function updateClaudeSession(loopId: string, claudeSessionId: string): void {
  const state = getLoop(loopId);
  if (!state) return;

  state.currentClaudeSessionId = claudeSessionId;
  persistLoop(state);
}

/**
 * Complete the loop
 */
export function completeLoop(loopId: string, reason: string): void {
  const state = getLoop(loopId);
  if (!state) return;

  state.status = "completed";
  state.statusReason = reason;
  persistLoop(state);
}

/**
 * Fail the loop
 */
export function failLoop(loopId: string, reason: string): void {
  const state = getLoop(loopId);
  if (!state) return;

  state.status = "failed";
  state.statusReason = reason;
  persistLoop(state);
}

/**
 * Stop the loop (user requested)
 */
export function stopLoop(loopId: string): void {
  const state = getLoop(loopId);
  if (!state) return;

  state.status = "stopped";
  state.statusReason = "User requested stop";
  persistLoop(state);
}

/**
 * Pause the loop
 */
export function pauseLoop(loopId: string): void {
  const state = getLoop(loopId);
  if (!state) return;

  state.status = "paused";
  persistLoop(state);
}

/**
 * Resume a paused loop
 */
export function resumeLoop(loopId: string): void {
  const state = getLoop(loopId);
  if (!state || state.status !== "paused") return;

  state.status = "running";
  state.statusReason = undefined;
  persistLoop(state);
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFIER PROMPT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate the verifier agent prompt
 */
export function generateVerifierPrompt(state: LoopState): string {
  const statusMd = generateStatusMd(state);
  const dodList = state.definitionOfDone
    .map((d, i) => `${i + 1}. [${d.verified ? "VERIFIED ✅" : "PENDING ⏳"}] (dod-${i}) ${d.description}`)
    .join("\n");

  // Get last iteration info for context
  const lastIter = state.iterations[state.iterations.length - 1];
  const lastIterInfo = lastIter
    ? `Iteration ${lastIter.iteration}: ${lastIter.outcome} (${lastIter.tokensUsed.toLocaleString()} tokens, $${lastIter.costUsd.toFixed(4)})`
    : "First iteration";

  return `You are a **Verifier Agent**. Your job: determine if the task is ACTUALLY done by running real verification.

## 🎯 The Original Task
${state.originalPrompt}

## ✅ Definition of Done (Checklist)
${dodList}

## 📊 Current Progress
- **Iteration:** ${state.iteration} (${state.contextResets} context resets)
- **Total Cost:** $${state.totalCost.toFixed(4)}
- **Last Iteration:** ${lastIterInfo}

## 🧠 Previous Context
${state.lastContext || "(No context from previous iterations)"}

## 📋 Full STATUS.md
\`\`\`markdown
${statusMd}
\`\`\`

---

## 🔍 Your Verification Mission

### Step 1: Actually Verify Each PENDING Item
Don't trust what the worker said. Run real verification:

| DoD Type | How to Verify |
|----------|---------------|
| "tests pass" | Run \`npm test\`, \`pytest\`, \`bun test\` - check exit code |
| "builds successfully" | Run \`npm run build\`, \`bun build\` - check for errors |
| "file exists/created" | Use Read tool to read the file |
| "deployed" | \`curl\` the endpoint or use WebFetch |
| "no errors" | Run the build, grep logs for errors |
| "works correctly" | Actually test the functionality |
| "code quality" | Run linter, check for obvious issues |

### Step 2: Decide What Happens Next
- **COMPLETE**: All DoD items verified → stop the loop
- **CONTINUE**: Work remains → provide next action hint
- **STUCK**: No progress possible → stop and escalate

### Step 3: Pass Context to Next Iteration
The \`updatedContext\` field is **CRITICAL**. Include:
- Files that were modified
- Errors encountered and their solutions
- Key decisions made
- What specifically needs to happen next
- Any blockers or dependencies

---

## 📤 Your Response (JSON Required)

\`\`\`json
{
  "complete": false,
  "confidence": 0.85,
  "reason": "2 of 3 DoD items verified. Tests pass but deployment not confirmed.",
  "shouldContinue": true,
  "nextActionHint": "Deploy to staging and verify the /api/health endpoint returns 200",
  "verifiedItems": ["dod-0", "dod-1"],
  "updatedContext": "Tests pass (42 passing, 0 failing). Build succeeds. Files changed: src/api.ts, src/utils.ts. Still need to deploy - last attempt failed with 'missing env var DATABASE_URL'. Worker should set env var and redeploy."
}
\`\`\`

### Field Explanations
| Field | Type | Description |
|-------|------|-------------|
| \`complete\` | boolean | ALL DoD items verified? |
| \`confidence\` | 0.0-1.0 | How sure are you? |
| \`reason\` | string | Why this decision? |
| \`shouldContinue\` | boolean | false if complete OR stuck |
| \`nextActionHint\` | string | Specific next step for worker |
| \`verifiedItems\` | string[] | DoD IDs you verified (e.g., ["dod-0", "dod-2"]) |
| \`updatedContext\` | string | **IMPORTANT**: Context for next iteration |

**Remember**: Be skeptical. Verify everything. Pass good context.
`;
}

/**
 * Generate the handoff prompt for a fresh session after context reset
 */
export function generateHandoffPrompt(state: LoopState): string {
  const statusMd = generateStatusMd(state);

  // Build DoD checklist with clearer formatting
  const dodChecklist = state.definitionOfDone
    .map((d, i) => `${i + 1}. [${d.verified ? "x" : " "}] ${d.description}${d.verified ? " ✅" : " ⏳"}`)
    .join("\n");

  // Get pending items specifically
  const pendingItems = state.definitionOfDone
    .filter(d => !d.verified)
    .map(d => `- ${d.description}`)
    .join("\n") || "(All items verified!)";

  return `# 🔄 Context Handoff - Iteration ${state.iteration + 1}

You are continuing a **long-running task** after a context reset. Your memory was cleared, but the progress was preserved below.

## 🎯 Original Mission
${state.originalPrompt}

## ✅ Definition of Done (Current Status)
${dodChecklist}

## ⏳ What Still Needs To Be Done
${pendingItems}

---

## 🧠 CRITICAL CONTEXT FROM VERIFIER
**Read this carefully - it's your memory from before the reset:**

${state.lastContext || "(No context provided - check STATUS.md for progress history)"}

---

## 📋 Full Progress History (STATUS.md)
\`\`\`markdown
${statusMd}
\`\`\`

---

## 📌 Instructions

1. **DO NOT start from scratch** - significant work has already been done
2. **Read the context above** - it tells you exactly where things left off
3. **Focus on PENDING items** - items marked with ✅ are already verified
4. **Use the tools** to verify your work (run tests, check files, etc.)
5. **Before finishing**, write a summary of what you did for the next iteration

## ⚠️ Important Reminders
- The context reset happened because we hit 70% of the context window
- Your work is being automatically verified after each iteration
- If you're stuck, explain why so the verifier can help

**Now continue the task from where the last iteration left off.**
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * List all loops (active and persisted)
 */
export function listLoops(): LoopState[] {
  // This is a simple implementation - could be optimized with an index
  const loops: LoopState[] = Array.from(activeLoops.values());
  return loops.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Clean up old completed/failed loops (older than 7 days)
 */
export function cleanupOldLoops(): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const [loopId, loop] of Array.from(activeLoops.entries())) {
    if (
      (loop.status === "completed" || loop.status === "failed" || loop.status === "stopped") &&
      loop.startedAt < cutoff
    ) {
      activeLoops.delete(loopId);
      // Note: We don't delete the files - they serve as history
    }
  }
}
