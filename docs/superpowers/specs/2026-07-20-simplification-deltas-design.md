# Simplification Deltas — Preview Removal, Skills Flat List, Context Restyle

**Date:** 2026-07-20
**Status:** Approved by Bruno (pending spec review)
**Owner:** Bruno Galvão
**Relationship to prior specs:** Extends `2026-06-12-navi-refocus-design.md` after its Phase 1 demolition merged to main (merge `bff8504`). **Supersedes that spec's §7 (Phase 5 — Preview fix)**: instead of fixing the native preview path, this spec deletes the entire code-running preview apparatus. The old spec's §7 gets a status note pointing here.

## 1. Goal

Three further cuts/cleanups, decided 2026-07-20:

- **Delta A — Preview stack removal.** Navi stops running, proxying, or port-managing dev servers entirely. The existing **browser** extension panel becomes the only preview surface: paste any URL (including localhost servers the user starts themselves), plus render local files (markdown, images, HTML). Inline file preview in chat is untouched.
- **Delta B — Skills UI simplification.** The marketplace, import wizard, library browser, and in-app skill editor die. What remains: one flat panel listing skills from `~/.claude/skills/` and `.claude/skills/`, with **per-project** enable/disable, open-folder, and delete.
- **Delta C — Context panel restyle.** No functional change; reskin `ContextPanel.svelte` to match the app's design language (git/files panels: accent tokens, spacing, typography).

**Non-goals:** any new preview capability (no dev-server spawn "lite"), skill creation/editing UI (users edit files or ask the agent), context panel feature changes, touching inline chat file rendering.

## 2. Evidence base (measured 2026-07-20, post-demolition main)

Preview stack, server side (~4.9k LoC): `services/native-preview.ts` 1650, `services/port-manager-preview.ts` 748, `services/port-fixer.ts` 561 (LLM port arbitration), `routes/preview-proxy.ts` 636, `routes/container-preview.ts` 361, `routes/native-preview.ts` 239, `routes/port-manager-preview.ts` 143, `routes/worktree-preview.ts` 306, plus `services/preview/` (container-manager, framework/runtime detectors, proxy-manager, spec, branch indicator injection — ~2k more).

Preview stack, frontend (~2.3k LoC): `NativePreviewPanel.svelte` 1075, `ContainerPreviewPanel.svelte` 515, `PortManagerPreviewPanel.svelte` 395, `PreviewPanel.svelte` 173, `StreamingPreview.svelte` 143, `PreviewButton.svelte`, plus App.svelte preview state and the `preview`/`preview-unified` registry entries.

Skills UI (~3.5k LoC): `SkillLibrary.svelte` 1177, `ProjectSkillSelector.svelte` 587, `routes/marketplace.ts` 573, `SkillMarketplace.svelte` 442, `SkillCommandInstall.svelte` 266, plus `SkillImport.svelte`, `SkillEditor.svelte`, `SkillsAndAgentsLibrary.svelte`, `SkillCard.svelte`; `server/skills.ts` 450 (partially kept).

Context: `ContextPanel.svelte` 465 (restyle only).

Existing browser surface: `browser` extension (registry id `browser`, panelMode `browser`, default-enabled) already renders URLs; `browser-preview` registry entry is an unimplemented placeholder.

## 3. Delta A — Preview stack removal

**Delete (server):** all eight preview files listed in §2 plus the `services/preview/` directory. `routes/worktree-preview.ts` is expected to go with them; the plan's inventory step must confirm nothing outside the preview stack imports it — if the git/worktree feature depends on it, that dependency is extracted, not kept via the preview route.

**Delete (frontend):** the five preview panels, `PreviewButton`, `preview` and `preview-unified` registry entries and panel modes, App.svelte preview state/handlers, and the `browser-preview` placeholder registry entry.

**Keep/extend — the browser panel:**
- URL bar + iframe/webview, as today. No proxying: localhost URLs load directly; whatever the user runs, they run themselves (terminal panel still exists for that).
- **Local file rendering:** the panel accepts a file path (from the file tree's "preview" affordance or a chat link) and renders markdown (existing renderer), images, and HTML. Server side this needs at most one small static-file endpoint if the existing files API can't serve raw bytes with content-type — prefer reusing the files API.
- Failure states are the browser's own (iframe load error → simple message + retry). No log buffers, no restart buttons — there is no process to manage.

**DB/config:** remove preview-related per-project settings columns/keys if any exist (inventory step enumerates; same `dropLegacyTables()`/one-shot cleanup mechanism as Phase 1).

Exit: zero dev-server/port/proxy/container code in the repo; browser panel renders a URL and a local markdown file; typecheck + tests + smoke green.

## 4. Delta B — Skills flat list

**Delete:** `SkillMarketplace.svelte`, `SkillCommandInstall.svelte`, `SkillImport.svelte`, `SkillLibrary.svelte`, `SkillsAndAgentsLibrary.svelte`, `SkillEditor.svelte`, `routes/marketplace.ts` and its registration/mentions in `server/index.ts` and `src/lib/api.ts`.

**Replace with one panel (`SkillsPanel`):**
- Lists skills discovered from `~/.claude/skills/` (global) and `<project>/.claude/skills/` (project), labeled by origin. Reuse `SkillCard.svelte` if it survives simplification cheaply; otherwise plain rows.
- **Per-project enable/disable toggle** (the surviving job of `ProjectSkillSelector`; the component itself is absorbed/deleted). Persistence stays wherever it lives today (skills table / project settings) — the plan's inventory step confirms the current mechanism and keeps it.
- Open folder (reveal in Finder), delete (with confirm — destructive).
- No install, no browse, no editor, no wizard.

**Server:** `server/skills.ts` slims to discovery/list, per-project toggle, delete, and whatever hash/sync the agent-SDK wiring genuinely needs (inventory before cutting).

Exit: marketplace route gone; one panel does list/toggle/open/delete; toggling a skill off for a project actually excludes it from that project's sessions.

## 5. Delta C — Context panel restyle

Pure presentation pass on `ContextPanel.svelte` (and any child components): adopt the accent-color tokens, spacing, and type scale used by the git and files panels. No store, API, or behavior changes. Exit: visual parity with sibling panels; diff shows markup/class changes only.

## 6. Mechanics

Same method as Phase 1, which worked: a fresh git worktree branch (the live checkout serves Bruno's running app), one commit per delta (Delta A may split server/frontend), `bun run check` + `bun test server/ shared/` + `scripts/smoke.sh` green before every commit, docs (`CLAUDE.md`, `docs/STATUS.md`) updated in a final commit. Backend restart is Bruno's, at merge time.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Preview code entangled with terminal/processes panels | Inventory-first per file; grep gates like Phase 1 tasks |
| `worktree-preview` secretly load-bearing for git feature | Explicit inventory step; extract dependency if found |
| Per-project skill toggle regresses SDK session wiring | Keep existing persistence/lookup path; test a session with a disabled skill |
| Losing wanted marketplace installs | None needed — installing a skill is `git clone`/copy into `.claude/skills/`, documented in STATUS.md |

## 8. Out of scope (explicitly)

Everything in the refocus spec's remaining phases (gateway hardening, session stabilization, workflow engine rebuild) — unchanged and still pending. New browser-panel features beyond URL + local file rendering. Skill authoring tools.
