# Run settings menu + Codex provider card

**Date:** 2026-08-09
**Status:** Design

## Problem

The composer's model picker (`src/lib/components/ModelReasoningSelector.svelte`) presents
everything at once: an "Intelligence" list of five effort levels, a provider list, and a
second pane of models that expands on hover. Three things are wrong with it.

**The padlocks lie.** Claude, Z.ai and Gemini render a padlock whenever the current chat has
at least one message. Users read that as "not signed in". It actually means "you cannot
change harness mid-conversation" — `canUseProvider` (`ModelReasoningSelector.svelte:159-162`)
compares the target backend against the current one and consults `canChangeBackend`, which
`ChatInput.svelte:1512` derives from `isNewChat`. Nothing about authentication is involved.

**Real unavailability is invisible.** A harness that genuinely cannot run — Gemini CLI not
installed, Z.ai with no API key — is not marked. Z.ai is worse than unmarked: `visibleProviders`
(`ModelReasoningSelector.svelte:93-95`) drops any provider with no models, and
`getConfiguredZaiModels()` (`server/routes/config.ts:18-21`) returns none without a key, so
Z.ai silently disappears from the menu with no explanation and no way to fix it from there.

**Codex cannot be managed at all.** Settings → API Keys has cards for Claude, OpenAI and Z.ai
(`src/lib/components/Settings.svelte:533-868`) and no Codex card. The server already knows
everything needed — `CodexAdapter.detect()` (`server/backends/codex-adapter.ts:353-387`) and
`detectCodexAuthMode()` (`server/routes/backends.ts:69-86`) are joined by
`GET /api/backends/codex/health` (`server/routes/backends.ts:252-258`), which is exposed on
the client as `backendsApi.getCodexHealth()` (`src/lib/api.ts:1730`) and called by nothing.

## Goals

Replace the two-pane flyout with a row-based menu in the shape of Codex's own settings
popover: a short list of labelled rows, each showing its current value and opening a submenu.
Navi carries one axis Codex does not — the harness — so the menu is `Harness / Model / Effort`
rather than Codex's `Model / Effort / Speed`.

Surface real availability with a route to fixing it, and give Codex a Settings card so
"why can't I use this" and "let me fix it" live in the same product.

## Non-goals

- **Fast mode.** The SDK supports it (`settings.fastMode` on `Options.settings`, with
  `fast_mode_state` and `fast_mode_disabled_reason` echoed on results) and Codex's menu has a
  Speed row, but Navi has no speed concept anywhere today and adding one means new plumbing
  through the query path for a feature that only applies to Claude Opus 5 and 4.8. Explicitly
  deferred.
- **Real in-app OAuth.** Claude's "Re-authenticate" button (`Settings.svelte:573-578`) only
  displays `claude auth login` for the user to copy into their own terminal. The Codex card
  matches that pattern rather than fixing it. Wiring Navi's PTY into auth is a separate piece
  of work; the dead `POST /api/auth/login` route (`server/routes/auth.ts:337-373`) is left
  alone.
- **Codex speed control.** `codex exec` has no speed flag; inventing one is out of scope.

## Design

### The menu

A new component, `src/lib/components/RunSettingsMenu.svelte`, replaces
`ModelReasoningSelector.svelte`. A rewrite in place would keep almost nothing: the existing
component's structure is a two-pane hover layout (left pane `:280-341`, nested right pane
`:343-392`) that the row design does not share. The chip trigger (`:254-277`) and the
outside-click/Escape dismissal (`:181-202`, `:235-250`) are the parts worth carrying over.

The chip is unchanged in appearance and stays in the composer toolbar
(`ChatInput.svelte:1507-1516`). Opening it shows:

```
┌────────────────────────────┐
│ Harness    Codex         › │   ← only when the chat is switchable
│ Model      5.6 Sol       › │
│ Effort     Extra High    › │
└────────────────────────────┘
```

Each row is a button showing label, current value, and a chevron. Hovering or focusing a row
opens its submenu beside the menu; clicking a submenu item commits that value and closes
everything. This differs from today, where hovering a provider swaps a pane but only clicking
a *model* commits anything (`selectModel`, `:216-227`) — a distinction that is invisible and
easy to get wrong.

**The harness row appears only when `canChangeBackend` is true.** When the chat already has
messages, the row is omitted and the menu ends with a muted footer line:

```
│ ────────────────────────── │
│ Codex · fixed for this chat│
```

This states the real constraint once, instead of stamping a padlock on three of four rows and
implying an auth problem.

**Harness is a harness, not a brand.** `providerMeta` (`:39-72`) currently lists Claude, Z.ai,
Codex and Gemini as peers, but Claude and Z.ai share `backendId: "claude"` — Z.ai is a set of
models routed through the Claude runtime, not a separate harness. The harness submenu
therefore lists exactly the three real backends (`claude`, `codex`, `gemini`), and Z.ai
appears as a group inside the Claude harness's model list. This also removes a live
inconsistency: today, switching between Claude and Z.ai is silently permitted mid-chat while
the other providers are locked, because they share a backend id.

The model submenu groups by provider with sticky headers, so a user who thinks in brands still
finds "Z.ai → GLM-5.2" without the menu pretending Z.ai is a harness.

**Effort** keeps its five levels and its existing per-harness clamping
(`isReasoningOptionDisabled` `:164-172`, `reasoningDisabledTitle` `:174-179`, `effectiveReasoningEffort`
`:97-103`). Only the presentation changes: a submenu instead of an always-visible list.

### Availability

A new derived store, `src/lib/stores/harness-availability.ts`, joins three existing sources
that are currently never combined:

| Source | Endpoint | Gives |
|---|---|---|
| `backendsApi.list()` | `GET /api/backends` (`server/routes/backends.ts:203-243`) | installed, version, path per backend |
| `backendsApi.getCodexHealth()` | `GET /api/backends/codex/health` (`:252-258`) | Codex auth mode via `codex login status` |
| `api.auth.status()` | `GET /api/auth/status` (`server/routes/auth.ts:165-265`) | `hasZaiKey`, Claude login/API-key state |

It produces, per harness, one of:

- `ready`
- `needs-setup` with a reason (`"Gemini CLI not installed"`, `"No Z.ai API key"`,
  `"Codex not signed in"`)
- `locked-to-chat` — the existing mid-conversation constraint

`needs-setup` harnesses render greyed with the reason and a **Set up** affordance that opens
Settings on the API Keys tab. Z.ai stops vanishing: it renders with `"No Z.ai API key"` and a
way to fix it. `locked-to-chat` is not rendered per-row at all — it is the footer line above.

The store is fetched once on mount and refreshed on the existing `navi:claude-auth-updated`
window event (`Settings.svelte:92-96`), extended to fire for any provider change.

### Settings: the Codex card

The three existing cards are hand-written and duplicated — each repeats a card shell, icon,
status pill, preview row, and its own `showXInput` / `xKeyInput` / `xError` / `savingX` state.
Adding a fourth by copy-paste means ~75 more lines and four more variables in a 1660-line file.

Extract `src/lib/components/settings/ProviderCard.svelte` taking `{ id, name, icon, accent,
description, status, rows, actions }`, port the three existing cards onto it, then add Codex
as a fourth. Porting the existing cards is what makes the extraction worth doing; adding a
card beside three copies would leave the file worse than it is.

The Codex card shows:

- **CLI**: `Installed · 0.146.0` or `Not found`, from `getCodexHealth()`
- **Signed in**: `ChatGPT account` / `API key` / `Not signed in`, from the same call
- **Re-authenticate**: reveals `codex login` in a copy box with an "I've logged in" button that
  re-polls — the same interaction as Claude's (`Settings.svelte:579-609`)

No new server routes. `GET /api/backends/codex/health` already returns everything.

## Testing

Unit tests (`bun test`):

- Availability derivation: each harness resolves to the right state from a given combination
  of backend list, Codex health, and auth status — including Z.ai with and without a key.
- Harness row visibility: present when `canChangeBackend`, absent with a footer otherwise.
- Effort clamping per harness is preserved (Gemini has no Extra High/Max; Codex has no Max).
- Model grouping: Z.ai models appear under the Claude harness, not as their own harness.

Then the existing suite, `bun run check`, and a recorded QA pass driving the sandbox instance:
open the menu on a new chat and confirm three rows; switch harness and model; open the menu on
a chat with messages and confirm the harness row is gone and the footer names the harness;
confirm a `needs-setup` harness shows its reason and its Set up link reaches Settings.

## Risks

**The menu is the only way to change model or harness.** It is rendered by exactly one
consumer (`ChatInput.svelte:1507-1516`), so a regression is total rather than partial. The QA
pass must cover both the new-chat and existing-chat paths before this merges.

**`$effect` auto-selection.** `ModelReasoningSelector.svelte:229-233` calls
`onModelSelect(currentModels[0].value)` whenever no model is selected. Carry this behaviour
across deliberately; dropping it leaves new chats with an empty model.

**Dead components.** `BackendSelector.svelte` and `ModelSelector.svelte` have no references
anywhere in `src/`. Delete them with this change rather than leaving three components that
look like they select models.
