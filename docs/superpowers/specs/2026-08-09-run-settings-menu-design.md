# Run settings menu + Codex provider card

**Date:** 2026-08-09
**Status:** Design

## Problem

The composer's model picker (`src/lib/components/ModelReasoningSelector.svelte`) presents
everything at once: an "Intelligence" list of five effort levels, a provider list, and a
second pane of models that expands on hover. Three things are wrong with it.

**The padlocks lie.** Once a chat has any messages, every provider whose backend differs from
the current one renders a padlock. `canUseProvider` (`ModelReasoningSelector.svelte:159-162`)
returns `targetBackend === backend || (canChangeBackend && !!onBackendChange)`;
`onBackendChange` is always supplied (`ChatInput.svelte:1513`), so the whole predicate reduces
to `canChangeBackend`, which is `isNewChat` (`ChatInput.svelte:1512`, from `App.svelte:4181`).
Nothing about authentication is involved, yet a padlock reads as "not signed in".

Which rows lock depends on where you are, because Claude and Z.ai share
`backendId: "claude"` (`:42`, `:50`): from a Codex chat, Claude, Z.ai *and* Gemini all lock;
from a Claude chat, only Codex and Gemini do, and Z.ai stays freely selectable.

**Real unavailability is invisible.** A harness that genuinely cannot run — Gemini CLI not
installed, Z.ai with no API key — is not marked at all. Z.ai is worse than unmarked:
`visibleProviders` (`:93-95`) drops any provider with no models, and `getConfiguredZaiModels()`
(`server/routes/config.ts:18-21`) returns none without a key, so Z.ai silently disappears from
the menu with no explanation and no route to fixing it.

**Codex cannot be managed at all.** Settings → API Keys has cards for Claude, OpenAI and Z.ai
(`src/lib/components/Settings.svelte:533-868`) and no Codex card. The server already computes
everything needed — `CodexAdapter.detect()` (`server/backends/codex-adapter.ts:353-387`) and
`detectCodexAuthMode()` (`server/routes/backends.ts:69-86`) are joined by
`GET /api/backends/codex/health` (`server/routes/backends.ts:252-258`), exposed as
`backendsApi.getCodexHealth()` (`src/lib/api.ts:1730`) and called by nothing.

## Goals

Replace the two-pane flyout with a row-based menu shaped like Codex's settings popover: a
short list of labelled rows, each showing its current value and opening a submenu. Navi
carries one axis Codex does not — the harness — so the rows are `Harness / Model / Effort`.

Surface real availability with a route to fixing it, and give Codex a Settings card so "why
can't I use this" and "let me fix it" live in the same product.

## Non-goals

- **Fast mode.** The SDK supports it (`settings.fastMode` on `Options.settings`, `sdk.d.ts:6629`,
  with `fast_mode_state` and `fast_mode_disabled_reason` on results, `:3627-3628`) and Codex's
  menu has a Speed row. Navi has no speed concept today; adding one is new plumbing through
  the query path for a feature limited to Claude Opus 5 and 4.8. Explicitly deferred.
- **Real in-app OAuth.** Claude's "Re-authenticate" (`Settings.svelte:573-578`) only displays
  `claude auth login` to copy into a terminal. The Codex card matches that pattern rather than
  fixing it. The dead `POST /api/auth/login` route (`server/routes/auth.ts:337-373`) stays dead.
- **Codex speed control.** `codex exec` has no speed flag.
- **Blocking Claude↔Z.ai mid-chat.** That switch is permitted today and stays permitted; it is
  a model change within one harness, not a harness change. This design makes it *look* like
  what it is rather than changing the rule.
- **Component test infrastructure.** See Testing.

## Design

### The menu

A new component, `src/lib/components/RunSettingsMenu.svelte`, replaces
`ModelReasoningSelector.svelte`, which is deleted in the same change. A rewrite in place would
keep almost nothing — the existing structure is a two-pane hover layout (menu container
`:280-393`, left-pane content `:283-341`, nested right pane `:343-392`) that the row design
does not share. The chip trigger (`:254-277`) and the outside-click/Escape dismissal
(`:181-202`, `:235-250`) are worth carrying over.

The chip keeps its current appearance and position in the composer toolbar
(`ChatInput.svelte:1507-1516`). Opening it shows:

```
┌────────────────────────────┐
│ Harness    Codex         › │   ← only when the chat is switchable
│ Model      5.6 Sol       › │
│ Effort     Extra High    › │
└────────────────────────────┘
```

Each row is a button showing label, current value, and a chevron, opening a submenu beside the
menu. Committing a value closes the whole menu. This differs from today, where hovering a
provider swaps a pane but only clicking a *model* commits anything (`selectModel`, `:216-227`)
— a distinction that is invisible and easy to get wrong.

**The harness row appears only when `canChangeBackend` is true.** With messages present the row
is omitted and the menu ends with a muted footer:

```
│ ────────────────────────── │
│ Codex · fixed for this chat│
```

One honest sentence instead of padlocks that imply an auth problem.

**Harness is a harness, not a brand.** `providerMeta` (`:39-72`) lists Claude, Z.ai, Codex and
Gemini as peers, but Z.ai is a set of models routed through the Claude runtime. The harness
submenu lists exactly the three real backends (`claude`, `codex`, `gemini`); Z.ai appears as a
group inside the Claude harness's model list. This requires new harness-keyed metadata —
`harnessMeta: Record<BackendId, { label, icon, accent, description }>` — since `providerMeta`
is provider-keyed. The chip is unchanged and keeps tinting by *provider* (`:261`), so a Z.ai
session shows a fuchsia chip reading `GLM-5.2` while the harness row reads `Claude`.

The model submenu groups by provider with sticky headers, so a user who thinks in brands still
finds "Z.ai → GLM-5.2".

**Effort** keeps its five levels and its per-harness clamping (`isReasoningOptionDisabled`
`:164-172`, `reasoningDisabledTitle` `:174-179`, `effectiveReasoningEffort` `:97-103`). Only the
presentation changes.

**Submenus** open on hover, on click, and — for keyboard users — on `Enter`, `Space` or
`ArrowRight` on the focused row. They are positioned beside the row, flipping to the opposite
side when within 24px of the viewport edge and clamping vertically so they never extend past
the viewport; the grouped model list keeps a `max-h-72 overflow-y-auto` as today (`:361`).

**Accessibility**, absent from the current component (`:315-321`) and introduced here: the menu
is `role="menu"`, rows are `role="menuitem"` with `aria-haspopup="menu"` and `aria-expanded`;
submenus are `role="menu"` with `role="menuitemradio"` items carrying `aria-checked`. Up/Down
moves within a list, `ArrowRight`/`ArrowLeft` enters and leaves a submenu, `Escape` closes the
submenu and returns focus to its row, and a second `Escape` closes the menu and returns focus
to the chip.

### Availability

A pure function is the unit of logic, so it can be tested without a store or a component:

```ts
// src/lib/stores/run-availability.ts
export function deriveRunAvailability(
  backends: BackendInfo[],
  codexHealth: CodexHealth | null,
  authStatus: AuthStatus,
): Record<MenuEntryId, EntryAvailability>
```

`MenuEntryId` is the set of things the menu can offer: the three harnesses (`claude`, `codex`,
`gemini`) plus the `zai` model group. Z.ai is deliberately *not* a harness but still needs an
availability state, so the map is keyed by menu entry rather than by backend. Each value is:

```ts
type EntryAvailability =
  | { state: "ready" }
  | { state: "needs-setup"; reason: string; fix: { kind: "settings" } | { kind: "command"; command: string } }
```

`locked-to-chat` is **not** in this map. Chat context does not exist at this layer — it comes
from `isNewChat` in the component tree — and it is rendered as the footer, not per row.

Inputs, all of which already exist:

| Source | Endpoint | Gives |
|---|---|---|
| `backendsApi.list()` | `GET /api/backends` (`server/routes/backends.ts:203-221`) | installed, version, path per backend |
| `backendsApi.getCodexHealth()` | `GET /api/backends/codex/health` (`:252-258`) | Codex auth mode |
| `api.auth.status()` | `GET /api/auth/status` (`server/routes/auth.ts:165-265`) | `hasZaiKey`, `claudeInstalled`, `hasOAuth`, `hasApiKey` |

Mapping:

| Entry | `needs-setup` when | Reason | Fix |
|---|---|---|---|
| `claude` | `!claudeInstalled` | `Claude CLI not found` | command `npm i -g @anthropic-ai/claude-code` |
| `claude` | installed, `!hasOAuth && !hasApiKey` | `Not signed in` | settings |
| `codex` | `!installed` | `Codex CLI not found` | command `brew install codex` |
| `codex` | `authMode === "not_logged_in"` | `Not signed in` | settings |
| `codex` | `authMode === "unknown"` | `Couldn't read sign-in state` | settings |
| `gemini` | `!installed` | `Gemini CLI not found` | command `npm i -g @google/gemini-cli` |
| `zai` | `!hasZaiKey` | `No Z.ai API key` | settings |

`CodexHealth.authMode` is a four-state union (`backends.ts:41`) and `detectCodexAuthMode`
returns `"unknown"` on spawn failure or unparsed output (`:70`, `:85`); treating it as
`needs-setup` is deliberate — an unreadable state should not present as ready.

**Two fix affordances, because "API Keys" is the wrong destination for a missing CLI.** A
`settings` fix renders a **Set up** link that opens Settings on the API Keys tab —
`Settings` already accepts `initialTab` (`Settings.svelte:18,21,27`) and `App.svelte:4189`
already uses `settingsInitialTab` for MCP, so this is that same pattern. A `command` fix
renders the install command in a copy box inline, matching the copy-paste convention the auth
cards already use. Gemini gets a command, not a dead-end link to a tab with no Gemini card.

**When the currently selected entry is `needs-setup`**, the chip shows a small warning dot and
the menu row states the reason. Sending is not blocked: the backend now reports its own
failure legibly, and silently disabling the composer would be a worse failure mode than an
honest error. This is reachable because `sessionBackendStore.get` defaults to `"claude"`
(`session.ts:425`).

**Fetching.** `getCodexHealth()` is expensive — `spawnSync(codex, ["login","status"])` with a
4s timeout (`backends.ts:72-78`), `codex --version` (`codex-adapter.ts:355-368`), a
`readdirSync` of `~/.codex/skills` with a YAML parse per skill (`backends.ts:83-126`), and a
256KB log tail (`:49-61`). The store therefore fetches lazily **on first menu open, not on
component mount**, and caches for 60s. It invalidates immediately on the
`navi:claude-auth-updated` window event (`Settings.svelte:92-96`), which is extended to fire
for every provider change rather than only Claude's.

**Saving a Z.ai key must also reload models.** Z.ai models come from `/api/models` via
`loadBackendModels()` (`data-loaders.ts:53-70`), not from this store, and `saveZaiKey()`
(`Settings.svelte:342-362`) does not currently notify anything. Re-deriving availability alone
would leave the Z.ai group empty after a successful "Set up → save key". The event handler
therefore re-runs `loadBackendModels()` as well as re-deriving availability.

### Settings: the Codex card

The three existing cards are hand-written and duplicated — each repeats a card shell, icon,
status pill, preview row, and its own `showXInput` / `xKeyInput` / `xError` / `savingX` state.
Adding a fourth by copy-paste means ~75 more lines in a 1660-line file.

Extract `src/lib/components/settings/ProviderCard.svelte` and port all four onto it. A fixed
`{ rows, actions }` prop shape will not fit: the Claude card has two independent sub-sections
branching on `hasOAuth` / `showOAuthSetup` / `showAnthropicInput` (`Settings.svelte:564-609`
onward), and the Z.ai card carries a delete action (`:817`) plus a footer paragraph with a link
(`:863-865`). The component therefore takes the frame only —
`{ id, name, icon, accent, description, status }` — and Svelte 5 snippets for `body` and
optional `footer`. Each card keeps its own state and handlers; only the repeated chrome moves.

The Codex card shows:

- **CLI**: `Installed · 0.146.0` or `Not found`, from `getCodexHealth()`
- **Signed in**: `ChatGPT account` / `API key` / `Not signed in` / `Unknown`
- **Re-authenticate**: reveals `codex login` in a copy box with an "I've logged in" button that
  re-polls — the same interaction as Claude's (`Settings.svelte:579-609`)

No new server routes.

### Harness selection must persist per session

Today `onBackendChange` (`App.svelte:4214-4225`) writes only the global `defaultBackend`
writable (`session.ts:444`) — in-memory, not persisted — and never writes
`sessionBackendStore`; a session's backend is written once at creation
(`session-actions.ts:82`, `:127`). So choosing a harness on a new chat silently changes the
app-wide default for every future chat and is lost on restart.

Promoting harness to a first-class row makes that surprising. The handler is changed to write
all three: `sessionBackendStore.set(sessionId, backend)`, `PATCH /api/sessions/:id` with
`{ backend }` (already supported, `server/routes/sessions.ts:250-252`, column at
`server/db.ts:273`), and `defaultBackend` as today so the next new chat inherits the choice.

## Testing

There is no Svelte component test harness — `packages/navi-app/package.json` has no vitest,
no `@testing-library/svelte`, no DOM shim, and all 21 existing `*.test.ts` files cover pure TS
modules. This design does not add that infrastructure. Component behaviour is therefore
covered by the QA pass, and the logic worth asserting is extracted into pure functions so it
can be tested with `bun test`:

- `deriveRunAvailability(backends, codexHealth, authStatus)` — every row of the mapping table,
  including Z.ai with and without a key, and all four `authMode` values.
- `shouldShowHarnessRow(canChangeBackend)` and the footer text it implies.
- `groupModelsForHarness(models, harness)` — Z.ai models group under `claude`, and no group is
  emitted for a harness with no models.
- Effort clamping per harness is preserved (Gemini has no Extra High/Max; Codex has no Max).

QA pass against the sandbox instance, covering both the redesign and what it puts at risk:

1. New chat: three rows; switch harness; switch model; switch effort; reopen and confirm each
   row shows the committed value.
2. New chat, harness switched, then send — confirm the query runs on the chosen harness and
   that reloading the session keeps it (this is the persistence change).
3. Chat with messages: harness row absent, footer names the harness, model and effort still work.
4. A `needs-setup` entry shows its reason; a `settings` fix opens Settings → API Keys; a
   `command` fix shows a copy box.
5. Save a Z.ai key from Settings and confirm Z.ai models appear in the menu without a reload.
6. Keyboard only: open the chip, arrow through rows, enter and leave a submenu, commit a value,
   Escape back to the chip.
7. All four Settings cards after the ProviderCard port: Claude (both OAuth and API-key states),
   OpenAI, Z.ai (including remove), Codex.
8. A brand-new chat still auto-selects a model rather than showing an empty chip.

## Risks

**The menu is the only way to change harness, model or effort from the composer.** Its one
consumer is `ChatInput.svelte:1507-1516`, so a regression is total rather than partial.
(`InfiniteLoopConfig.svelte:22` renders its own model list, so models are reachable elsewhere,
but harness and effort are not.) QA steps 1–3 gate the merge.

**`$effect` auto-selection.** `ModelReasoningSelector.svelte:229-233` calls
`onModelSelect(currentModels[0].value)` whenever no model is selected. Carry it across
deliberately — dropping it leaves new chats with an empty model. QA step 8.

**The ProviderCard port rewrites working auth UI.** It touches three cards that currently work,
for the benefit of a fourth. QA step 7 exists specifically for this; if it proves fragile in
review, adding the Codex card standalone and deferring the extraction is an acceptable fallback.

**Dead components.** `BackendSelector.svelte` and `ModelSelector.svelte` have no references
anywhere in `src/`. Delete them alongside `ModelReasoningSelector.svelte` rather than leaving
three unused components that look like they select models.
