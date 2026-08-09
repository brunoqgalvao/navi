# Run Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the composer's two-pane model picker with Codex-style rows (Harness / Model / Effort), show why a harness is unusable with a route to fixing it, and add a Codex card to Settings.

**Architecture:** All decision logic moves into pure functions in `src/lib/stores/run-availability.ts` and `src/lib/components/run-settings/model-groups.ts` so it can be unit-tested with `bun test` — there is no Svelte component test harness in this repo and this plan does not add one. A new `RunSettingsMenu.svelte` consumes those functions; the old `ModelReasoningSelector.svelte` and two long-dead siblings are deleted. Settings gains a `ProviderCard` frame that all four provider cards use.

**Tech Stack:** Svelte 5 (runes, snippets), TypeScript, Tailwind, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-09-run-settings-menu-design.md`

**Working directory:** all paths are relative to `packages/navi-app/`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/stores/run-availability.ts` **(create)** | `deriveRunAvailability()` pure function + types + the fetching/caching store |
| `src/lib/components/run-settings/model-groups.ts` **(create)** | `modelGroupsFor()`, `shouldShowHarnessRow()`, `harnessMeta` |
| `src/lib/components/run-settings/RunSettingsMenu.svelte` **(create)** | The chip + row menu |
| `src/lib/components/run-settings/MenuRow.svelte` **(create)** | One label/value/chevron row with submenu plumbing |
| `src/lib/components/settings/ProviderCard.svelte` **(create)** | Card frame: icon, name, status pill, `body`/`footer` snippets |
| `src/lib/components/ModelReasoningSelector.svelte` **(delete)** | Replaced |
| `src/lib/components/BackendSelector.svelte` **(delete)** | Dead code, zero references |
| `src/lib/components/ModelSelector.svelte` **(delete)** | Dead code, zero references |
| `src/lib/components/ChatInput.svelte` **(modify)** | Swap component, add `onOpenProviderSettings` prop |
| `src/App.svelte` **(modify)** | `onBackendChange` branch, supply `onOpenProviderSettings` |
| `src/lib/components/Settings.svelte` **(modify)** | Port 3 cards onto `ProviderCard`, add Codex card, dispatch renamed event |
| `src/lib/components/Onboarding.svelte` **(modify)** | Rename the event it dispatches |
| `src/lib/components/ClaudeAuthBadge.svelte` **(modify)** | Rename the event it listens for |

---

## Chunk 1: Availability logic

### Task 1: `deriveRunAvailability`

**Files:**
- Create: `src/lib/stores/run-availability.ts`
- Test: `src/lib/stores/run-availability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stores/run-availability.test.ts
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
    expect(a.claude.state).toBe("ready");
    expect(a.codex.state).toBe("ready");
    expect(a.gemini.state).toBe("ready");
    expect(a.zai.state).toBe("ready");
  });

  test("a missing CLI reports an install command, not a settings link", () => {
    const a = deriveRunAvailability(
      [backend("claude", true), backend("codex", false), backend("gemini", true)],
      codex({ installed: false, authMode: "unknown" }),
      auth(),
    );
    expect(a.codex).toEqual({
      state: "needs-setup",
      reason: "Codex CLI not found",
      fix: { kind: "command", command: "npm i -g @openai/codex" },
    });
  });

  test("an unreadable codex sign-in state is not treated as ready", () => {
    const a = deriveRunAvailability(all, codex({ authMode: "unknown" }), auth());
    expect(a.codex).toEqual({
      state: "needs-setup",
      reason: "Couldn't read sign-in state",
      fix: { kind: "settings" },
    });
  });

  test("codex not logged in points at settings", () => {
    const a = deriveRunAvailability(all, codex({ authMode: "not_logged_in" }), auth());
    expect(a.codex.state).toBe("needs-setup");
    expect(a.codex).toMatchObject({ reason: "Not signed in", fix: { kind: "settings" } });
  });

  test("api_key counts as signed in", () => {
    expect(deriveRunAvailability(all, codex({ authMode: "api_key" }), auth()).codex.state).toBe("ready");
  });

  test("claude installed but signed out", () => {
    const a = deriveRunAvailability(all, codex(), auth({ hasOAuth: false, hasApiKey: false }));
    expect(a.claude).toMatchObject({ reason: "Not signed in", fix: { kind: "settings" } });
  });

  test("no zai key", () => {
    const a = deriveRunAvailability(all, codex(), auth({ hasZaiKey: false }));
    expect(a.zai).toMatchObject({ reason: "No Z.ai API key", fix: { kind: "settings" } });
  });

  test("zai inherits claude's problem, because it runs on the claude runtime", () => {
    const a = deriveRunAvailability(
      [backend("claude", false), backend("codex", true), backend("gemini", true)],
      codex(), auth({ hasZaiKey: true }),
    );
    expect(a.zai).toEqual(a.claude);
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
import { api, backendsApi } from "../api";

export type ProviderAuthStatus = Awaited<ReturnType<typeof api.auth.status>>;

/** Things the menu can offer: the three harnesses, plus Z.ai as a model group. */
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

function notFound(id: BackendId, label: string): EntryAvailability {
  return {
    state: "needs-setup",
    reason: `${label} CLI not found`,
    fix: { kind: "command", command: INSTALL_COMMAND[id] },
  };
}

function needsSettings(reason: string): EntryAvailability {
  return { state: "needs-setup", reason, fix: { kind: "settings" } };
}

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

  // The installed guard matters: with no path, detectCodexAuthMode returns "unknown",
  // so an uninstalled Codex would otherwise report the wrong reason and the wrong fix.
  const codex = !installed("codex")
    ? notFound("codex", "Codex")
    : codexHealth?.authMode === "not_logged_in"
      ? needsSettings("Not signed in")
      : codexHealth == null || codexHealth.authMode === "unknown"
        ? needsSettings("Couldn't read sign-in state")
        : READY;

  const gemini = !installed("gemini") ? notFound("gemini", "Gemini") : READY;

  // Z.ai models run on the Claude runtime, so a key without a usable Claude is not runnable.
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
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/navi-app/src/lib/stores/run-availability.ts packages/navi-app/src/lib/stores/run-availability.test.ts
git commit -m "Derive why each harness is unusable, with the fix that matches it"
```

### Task 2: The availability store

**Files:**
- Modify: `src/lib/stores/run-availability.ts` (append)

- [ ] **Step 1: Append the store**

Lazy because `getCodexHealth()` spawns two subprocesses, scans `~/.codex/skills` and tails
256KB of log (`server/routes/backends.ts:50-62`, `:88-126`). Fetch on first menu open, cache 60s.

```ts
import { writable, get } from "svelte/store";

const TTL_MS = 60_000;

function createRunAvailability() {
  const { subscribe, set } = writable<Record<MenuEntryId, EntryAvailability> | null>(null);
  let fetchedAt = 0;
  let inFlight: Promise<void> | null = null;

  async function refresh(force = false): Promise<void> {
    if (!force && Date.now() - fetchedAt < TTL_MS) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const [backends, codexHealth, auth] = await Promise.all([
          backendsApi.list(),
          backendsApi.getCodexHealth().catch(() => null),
          api.auth.status(),
        ]);
        set(deriveRunAvailability(backends, codexHealth, auth));
        fetchedAt = Date.now();
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return { subscribe, refresh, invalidate: () => { fetchedAt = 0; } };
}

export const runAvailability = createRunAvailability();
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add packages/navi-app/src/lib/stores/run-availability.ts
git commit -m "Fetch harness availability lazily, since the codex probe is expensive"
```

### Task 3: Model grouping and harness metadata

**Files:**
- Create: `src/lib/components/run-settings/model-groups.ts`
- Test: `src/lib/components/run-settings/model-groups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { modelGroupsFor, shouldShowHarnessRow, harnessMeta } from "./model-groups";
import type { ModelInfo } from "../../stores/types";

const models = {
  claude: [
    { value: "claude-fable-5", displayName: "Fable 5", description: "", provider: "anthropic" },
    { value: "glm-5.2", displayName: "GLM-5.2", description: "", provider: "zai" },
  ] as ModelInfo[],
  codex: [{ value: "gpt-5.6-sol", displayName: "GPT-5.6-sol", description: "" }] as ModelInfo[],
  gemini: [] as ModelInfo[],
};

describe("modelGroupsFor", () => {
  test("a switchable chat sees every harness, grouped by provider", () => {
    const groups = modelGroupsFor(models, "claude", true);
    expect(groups.map((g) => g.id)).toEqual(["claude", "zai", "codex"]);
  });

  test("zai is a group inside the claude harness, not a harness", () => {
    const groups = modelGroupsFor(models, "claude", true);
    const zai = groups.find((g) => g.id === "zai")!;
    expect(zai.harness).toBe("claude");
    expect(zai.models.map((m) => m.value)).toEqual(["glm-5.2"]);
  });

  test("a committed chat sees only its own harness", () => {
    expect(modelGroupsFor(models, "codex", false).map((g) => g.id)).toEqual(["codex"]);
  });

  test("empty harnesses emit no group", () => {
    expect(modelGroupsFor(models, "claude", true).some((g) => g.id === "gemini")).toBe(false);
  });
});

describe("shouldShowHarnessRow", () => {
  test("only when the harness can still change", () => {
    expect(shouldShowHarnessRow(true)).toBe(true);
    expect(shouldShowHarnessRow(false)).toBe(false);
  });
});

describe("harnessMeta", () => {
  test("covers exactly the three real backends", () => {
    expect(Object.keys(harnessMeta).sort()).toEqual(["claude", "codex", "gemini"]);
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
import type { MenuEntryId } from "../../stores/run-availability";

export const harnessMeta: Record<BackendId, { label: string; description: string; accent: string }> = {
  claude: { label: "Claude", description: "Careful agent work", accent: "amber" },
  codex: { label: "Codex", description: "Deep coding runs", accent: "emerald" },
  gemini: { label: "Gemini", description: "Long-context passes", accent: "indigo" },
};

export type ModelGroup = {
  id: MenuEntryId;
  label: string;
  harness: BackendId;
  models: ModelInfo[];
};

export function shouldShowHarnessRow(canChangeBackend: boolean): boolean {
  return canChangeBackend;
}

/** Z.ai is split out of the claude harness by provider tag, not by backend. */
function splitClaude(models: ModelInfo[]): { claude: ModelInfo[]; zai: ModelInfo[] } {
  return {
    claude: models.filter((m) => m.provider !== "zai"),
    zai: models.filter((m) => m.provider === "zai"),
  };
}

export function modelGroupsFor(
  backendModels: Record<BackendId, ModelInfo[]>,
  currentHarness: BackendId,
  canChangeBackend: boolean,
): ModelGroup[] {
  const harnesses: BackendId[] = canChangeBackend
    ? ["claude", "codex", "gemini"]
    : [currentHarness];

  const groups: ModelGroup[] = [];
  for (const harness of harnesses) {
    const models = backendModels[harness] ?? [];
    if (harness === "claude") {
      const { claude, zai } = splitClaude(models);
      if (claude.length) groups.push({ id: "claude", label: "Claude", harness, models: claude });
      if (zai.length) groups.push({ id: "zai", label: "Z.ai", harness, models: zai });
    } else if (models.length) {
      groups.push({ id: harness, label: harnessMeta[harness].label, harness, models });
    }
  }
  return groups;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/navi-app && bun test src/lib/components/run-settings/model-groups.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/
git commit -m "Group models by provider, scoped to what the chat can run"
```

---

## Chunk 2: The menu

### Task 4: `MenuRow.svelte`

**Files:**
- Create: `src/lib/components/run-settings/MenuRow.svelte`

- [ ] **Step 1: Write the component**

One row: label, current value, chevron, and a submenu slot. Owns its own open state,
keyboard handling and edge-flipping so `RunSettingsMenu` stays readable.

Requirements to satisfy (verified against the spec):
- `role="menuitem"`, `aria-haspopup="menu"`, `aria-expanded={open}`
- opens on `mouseenter`, `click`, `Enter`, `Space`, `ArrowRight`
- `Escape` closes the submenu and returns focus to the row
- submenu is `role="menu"`; flips side within 24px of the viewport edge; clamps vertically
- submenu list is `max-h-72 overflow-y-auto`

Props: `{ label: string; value: string; disabled?: boolean; children: Snippet }`.

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/MenuRow.svelte
git commit -m "Add a menu row with keyboard access and edge-aware submenus"
```

### Task 5: `RunSettingsMenu.svelte`

**Files:**
- Create: `src/lib/components/run-settings/RunSettingsMenu.svelte`

- [ ] **Step 1: Write the component**

Props — exactly `ModelReasoningSelector`'s (`ModelReasoningSelector.svelte:7-17`) plus one:

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

Carry over verbatim from the old component:
- the chip trigger (`:254-277`) — unchanged appearance, still tinted by **provider**
- outside-click and Escape dismissal (`:181-202`, `:235-250`), including the
  `setTimeout(…, 0)` guard that stops the opening click from closing it
- effort clamping: `isReasoningOptionDisabled` (`:164-172`), `reasoningDisabledTitle`
  (`:174-179`), `effectiveReasoningEffort` (`:97-103`)
- **the auto-select `$effect` (`:229-233`)** — calls `onModelSelect(models[0].value)` when
  nothing is selected. Dropping it leaves new chats with an empty chip.

New behaviour:
- rows built from `shouldShowHarnessRow()` and `modelGroupsFor()`
- calls `runAvailability.refresh()` when the menu first opens
- a `needs-setup` entry renders greyed with its reason; `fix.kind === "settings"` renders a
  **Set up** button calling `onOpenProviderSettings`, `fix.kind === "command"` renders the
  command in a copy box
- when `!canChangeBackend`, no harness row; instead a footer reading
  `` `${harnessMeta[backend].label} · fixed for this chat` ``
- the chip shows a warning dot when the current entry is `needs-setup`

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add packages/navi-app/src/lib/components/run-settings/RunSettingsMenu.svelte
git commit -m "Add the row-based run settings menu"
```

### Task 6: Wire it up and delete the old components

**Files:**
- Modify: `src/lib/components/ChatInput.svelte:9` (import), `:1507-1516` (usage), props at `:87-91`, `:98`
- Modify: `src/App.svelte:4170-4189` (pass `onOpenProviderSettings`)
- Delete: `src/lib/components/ModelReasoningSelector.svelte`, `BackendSelector.svelte`, `ModelSelector.svelte`

- [ ] **Step 1: Confirm the two siblings really are dead before deleting**

Run:
```bash
cd packages/navi-app && grep -rn "BackendSelector\|ModelSelector" src/ --include=*.svelte --include=*.ts | grep -v "^src/lib/components/BackendSelector.svelte\|^src/lib/components/ModelSelector.svelte\|ModelReasoningSelector"
```
Expected: no output. If anything prints, stop and re-plan.

- [ ] **Step 2: Add the prop to `ChatInput`**

Add `onOpenProviderSettings?: () => void;` to the `Props` interface beside the other callbacks
(`:87-91`), add it to the destructure (`:98`), and forward it in the component usage.

- [ ] **Step 3: Swap the component**

Replace the `ModelReasoningSelector` import (`:9`) and usage (`:1507-1516`) with
`RunSettingsMenu`, passing the same props plus `onOpenProviderSettings`.

- [ ] **Step 4: Supply it from `App.svelte`**

Next to the existing `onManageMcp` (`App.svelte:4189`), add:

```svelte
onOpenProviderSettings={() => { settingsInitialTab = "api"; showSettings = true; }}
```

- [ ] **Step 5: Delete the three old components**

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

### Task 7: Branch `onBackendChange` on whether a session exists

**Files:**
- Modify: `src/App.svelte:4214-4225`

Context: `canChangeBackend` is true in two states and today's handler is right for one of them.
A pending chat has `sessionId === null` (`session.ts:257-261`) and `createNewChat` reads
`get(defaultBackend)` at send (`session-actions.ts:71`), so the global is the correct carrier.
An existing chat with no messages is broken: `sessionBackendStore.get` is
`map.get(id) || "claude"` (`session.ts:425-427`), so the `|| $defaultBackend` at `App.svelte:4211`
is dead and the chip never updates.

- [ ] **Step 1: Replace the handler body**

```ts
onBackendChange={(newBackend) => {
  if (!isNewChatForBackendSwitch()) return;   // keep the existing guard
  const sessionId = $session.sessionId;
  if (sessionId) {
    // Existing session with no messages: the session row is the source of truth.
    sessionBackendStore.set(sessionId, newBackend);
    void api.sessions.update(sessionId, { backend: newBackend });
  }
  // Always update the global so the next new chat inherits the choice.
  defaultBackend.set(newBackend);
  const first = getBackendModelsFormatted(newBackend, $backendModels)[0];
  if (first) handleModelSelect(first.value);
}}
```

Keep whatever guard the current code uses; only the persistence branch is new.

- [ ] **Step 2: Typecheck**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 3: Verify by hand in the sandbox**

Run: `bun run sandbox start --frontend`, open an existing empty chat, switch harness, confirm
the chip changes, send a message, reload, and confirm the harness stuck.

- [ ] **Step 4: Commit**

```bash
git add packages/navi-app/src/App.svelte
git commit -m "Persist a harness switch on an existing chat, not just the global default"
```

---

## Chunk 4: Settings

### Task 8: Extract `ProviderCard`

**Files:**
- Create: `src/lib/components/settings/ProviderCard.svelte`
- Modify: `src/lib/components/Settings.svelte:533-868`

A fixed `{ rows, actions }` shape will not fit: the Claude card branches on
`hasOAuth`/`showOAuthSetup`/`showAnthropicInput` (`:564-609` onward) and Z.ai has a delete
action (`:817`) plus a footer link (`:863-865`). The card takes the frame only and Svelte 5
snippets for the rest.

- [ ] **Step 1: Write the component**

Props: `{ id, name, icon, accent, description, status: { label, tone }, body: Snippet, footer?: Snippet }`.
Markup is the shared shell lifted from `Settings.svelte:533-541` (`bg-gray-50 … rounded-xl border … p-5`,
icon div, title, description, status pill).

- [ ] **Step 2: Port the three existing cards**

One card per commit so a regression is bisectable. Each keeps its own state and handlers;
only the chrome moves. Verify visually in the sandbox after each.

- [ ] **Step 3: Typecheck after each port**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 4: Commit (three times)**

```bash
git commit -m "Extract a ProviderCard frame and port the Claude card onto it"
git commit -m "Port the OpenAI card onto ProviderCard"
git commit -m "Port the Z.ai card onto ProviderCard"
```

### Task 9: Rename the refresh event

**Files:**
- Modify: `src/lib/components/Settings.svelte:92-96`, `Onboarding.svelte:29-33`, `ClaudeAuthBadge.svelte:11`

There are **two** dispatchers and one listener. Renaming only the Settings one orphans
onboarding and the badge stops refreshing after first-run auth.

- [ ] **Step 1: Rename all three**

`navi:claude-auth-updated` → `navi:provider-auth-updated`.

- [ ] **Step 2: Verify none are left behind**

Run: `cd packages/navi-app && grep -rn "navi:claude-auth-updated" src/`
Expected: no output.

- [ ] **Step 3: Dispatch it from the silent Z.ai handlers**

Add `notifyProviderAuthUpdated()` to `saveZaiKey()` (`Settings.svelte:342-363`) and
`deleteZaiKey()` (`:365-375`).

- [ ] **Step 4: Reload models on the event**

In the listener path, call `loadModels()` — **not** `loadBackendModels()`. `loadModels()`
(`data-loaders.ts:53-67`) is the only writer of `availableModels` (`:56`) and already chains
`loadBackendModels()` itself (`:57`); calling `loadBackendModels()` alone re-copies a stale
array (`:83`) and the Z.ai group stays empty. Also call `runAvailability.invalidate()`.

- [ ] **Step 5: Commit**

```bash
git commit -m "Rename the auth-refresh event and make saving a Z.ai key reload models"
```

### Task 10: The Codex card

**Files:**
- Modify: `src/lib/components/Settings.svelte` (new card after Z.ai), `loadApiTab()` at `:190-215`

- [ ] **Step 1: Load Codex health in `loadApiTab()`**

`const codexHealth = await backendsApi.getCodexHealth().catch(() => null);`

- [ ] **Step 2: Add the card**

Using `ProviderCard`, mirroring Claude's interaction (`:579-609`):
- **Codex CLI**: `Installed · {version}` or `Not found`
- **Signed in**: `chatgpt` → "ChatGPT account", `api_key` → "API key",
  `not_logged_in` → "Not signed in", `unknown` → "Unknown"
- **Re-authenticate** → reveals `codex login` in a copy box + "I've logged in", which re-polls
  and dispatches `navi:provider-auth-updated`

- [ ] **Step 3: Typecheck and test**

Run: `cd packages/navi-app && bun run check 2>&1 | tail -3 && bun test src shared server 2>&1 | tail -5`
Expected: `0 errors`; all pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "Add a Codex card to Settings so its CLI and sign-in are visible"
```

---

## Chunk 5: Verification

### Task 11: QA pass

- [ ] **Step 1: Boot the sandbox on this branch**

```bash
bun run sandbox start --frontend    # backend :4021, frontend :4020
```

Never restart the live instance — Navi is running this session (see `CLAUDE.md`).

- [ ] **Step 2: Work the script**

1. New chat: three rows; switch harness, model, effort; reopen and confirm each row shows the committed value.
2. Pending new chat: switch harness, send, confirm the created session used it. Then an **existing empty chat**: switch harness, confirm the chip updates, the send uses it, and it survives a reload.
3. Chat with messages: no harness row, footer names the harness, model and effort still work.
4. A `needs-setup` entry shows its reason; a `settings` fix opens Settings → API Keys; a `command` fix shows a copy box.
5. Save a Z.ai key in Settings and confirm Z.ai models appear in the menu with no reload.
6. Keyboard only: open the chip, arrow through rows, enter and leave a submenu, commit a value, Escape back to the chip.
7. All four Settings cards after the port: Claude (both OAuth and API-key states), OpenAI, Z.ai including remove, Codex.
8. A brand-new chat still auto-selects a model rather than showing an empty chip.

- [ ] **Step 3: Record it**

Use the `qa-video` skill against the sandbox, asserting the load-bearing states rather than
only filming them.

- [ ] **Step 4: Stop the sandbox**

```bash
bun run sandbox stop
```

- [ ] **Step 5: Open the PR**

Single PR to `main` from `feat/run-settings-menu`, video attached per house style.
