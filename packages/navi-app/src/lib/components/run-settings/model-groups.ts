/**
 * Which model groups the menu shows, and whether the harness row is offered at all.
 *
 * The load-bearing rule: a group with no models is still shown when its entry is
 * needs-setup. Z.ai has no models precisely when it has no API key, so hiding empty groups
 * would hide the one thing the user needs to see and fix — which is the bug this replaces.
 */
import type { BackendId, ModelInfo } from "../../stores";
import type { EntryAvailability, MenuEntryId } from "../../stores/run-availability";
import { entryMeta, type EntryMeta } from "./entries";
import { isZaiModel } from "../../../../shared/zai-models";

/** The three real backends. Z.ai is a model group inside claude, not a harness. */
export const harnessMeta: Record<BackendId, EntryMeta> = {
  claude: entryMeta.claude,
  codex: entryMeta.codex,
  gemini: entryMeta.gemini,
};

export type ModelGroup = {
  id: MenuEntryId;
  label: string;
  harness: BackendId;
  models: ModelInfo[];
  availability: EntryAvailability;
};

export function shouldShowHarnessRow(canChangeBackend: boolean): boolean {
  return canChangeBackend;
}

export function harnessFooterText(harness: BackendId): string {
  return `${harnessMeta[harness].label} · fixed for this chat`;
}

const isZai = (m: ModelInfo) => m.provider === "zai" || isZaiModel(m.value);

export function modelGroupsFor(
  backendModels: Record<BackendId, ModelInfo[]>,
  currentHarness: BackendId,
  canChangeBackend: boolean,
  availability: Record<MenuEntryId, EntryAvailability>
): ModelGroup[] {
  const harnesses: BackendId[] = canChangeBackend
    ? ["claude", "codex", "gemini"]
    : [currentHarness];

  const groups: ModelGroup[] = [];

  const push = (id: MenuEntryId, harness: BackendId, models: ModelInfo[]) => {
    const entryAvailability = availability[id];
    // Hide only when there is genuinely nothing to say: no models AND no problem.
    if (!models.length && entryAvailability.state === "ready") return;
    groups.push({
      id,
      label: entryMeta[id].label,
      harness,
      models,
      availability: entryAvailability,
    });
  };

  for (const harness of harnesses) {
    const models = backendModels[harness] ?? [];
    if (harness === "claude") {
      push("claude", harness, models.filter((m) => !isZai(m)));
      if (canChangeBackend || currentHarness === "claude") {
        push("zai", harness, models.filter(isZai));
      }
    } else {
      push(harness, harness, models);
    }
  }

  return groups;
}
