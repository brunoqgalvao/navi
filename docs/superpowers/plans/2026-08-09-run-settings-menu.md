# Run Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the composer's two-pane model picker with Codex-style rows (Harness / Model / Effort), show why a harness is unusable with a route to fixing it, and add a Codex card to Settings.

**Architecture:** Every decision the menu makes moves into pure modules under `src/lib/components/run-settings/` and `src/lib/stores/run-availability.ts`, so it can be unit-tested with `bun test` — there is no Svelte component test harness in this repo and this plan does not add one. `RunSettingsMenu.svelte` becomes presentation over those functions. The old `ModelReasoningSelector.svelte` and two long-dead siblings are deleted, but four helpers inside it are load-bearing and get rehomed first. Settings gains a `ProviderCard` frame that all four provider cards share.

**Tech Stack:** Svelte 5 (runes, snippets), TypeScript, Tailwind, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-09-run-settings-menu-design.md`

**Paths:** relative to repo root. Note `bun run sandbox` is a **root** script; `bun test` and
`bun run check` are in `packages/navi-app`. Every Run line below states its own directory.

**Branch:** `feat/run-settings-menu` (already created; the spec is committed on it).

---

## The one thing that will bite you

An entry that is `needs-setup` **must still render a row**. The bug this whole change exists to
fix is that Z.ai vanishes when it has no key — `getConfiguredZaiModels()` returns `[]`
(`server/routes/config.ts:18-21`), so there are no Z.ai models to build a group from. If model
grouping only emits groups that have models, the carefully-derived
`{ reason: "No Z.ai API key" }` has no surface to appear on and the bug survives the rewrite.
That is why `modelGroupsFor` takes availability as an input and emits empty groups for
known-but-unavailable entries. Task 3's tests pin this.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/stores/run-availability.ts` **(create)** | `deriveRunAvailability()` + types + the lazy store |
| `src/lib/components/run-settings/entries.ts` **(create)** | `providerMeta` (rehomed), `resolveEntryForSelection`, `compactModelLabel`, `reasoningLabel` |
| `src/lib/components/run-settings/model-groups.ts` **(create)** | `modelGroupsFor`, `shouldShowHarnessRow`, `harnessFooterText`, `harnessMeta` |
| `src/lib/components/run-settings/effort.ts` **(create)** | `isEffortDisabled`, `effortDisabledReason`, `clampEffort` (rehomed) |
| `src/lib/components/run-settings/MenuRow.svelte` **(create)** | One row + its submenu, keyboard and edge behaviour |
| `src/lib/components/run-settings/RunSettingsMenu.svelte` **(create)** | Chip + rows |
| `src/lib/components/settings/ProviderCard.svelte` **(create)** | Card frame with `body`/`footer` snippets |
| `src/lib/components/ModelReasoningSelector.svelte` **(delete)** | Replaced (helpers rehomed in Task 2 first) |
| `src/lib/components/BackendSelector.svelte` **(delete)** | Dead, zero references |
| `src/lib/components/ModelSelector.svelte` **(delete)** | Dead, zero references |
| `src/lib/components/ChatInput.svelte` **(modify)** | Swap component, add `onOpenProviderSettings` |
| `src/App.svelte` **(modify)** | `onBackendChange` branch, supply `onOpenProviderSettings`, reload models on the auth event |
| `src/lib/components/Settings.svelte` **(modify)** | Port 3 cards, add Codex card, rename + dispatch event |
| `src/lib/components/Onboarding.svelte` **(modify)** | Rename the event it dispatches |
| `src/lib/components/ClaudeAuthBadge.svelte` **(modify)** | Rename the event it listens for |

---

## Chunk 1: Pure logic

### Task 1: `deriveRunAvailability`

**Files:**
- Create: `packages/navi-app/src/lib/stores/run-availability.ts`
- Test: `packages/navi-app/src/lib/stores/run-availability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { deriveRunAvailability, type ProviderAuthStatus } from "./run-availability";
import type { BackendInfo, CodexHealthInfo } from "../api";

const backend = (id: "claude" | "codex" | "gemini", installed: boolean): BackendInfo => ({
  id, name: id, description: "", installed,
});
const auth = (over: Partial<ProviderAuthStatus> = {}): ProviderAuthStatus => ({
  claudeInstalled: true, claudePath: "", authenticated: true, authMethod: "oauth",
  hasApiKey: false, apiKeyPreview: null, hasOAuth: true, preferredAuth: "oauth",
  hasZaiKey: true, zaiKeyPreview: null, zaiKeySource: "settings", ...over,
});
const codex = (over: Partial<CodexHealthInfo> = {}): CodexHealthInfo => ({
  backend: "codex", installed: true, authMode: "chatgpt",
  config: {}, issues: [], checkedAt: "", ...over,
});
const all = [backend("claude", true), backend("codex", true), backend("gemini", true)];

describe("deriveRunAvailability", () => {
  test("everything ready when installed and signed in", () => {
    const a = deriveRunAvailability(all, codex(), auth());
    expect([a.claude.state, a.codex.state, a.gemini.state, a.zai.state])
      .toEqual(["ready", "ready", "ready", "ready"]);
  });

  // One case per mapping-table row. Each asserts the exact reason AND the exact fix,
  // because rendering the wrong affordance is the failure mode that matters.
  test("claude CLI missing", () => {
    const a = deriveRunAvailability(
      [backend("claude", false), backend("codex", true), backend("gemini", true)],
      codex(), auth());
    expect(a.claude).toEqual({
      state: "needs-setup", reason: "Claude CLI not found",
      fix: { kind: "command", command: "npm i -g @anthropic-ai/claude-code" },
    });
  });

  test("claude installed but signed out", () => {
    const a = deriveRunAvailability(all, codex(), auth({ hasOAuth: false, hasApiKey: false }));
    expect(a.claude).toEqual({
      state: "needs-setup", reason: "Not signed in", fix: { kind: "settings" },
    });
  });

  test("codex CLI missing beats an unreadable auth mode", () => {
    const a = deriveRunAvailability(
      [backend("claude", true), backend("codex", false), backend("gemini", true)],
      codex({ installed: false, authMode: "unknown" }), auth());
    expect(a.codex).toEqual({
      state: "needs-setup", reason: "Codex CLI not found",
      fix: { kind: "command", command: "npm i -g @openai/codex" },
    });
  });

  test("codex not logged in", () => {
    const a = deriveRunAvailability(all, codex({ authMode: "not_logged_in" }), auth());
    expect(a.codex).toEqual({
      state: "needs-setup", reason: "Not signed in", fix: { kind: "settings" },
    });
  });

  test("codex auth mode unreadable is not treated as ready", () => {
    const a = deriveRunAvailability(all, codex({ authMode: "unknown" }), auth());
    expect(a.codex).toEqual({
      state: "needs-setup", reason: "Couldn't read sign-in state", fix: { kind: "settings" },
    });
  });

  test("api_key counts as signed in", () => {
    expect(deriveRunAvailability(all, codex({ authMode: "api_key" }), auth()).codex.state)
      .toBe("ready");
  });

  test("gemini CLI missing", () => {
    const a = deriveRunAvailability(
      [backend("claude", true), backend("codex", true), backend("gemini", false)],
      codex(), auth());
    expect(a.gemini).toEqual({
      state: "needs-setup", reason: "Gemini CLI not found",
      fix: { kind: "command", command: "npm i -g @google/gemini-cli" },
    });
  });

  test("no zai key", () => {
    const a = deriveRunAvailability(all, codex(), auth({ hasZaiKey: false }));
    expect(a.zai).toEqual({
      state: "needs-setup", reason: "No Z.ai API key", fix: { kind: "settings" },
    });
  });

  test("zai inherits claude's reason and fix verbatim, not just its state", () => {
    const a = deriveRunAvailability(
      [backend("claude", false), backend("codex", true), backend("gemini", true)],
      codex(), auth({ hasZaiKey: true }));
    // Asserted by value, not by reference: a.zai === a.claude would pass even if the
    // implementation returned the wrong object.
    expect(a.zai).toEqual({
      state: "needs-setup", reason: "Claude CLI not found",
      fix: { kind: "command", command: "npm i -g @anthropic-ai/claude-code" },
    });
  });

  test("a missing codex health payload does not crash", () => {
    expect(deriveRunAvailability(all, null, auth()).codex.state).toBe("needs-setup");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd packages/navi-app && bun test src/lib/stores/run-availability.test.ts`
Expected: FAIL — `Cannot find module './run-availability'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/stores/run-availability.ts
import type { BackendId } from "./session";
import type { BackendInfo, CodexHealthInfo } from "../api";

export type ProviderAuthStatus = Awaited<ReturnType<typeof import("../api").api.auth.status>>;

/** What the menu can offer: three harnesses, plus Z.ai as a model group. */
export type MenuEntryId = BackendId | "zai";
export type AvailabilityFix = { kind: "settings" } | { kind: "command"; command: string };
export type EntryAvailability =
  | { state: "ready" }
  | { state: "needs-setup"; reason: string; fix: AvailabilityFix };

const READY: EntryAvailability = { state: "ready" };

const INSTALL_COMMAND: Record<BackendId, string> = {
  claude: "npm i -g @anthropic-ai/claude-code",
  codex: "npm i -g @openai/codex",
  gemini: "npm i -g @google/gemini-cli",
};

const notFound = (id: BackendId, label: string): EntryAvailability => ({
  state: "needs-setup",
  reason: `${label} CLI not found`,
  fix: { kind: "command", command: INSTALL_COMMAND[id] },
});

const needsSettings = (reason: string): EntryAvailability => ({
  state: "needs-setup", reason, fix: { kind: "settings" },
});

export function deriveRunAvailability(
  backends: BackendInfo[],
  codexHealth: CodexHealthInfo | null,
  auth: ProviderAuthStatus,
): Record<MenuEntryId, EntryAvailability> {
  const installed = (id: BackendId) => backends.find((b) => b.id === id)?.installed ?? false;

  const claude = !installed("claude")
    ? notFound("claude", "Claude")
    : !auth.hasOAuth && !auth.hasApiKey
      ? needsSettings("Not signed in")
      : READY;

  // The installed guard matters: with no path, detectCodexAuthMode returns "unknown"
  // (server/routes/backends.ts:70), so an uninstalled Codex would otherwise report the
  // wrong reason with the wrong fix.
  const codex = !installed("codex")
    ? notFound("codex", "Codex")
    : codexHealth?.authMode === "not_logged_in"
      ? needsSettings("Not signed in")
      : codexHealth == null || codexHealth.authMode === "unknown"
        ? needsSettings("Couldn't read sign-in state")
        : READY;

  const gemini = !installed("gemini") ? notFound("gemini", "Gemini") : READY;

  // Z.ai models run on the Claude runtime; a key without a usable Claude is not runnable.
  const zai = claude.state !== "ready"
    ? claude
    : !auth.hasZaiKey
      ? needsSettings("No Z.ai API key")
      : READY;

  return { claude, codex, gemini, zai };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/navi-app && bun test src/lib/stores/run-availability.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/navi-app/src/lib/stores/run-availability.ts packages/navi-app/src/lib/stores/run-availability.test.ts
git commit -m "Derive why each harness is unusable, with the fix that matches it"
```

### Task 2: Rehome the chip helpers before deleting their file

**Files:**
- Create: `packages/navi-app/src/lib/components/run-settings/entries.ts`
- Test: `packages/navi-app/src/lib/components/run-settings/entries.test.ts`

Four helpers inside `ModelReasoningSelector.svelte` are load-bearing for the chip and die with
the file: `providerMeta` (`:39-72`), `resolveProviderForSelection` (`:129-138`),
`compactModelLabel` (`:105-127`) and `reasoningLabel` (`:155-157`). Move them out first, keyed
by `MenuEntryId` rather than the old `ModelProviderId` so the whole menu speaks one vocabulary
(`anthropic` becomes `claude`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { entryMeta, resolveEntryForSelection, compactModelLabel, reasoningLabel } from "./entries";

describe("resolveEntryForSelection", () => {
  test("codex and gemini follow the backend", () => {
    expect(resolveEntryForSelection("codex", null, "gpt-5.6-sol")).toBe("codex");
    expect(resolveEntryForSelection("gemini", null, "gemini-3-pro")).toBe("gemini");
  });
  test("a zai model on the claude backend resolves to zai", () => {
    expect(resolveEntryForSelection("claude", { provider: "zai" } as any, "glm-5.2")).toBe("zai");
  });
  test("a zai model identified only by its value still resolves to zai", () => {
    expect(resolveEntryForSelection("claude", null, "glm-5.2")).toBe("zai");
  });
  test("anything else on the claude backend is claude", () => {
    expect(resolveEntryForSelection("claude", null, "claude-fable-5")).toBe("claude");
  });
});

describe("compactModelLabel", () => {
  test("uses the curated short label when there is one", () => {
    expect(compactModelLabel("claude-fable-5")).toBe("Fable 5");
  });
  test("prettifies a raw gpt slug", () => {
    expect(compactModelLabel("gpt-5.6-sol")).toBe("GPT-5.6 sol");
  });
  test("falls back to Model when there is nothing", () => {
    expect(compactModelLabel(null)).toBe("Model");
  });
});

describe("entryMeta", () => {
  test("covers every menu entry", () => {
    expect(Object.keys(entryMeta).sort()).toEqual(["claude", "codex", "gemini", "zai"]);
  });
  // Tailwind purges anything it cannot see as a literal, and there is no safelist in
  // tailwind.config.js — so these must be complete class strings, never interpolated fragments.
  test("accents are complete class strings", () => {
    for (const meta of Object.values(entryMeta)) {
      expect(meta.accent).toMatch(/^bg-\S+ text-\S+$/);
      expect(meta.muted).toContain("dark:");
    }
  });
});

describe("reasoningLabel", () => {
  test("maps each effort to its label", () => {
    expect(reasoningLabel("xhigh")).toBe("Extra High");
    expect(reasoningLabel("medium")).toBe("Medium");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd packages/navi-app && bun test src/lib/components/run-settings/entries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement by copying, not rewriting**

Copy the four helpers out of `ModelReasoningSelector.svelte` verbatim, changing only:
- the `anthropic` key becomes `claude`, and the type becomes `Record<MenuEntryId, …>`
- `resolveProviderForSelection` becomes `resolveEntryForSelection` returning `MenuEntryId`
- keep `isZaiModel(...)` in the zai branch (`:137`) — dropping it would silently narrow
  detection to the `provider` tag alone
- **keep the class strings exactly as they are** (`:44-45`, `:52-53`, `:60-61`, `:68-69`):
  `bg-orange-500 text-white`, `bg-fuchsia-600 text-white`, `bg-emerald-600 text-white`,
  `bg-blue-600 text-white` and their `muted` partners. Do not "tidy" orange→amber or
  blue→indigo; the chip must look identical after this change.

Also export `reasoningOptions` (`:74-80`) since `reasoningLabel` reads it.

- [ ] **Step 4: Run the tests**

Run: `cd packages/navi-app && bun test src/lib/components/run-settings/entries.test.ts`
Expected: PASS, 10 tests. If `compactModelLabel("gpt-5.6-sol")` disagrees, fix the *test* to
match the copied implementation — this task must not change behaviour.

- [ ] **Step 5: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/
git commit -m "Rehome the chip helpers out of the component about to be deleted"
```

### Task 3: Model grouping, with unavailable entries kept visible

**Files:**
- Create: `packages/navi-app/src/lib/components/run-settings/model-groups.ts`
- Test: `packages/navi-app/src/lib/components/run-settings/model-groups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { modelGroupsFor, shouldShowHarnessRow, harnessFooterText } from "./model-groups";
import type { EntryAvailability, MenuEntryId } from "../../stores/run-availability";
import type { ModelInfo } from "../../stores/types";

const ready = { state: "ready" } as const;
const allReady: Record<MenuEntryId, EntryAvailability> =
  { claude: ready, codex: ready, gemini: ready, zai: ready };

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
    expect(modelGroupsFor(models, "claude", true, allReady).map((g) => g.id))
      .toEqual(["claude", "zai", "codex"]);
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
    expect(modelGroupsFor(models, "claude", true, allReady).some((g) => g.id === "gemini"))
      .toBe(false);
  });

  // The regression this whole change exists to prevent.
  test("an unavailable entry still gets a row, even with zero models", () => {
    const availability = {
      ...allReady,
      zai: { state: "needs-setup", reason: "No Z.ai API key", fix: { kind: "settings" } },
    } as Record<MenuEntryId, EntryAvailability>;
    const groups = modelGroupsFor(
      { ...models, claude: [models.claude[0]] }, "claude", true, availability);
    const zai = groups.find((g) => g.id === "zai");
    expect(zai).toBeDefined();
    expect(zai!.models).toEqual([]);
    expect(zai!.availability).toEqual(availability.zai);
  });

  test("an unavailable gemini is shown with its reason rather than hidden", () => {
    const availability = {
      ...allReady,
      gemini: {
        state: "needs-setup", reason: "Gemini CLI not found",
        fix: { kind: "command", command: "npm i -g @google/gemini-cli" },
      },
    } as Record<MenuEntryId, EntryAvailability>;
    expect(modelGroupsFor(models, "claude", true, availability).some((g) => g.id === "gemini"))
      .toBe(true);
  });

  test("an unavailable entry is hidden when the chat cannot switch to it anyway", () => {
    const availability = {
      ...allReady,
      zai: { state: "needs-setup", reason: "No Z.ai API key", fix: { kind: "settings" } },
    } as Record<MenuEntryId, EntryAvailability>;
    expect(modelGroupsFor(models, "codex", false, availability).map((g) => g.id))
      .toEqual(["codex"]);
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd packages/navi-app && bun test src/lib/components/run-settings/model-groups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/components/run-settings/model-groups.ts
import type { BackendId, ModelInfo } from "../../stores";
import type { EntryAvailability, MenuEntryId } from "../../stores/run-availability";
import { entryMeta } from "./entries";
import { isZaiModel } from "../../../shared/zai-models";

export const harnessMeta: Record<BackendId, { label: string; icon: string; accent: string; muted: string; description: string }> = {
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
  availability: Record<MenuEntryId, EntryAvailability>,
): ModelGroup[] {
  const harnesses: BackendId[] = canChangeBackend
    ? ["claude", "codex", "gemini"]
    : [currentHarness];

  const groups: ModelGroup[] = [];

  // An entry with no models is still shown when it is needs-setup — that is the whole
  // point: a hidden entry is a bug the user cannot see, let alone fix. Only when the chat
  // cannot switch to it anyway is hiding correct.
  const push = (id: MenuEntryId, harness: BackendId, models: ModelInfo[]) => {
    const entryAvailability = availability[id];
    if (!models.length && entryAvailability.state === "ready") return;
    groups.push({ id, label: entryMeta[id].label, harness, models, availability: entryAvailability });
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
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/navi-app && bun test src/lib/components/run-settings/model-groups.test.ts`
Expected: PASS, 9 tests. In particular "an unavailable entry still gets a row" must pass —
that test is the reason this task exists.

- [ ] **Step 5: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/
git commit -m "Group models by entry, keeping unavailable entries visible"
```

### Task 4: Effort clamping, extracted so it can be tested

**Files:**
- Create: `packages/navi-app/src/lib/components/run-settings/effort.ts`
- Test: `packages/navi-app/src/lib/components/run-settings/effort.test.ts`

The spec requires per-harness clamping to be asserted (spec Testing). Left inside the Svelte
component it is permanently untestable under this repo's constraints, so it moves out.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { isEffortDisabled, effortDisabledReason, clampEffort } from "./effort";

describe("isEffortDisabled", () => {
  test("gemini has no Extra High or Max", () => {
    expect(isEffortDisabled("gemini", "xhigh")).toBe(true);
    expect(isEffortDisabled("gemini", "max")).toBe(true);
    expect(isEffortDisabled("gemini", "high")).toBe(false);
  });
  test("codex has no Max", () => {
    expect(isEffortDisabled("codex", "max")).toBe(true);
    expect(isEffortDisabled("codex", "xhigh")).toBe(false);
  });
  test("claude allows everything", () => {
    for (const e of ["low", "medium", "high", "xhigh", "max"] as const) {
      expect(isEffortDisabled("claude", e)).toBe(false);
    }
  });
});

describe("clampEffort", () => {
  test("an unsupported level falls back to the highest supported one", () => {
    expect(clampEffort("gemini", "max")).toBe("high");
    expect(clampEffort("codex", "max")).toBe("xhigh");
    expect(clampEffort("claude", "max")).toBe("max");
  });
});

describe("effortDisabledReason", () => {
  test("explains the clamp rather than just greying out", () => {
    expect(effortDisabledReason("codex", "max")).toBeTruthy();
    expect(effortDisabledReason("claude", "max")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd packages/navi-app && bun test src/lib/components/run-settings/effort.test.ts`

- [ ] **Step 3: Implement**

Port `isReasoningOptionDisabled` (`ModelReasoningSelector.svelte:164-172`),
`reasoningDisabledTitle` (`:174-179`) and the clamping in `effectiveReasoningEffort`
(`:97-103`) verbatim into the three exported functions. Behaviour must not change; if a test
above disagrees with the ported logic, fix the test.

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `cd packages/navi-app && bun test src shared server 2>&1 | tail -5`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/
git commit -m "Extract effort clamping so the per-harness rules are tested"
```

---

## Chunk 2: The menu

### Task 5: `MenuRow.svelte`

**Files:**
- Create: `packages/navi-app/src/lib/components/run-settings/MenuRow.svelte`

- [ ] **Step 1: Write the component**

Props: `{ label: string; value: string; disabled?: boolean; children: Snippet }`.

Must satisfy the spec's accessibility section in full — it is easy to build half of this:
- row: `role="menuitem"`, `aria-haspopup="menu"`, `aria-expanded={open}`
- submenu: `role="menu"`; items `role="menuitemradio"` with `aria-checked`
- opens on `mouseenter`, `click`, `Enter`, `Space`, `ArrowRight`
- `ArrowUp`/`ArrowDown` move within the focused list
- `ArrowLeft` leaves the submenu back to its row
- **two-stage Escape**: first closes the submenu and focuses the row; a second closes the menu
  and focuses the chip (the chip focus is `RunSettingsMenu`'s job — expose an `onDismiss`
  callback for it)
- positioned beside the row, flipping side within 24px of the viewport edge, clamped
  vertically; list is `max-h-72 overflow-y-auto`

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/MenuRow.svelte
git commit -m "Add a menu row with full keyboard access and edge-aware submenus"
```

### Task 6: `RunSettingsMenu.svelte`

**Files:**
- Create: `packages/navi-app/src/lib/components/run-settings/RunSettingsMenu.svelte`

- [ ] **Step 1: Write the component**

Props — exactly `ModelReasoningSelector`'s (`:7-17`) plus one callback:

```ts
interface Props {
  backend: BackendId;
  selectedModel?: string;
  backendModels?: Record<BackendId, ModelInfo[]>;
  reasoningEffort?: ReasoningEffort;
  canChangeBackend?: boolean;
  onBackendChange?: (backend: BackendId) => void;
  onModelSelect?: (model: string) => void;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  onOpenProviderSettings?: () => void;
  class?: string;
}
```

No `sessionId` — the harness branching lives in `App.svelte` where `$session.sessionId` is
already in scope.

Carry over from the old component:
- the chip trigger (`:254-277`), now using `entryMeta[resolveEntryForSelection(...)].muted`
  from Task 2 so a Z.ai chip stays fuchsia
- outside-click and Escape dismissal (`:181-202`, `:235-250`) including the `setTimeout(…, 0)`
  guard that stops the opening click from closing it
- **the auto-select `$effect` (`:229-233`)** — calls `onModelSelect(models[0].value)` when
  nothing is selected. Dropping it leaves new chats with an empty chip.

New:
- rows from `shouldShowHarnessRow()`, `modelGroupsFor()` and Task 4's effort helpers
- `runAvailability.refresh()` on first open
- a `needs-setup` group renders greyed with its reason; `fix.kind === "settings"` renders a
  **Set up** button calling `onOpenProviderSettings`; `fix.kind === "command"` renders the
  command in a copy box
- sticky group headers in the model submenu
- when `!canChangeBackend`: no harness row, footer from `harnessFooterText(backend)`
- warning dot on the chip when `availability[resolveEntryForSelection(...)]` is `needs-setup`

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/RunSettingsMenu.svelte
git commit -m "Add the row-based run settings menu"
```

### Task 7: Wire it up and delete the old components

**Files:**
- Modify: `packages/navi-app/src/lib/components/ChatInput.svelte:9`, `:87-91`, `:98`, `:1507-1516`
- Modify: `packages/navi-app/src/App.svelte` (near `:4189`)
- Delete: `ModelReasoningSelector.svelte`, `BackendSelector.svelte`, `ModelSelector.svelte`

- [ ] **Step 1: Confirm the two siblings really are dead**

Run:
```bash
cd packages/navi-app && grep -rn "BackendSelector\|ModelSelector" src/ --include='*.svelte' --include='*.ts' | grep -v "ModelReasoningSelector"
```
(Quote the globs — unquoted they are expanded by zsh and the command errors before grep runs,
which would read as a pass.)
Expected: only the two files' own definitions. Anything else — stop and re-plan.

- [ ] **Step 2: Add the prop to `ChatInput`**

Add `onOpenProviderSettings?: () => void;` beside the other callbacks (`:87-91`), add it to the
destructure (`:98`), forward it in the usage.

- [ ] **Step 3: Swap the component**

Replace the import (`:9`) and usage (`:1507-1516`) with `RunSettingsMenu`.

- [ ] **Step 4: Supply it from `App.svelte`**

Beside the existing `onManageMcp` (`:4189`):

```svelte
onOpenProviderSettings={() => { settingsInitialTab = "api"; showSettings = true; }}
```

- [ ] **Step 5: Delete the three components**

```bash
cd packages/navi-app && rm src/lib/components/ModelReasoningSelector.svelte \
  src/lib/components/BackendSelector.svelte src/lib/components/ModelSelector.svelte
```

- [ ] **Step 6: Typecheck and test**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3 && bun test src shared server 2>&1 | tail -5`
Expected: `0 errors`; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A packages/navi-app/src
git commit -m "Swap in the run settings menu and delete three unused selectors"
```

---

## Chunk 3: Harness persistence

### Task 8: Branch `onBackendChange` on whether a session exists

**Files:**
- Modify: `packages/navi-app/src/App.svelte:4214-4225`

A pending chat has `sessionId === null` (`session.ts:257-261`) and `createNewChat` reads
`get(defaultBackend)` at send (`session-actions.ts:71`), so the global is correct there. An
existing chat with no messages is broken: `sessionBackendStore.get` is `map.get(id) || "claude"`
(`session.ts:425-427`), so the `|| $defaultBackend` at `:4211` is dead and the chip never updates.

- [ ] **Step 1: Replace the handler**

The current code is exactly:

```svelte
onBackendChange={(newBackend) => {
  // Only allow backend change for new chats
  if ($session.isPending || !$session.sessionId || currentMessages.length === 0) {
    defaultBackend.set(newBackend);
    // Auto-select the default model for the new backend
    const models = getBackendModelsFormatted(newBackend, get(backendModels));
    if (models.length > 0) {
      modelSelection = models[0].value;
      handleModelSelect(models[0].value);
    }
  }
}}
```

Replace with — same guard, same auto-select, one added branch:

```svelte
onBackendChange={(newBackend) => {
  // Only allow backend change for new chats
  if ($session.isPending || !$session.sessionId || currentMessages.length === 0) {
    const sessionId = $session.sessionId;
    if (sessionId) {
      // An existing chat with no messages: the session row is the source of truth.
      // Without this the chip never updates, because sessionBackendStore.get
      // always returns a value and the || $defaultBackend fallback is dead.
      sessionBackendStore.set(sessionId, newBackend);
      api.sessions.update(sessionId, { backend: newBackend }).catch((e) =>
        console.error("Failed to persist backend:", e));
    }
    // Always update the global so the next new chat inherits the choice.
    defaultBackend.set(newBackend);
    const models = getBackendModelsFormatted(newBackend, get(backendModels));
    if (models.length > 0) {
      modelSelection = models[0].value;
      handleModelSelect(models[0].value);
    }
  }
}}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Verify by hand**

Run from the repo root: `bun run sandbox start --frontend` (backend :4021, frontend :4020).
Open an existing empty chat, switch harness, confirm the chip changes; send; reload; confirm it
stuck. Never restart the live instance — Navi is running this session (`CLAUDE.md`).

- [ ] **Step 4: Commit**

```bash
git add packages/navi-app/src/App.svelte
git commit -m "Persist a harness switch on an existing chat, not just the global default"
```

---

## Chunk 4: Settings

### Task 9: Extract `ProviderCard`

**Files:**
- Create: `packages/navi-app/src/lib/components/settings/ProviderCard.svelte`
- Modify: `packages/navi-app/src/lib/components/Settings.svelte:533-868`

A fixed `{ rows, actions }` shape will not fit: Claude branches on
`hasOAuth`/`showOAuthSetup`/`showAnthropicInput` (`:564-609` onward) and Z.ai has a delete
action (`:817`) plus a footer link (`:863-865`). Take the frame only, snippets for the rest.

- [ ] **Step 1: Write the component**

Props: `{ id, name, icon, accent, description, status: { label, tone }, body: Snippet, footer?: Snippet }`.
Markup is the shared shell lifted from `Settings.svelte:533-541`.

- [ ] **Step 2–4: Port the three cards, one commit each**

Each keeps its own state and handlers; only chrome moves. Typecheck and eyeball in the sandbox
after each, so a regression is bisectable.

```bash
git commit -m "Extract a ProviderCard frame and port the Claude card onto it"
git commit -m "Port the OpenAI card onto ProviderCard"
git commit -m "Port the Z.ai card onto ProviderCard"
```

### Task 10: Rename the refresh event and reload models with it

**Files:**
- Modify: `Settings.svelte:92-96`, `Onboarding.svelte:29-33`, `ClaudeAuthBadge.svelte:11`, `App.svelte`

There are **two** dispatchers and one listener; renaming only the Settings one orphans
onboarding and the badge stops refreshing after first-run auth.

- [ ] **Step 1: Rename in all three files**

`navi:claude-auth-updated` → `navi:provider-auth-updated`.

- [ ] **Step 2: Verify none are left**

Run: `cd packages/navi-app && grep -rn "navi:claude-auth-updated" src/`
Expected: no output.

- [ ] **Step 3: Dispatch from the silent Z.ai handlers**

Add the dispatch to `saveZaiKey()` (`Settings.svelte:342-363`) and `deleteZaiKey()` (`:365-375`).

- [ ] **Step 4: Add an app-level listener in `App.svelte`**

Not in `ClaudeAuthBadge` — that component only refreshes its own status
(`ClaudeAuthBadge.svelte:17-29`) and a global model reload does not belong there. In
`App.svelte`, where `loadModels` is already imported from `src/lib/actions/data-loaders.ts`,
add a listener that calls `loadModels()` and `runAvailability.invalidate()`.

Call `loadModels()` (`data-loaders.ts:53-67`) — **not** `loadBackendModels()`. It is the only
writer of `availableModels` (`:56`) and already chains `loadBackendModels()` itself (`:57`);
`loadBackendModels()` alone re-copies a stale array (`:83`) and the Z.ai group stays empty.

- [ ] **Step 5: Commit**

```bash
git commit -m "Rename the auth-refresh event and make saving a Z.ai key reload models"
```

### Task 11: The Codex card

**Files:**
- Modify: `Settings.svelte` (new card after Z.ai), `loadApiTab()` at `:190-215`

- [ ] **Step 1: Load Codex health in `loadApiTab()`**

`const codexHealth = await backendsApi.getCodexHealth().catch(() => null);`

- [ ] **Step 2: Add the card via `ProviderCard`**, mirroring Claude's interaction (`:579-609`)

- **Codex CLI**: `Installed · {version}` or `Not found`
- **Signed in**: `chatgpt` → "ChatGPT account", `api_key` → "API key",
  `not_logged_in` → "Not signed in", `unknown` → "Unknown"
- **Re-authenticate** → `codex login` in a copy box + "I've logged in", which re-polls and
  dispatches `navi:provider-auth-updated`

- [ ] **Step 3: Typecheck and test**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3 && bun test src shared server 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git commit -m "Add a Codex card to Settings so its CLI and sign-in are visible"
```

---

## Chunk 5: Verification

### Task 12: QA pass

- [ ] **Step 1: Boot the sandbox** — from the **repo root**: `bun run sandbox start --frontend`

Never restart the live instance.

- [ ] **Step 2: Work the script**

1. New chat: three rows; switch harness, model, effort; reopen and confirm each row shows the committed value.
2. Pending new chat: switch harness, send, confirm the session used it. Then an **existing empty chat**: switch harness, confirm the chip updates, the send uses it, and it survives a reload.
3. Chat with messages: no harness row, footer names the harness, model and effort still work.
4. A `needs-setup` entry shows its reason **and is visible at all** — check Z.ai specifically with no key, since a hidden entry is the original bug. `settings` fixes open Settings → API Keys; `command` fixes show a copy box.
5. Save a Z.ai key in Settings; Z.ai models appear in the menu with no reload.
6. Keyboard only: open the chip, arrow through rows, enter and leave a submenu, commit a value, two-stage Escape back to the chip.
7. All four Settings cards after the port: Claude (both OAuth and API-key states), OpenAI, Z.ai including remove, Codex.
8. A brand-new chat still auto-selects a model rather than showing an empty chip.
9. The chip looks unchanged — same tint per provider, Z.ai still fuchsia.

- [ ] **Step 3: Record it** with the `qa-video` skill, asserting the load-bearing states.

- [ ] **Step 4: Stop the sandbox** — from the repo root: `bun run sandbox stop`

- [ ] **Step 5: Open the PR** from `feat/run-settings-menu` to `main`, video attached.
