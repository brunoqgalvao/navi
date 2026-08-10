/**
 * Which effort levels each harness supports.
 *
 * Lifted out of ModelReasoningSelector.svelte (isReasoningOptionDisabled,
 * reasoningDisabledTitle, and the clamp inside effectiveReasoningEffort) without changing
 * behaviour. It lives here rather than in the component so the per-harness rules can be
 * asserted — there is no Svelte component test harness in this repo.
 */
import type { BackendId, ReasoningEffort } from "../../stores";

export function isEffortDisabled(backend: BackendId, value: ReasoningEffort): boolean {
  if (backend === "gemini") {
    return value === "xhigh" || value === "max";
  }
  if (backend === "codex") {
    return value === "max";
  }
  return false;
}

export function effortDisabledReason(
  backend: BackendId,
  value: ReasoningEffort
): string | undefined {
  if (!isEffortDisabled(backend, value)) return undefined;
  if (backend === "gemini") return "Gemini supports up to High";
  if (backend === "codex") return "Codex supports up to Extra High";
  return undefined;
}

/** The level actually sent, once the harness's ceiling is applied. */
export function clampEffort(backend: BackendId, value: ReasoningEffort): ReasoningEffort {
  if (backend === "gemini" && (value === "xhigh" || value === "max")) return "high";
  if (backend === "codex" && value === "max") return "xhigh";
  return value;
}
