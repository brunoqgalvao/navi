import { describe, expect, test } from "bun:test";
import { modelGroupsFor, shouldShowHarnessRow, harnessFooterText } from "./model-groups";
import type { EntryAvailability, MenuEntryId } from "../../stores/run-availability";
import type { ModelInfo } from "../../stores/types";

const ready = { state: "ready" } as const;
const allReady: Record<MenuEntryId, EntryAvailability> = {
  claude: ready,
  codex: ready,
  gemini: ready,
  zai: ready,
};

const models = {
  claude: [
    { value: "claude-fable-5", displayName: "Fable 5", description: "", provider: "anthropic" },
    { value: "glm-5.2", displayName: "GLM-5.2", description: "", provider: "zai" },
  ] as ModelInfo[],
  codex: [{ value: "gpt-5.6-sol", displayName: "GPT-5.6-sol", description: "" }] as ModelInfo[],
  gemini: [] as ModelInfo[],
};

describe("modelGroupsFor", () => {
  test("a switchable chat sees every populated entry", () => {
    expect(modelGroupsFor(models, "claude", true, allReady).map((g) => g.id)).toEqual([
      "claude",
      "zai",
      "codex",
    ]);
  });

  test("zai is a group inside the claude harness, not a harness", () => {
    const zai = modelGroupsFor(models, "claude", true, allReady).find((g) => g.id === "zai")!;
    expect(zai.harness).toBe("claude");
    expect(zai.models.map((m) => m.value)).toEqual(["glm-5.2"]);
  });

  test("a committed chat sees only its own harness", () => {
    expect(modelGroupsFor(models, "codex", false, allReady).map((g) => g.id)).toEqual(["codex"]);
  });

  test("a ready entry with no models emits nothing", () => {
    expect(modelGroupsFor(models, "claude", true, allReady).some((g) => g.id === "gemini")).toBe(
      false
    );
  });

  // The regression this whole change exists to prevent: Z.ai has no models precisely when
  // it has no key, so hiding empty groups would hide the very thing the user must fix.
  test("an unavailable entry still gets a row, even with zero models", () => {
    const availability = {
      ...allReady,
      zai: { state: "needs-setup", reason: "No Z.ai API key", fix: { kind: "settings" } },
    } as Record<MenuEntryId, EntryAvailability>;

    const groups = modelGroupsFor(
      { ...models, claude: [models.claude[0]] },
      "claude",
      true,
      availability
    );
    const zai = groups.find((g) => g.id === "zai");

    expect(zai).toBeDefined();
    expect(zai!.models).toEqual([]);
    expect(zai!.availability).toEqual(availability.zai);
  });

  test("an unavailable gemini is shown with its reason rather than hidden", () => {
    const availability = {
      ...allReady,
      gemini: {
        state: "needs-setup",
        reason: "Gemini CLI not found",
        fix: { kind: "command", command: "npm i -g @google/gemini-cli" },
      },
    } as Record<MenuEntryId, EntryAvailability>;

    expect(modelGroupsFor(models, "claude", true, availability).some((g) => g.id === "gemini")).toBe(
      true
    );
  });

  test("an unavailable entry is hidden when the chat cannot switch to it anyway", () => {
    const availability = {
      ...allReady,
      zai: { state: "needs-setup", reason: "No Z.ai API key", fix: { kind: "settings" } },
    } as Record<MenuEntryId, EntryAvailability>;

    expect(modelGroupsFor(models, "codex", false, availability).map((g) => g.id)).toEqual(["codex"]);
  });

  test("a zai model identified only by its value is still grouped as zai", () => {
    const untagged = {
      ...models,
      claude: [
        { value: "claude-fable-5", displayName: "Fable 5", description: "" },
        { value: "glm-5.2", displayName: "GLM-5.2", description: "" },
      ] as ModelInfo[],
    };
    const groups = modelGroupsFor(untagged, "claude", true, allReady);
    expect(groups.find((g) => g.id === "zai")!.models.map((m) => m.value)).toEqual(["glm-5.2"]);
    expect(groups.find((g) => g.id === "claude")!.models.map((m) => m.value)).toEqual([
      "claude-fable-5",
    ]);
  });
});

describe("shouldShowHarnessRow", () => {
  test("hidden once the chat is committed to a harness", () => {
    expect(shouldShowHarnessRow(false)).toBe(false);
    expect(shouldShowHarnessRow(true)).toBe(true);
  });
});

describe("harnessFooterText", () => {
  test("names the harness the chat is stuck on", () => {
    expect(harnessFooterText("codex")).toBe("Codex · fixed for this chat");
    expect(harnessFooterText("claude")).toBe("Claude · fixed for this chat");
  });
});
