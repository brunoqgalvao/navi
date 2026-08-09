/**
 * Presentation metadata and label helpers for the run settings menu.
 *
 * Lifted verbatim out of ModelReasoningSelector.svelte before that component was deleted —
 * the chip depends on all of it. The only substantive change is vocabulary: the old
 * `ModelProviderId` used "anthropic" where the rest of the menu says "claude", so everything
 * is now keyed by MenuEntryId.
 *
 * The accent/muted values are complete Tailwind class strings on purpose. There is no
 * safelist in tailwind.config.js, so a colour assembled by interpolation gets purged.
 */
import type { BackendId, ModelInfo, ReasoningEffort } from "../../stores";
import type { MenuEntryId } from "../../stores/run-availability";
import { getAnthropicModelShortLabel } from "../../../../shared/anthropic-models";
import { isZaiModel } from "../../../../shared/zai-models";

export type EntryMeta = {
  backendId: BackendId;
  label: string;
  icon: string;
  accent: string;
  muted: string;
  description: string;
};

export const entryMeta: Record<MenuEntryId, EntryMeta> = {
  claude: {
    backendId: "claude",
    label: "Claude",
    icon: "C",
    accent: "bg-orange-500 text-white",
    muted: "bg-orange-50 text-orange-700 dark:bg-orange-950/45 dark:text-orange-300",
    description: "Careful agent work",
  },
  zai: {
    backendId: "claude",
    label: "Z.ai",
    icon: "Z",
    accent: "bg-fuchsia-600 text-white",
    muted: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/45 dark:text-fuchsia-300",
    description: "GLM coding models",
  },
  codex: {
    backendId: "codex",
    label: "Codex",
    icon: "X",
    accent: "bg-emerald-600 text-white",
    muted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300",
    description: "Deep coding runs",
  },
  gemini: {
    backendId: "gemini",
    label: "Gemini",
    icon: "G",
    accent: "bg-blue-600 text-white",
    muted: "bg-blue-50 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300",
    description: "Long-context passes",
  },
};

export const reasoningOptions: { value: ReasoningEffort; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];

export function reasoningLabel(value: ReasoningEffort): string {
  return reasoningOptions.find((option) => option.value === value)?.label || "Medium";
}

/**
 * Which menu entry a (backend, model) pair belongs to. Claude and Z.ai share the "claude"
 * backend, so the model itself decides between them.
 */
export function resolveEntryForSelection(
  selectedBackend: BackendId,
  model: ModelInfo | null | undefined,
  modelValue: string | null | undefined
): MenuEntryId {
  if (selectedBackend === "codex") return "codex";
  if (selectedBackend === "gemini") return "gemini";
  if (model?.provider === "zai" || isZaiModel(modelValue || model?.value)) return "zai";
  return "claude";
}

export function compactModelLabel(model: ModelInfo | string | null | undefined): string {
  const value = typeof model === "string" ? model : model?.value;
  const displayName = typeof model === "string" ? "" : model?.displayName;
  const anthropicLabel = getAnthropicModelShortLabel(value);

  if (anthropicLabel) return anthropicLabel;
  if (displayName) {
    return displayName
      .replace(/^Claude\s+/, "")
      .replace(/^Gemini\s+/, "Gemini ")
      .replace(/\s+\(Preview\)$/i, " Preview");
  }

  if (!value) return "Model";

  return value
    .replace(/^gpt-/, "GPT-")
    .replace(/^gemini-/, "Gemini ")
    .replace(/^claude-/, "")
    .replace(/-codex$/i, " Codex")
    .replace(/-preview$/i, " Preview")
    .replace(/-/g, " ");
}
