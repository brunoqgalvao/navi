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

Preview stack, server side (~5k LoC): `services/native-preview.ts` 1650, `services/port-manager-preview.ts` 748, `services/port-fixer.ts` 561 (LLM port arbitration), `routes/port-fixer.ts` 120, `routes/preview-proxy.ts` 636, `routes/container-preview.ts` 361, `routes/native-preview.ts` 239, `routes/port-manager-preview.ts` 143, `routes/worktree-preview.ts` 306, plus `services/preview/` (container-manager, framework/runtime detectors, proxy-manager, spec, branch indicator injection — 2323 more).

Preview stack, frontend (~2.3k LoC): `NativePreviewPanel.svelte` 1075, `ContainerPreviewPanel.svelte` 515, `PortManagerPreviewPanel.svelte` 395, `PreviewPanel.svelte` 173, `StreamingPreview.svelte` 143, `PreviewButton.svelte`, plus App.svelte preview state and the `preview`/`preview-unified` registry entries.

Skills UI (~3.5k LoC): `SkillLibrary.svelte` 1177, `ProjectSkillSelector.svelte` 587, `routes/marketplace.ts` 573, `SkillMarketplace.svelte` 442, `SkillCommandInstall.svelte` 266, plus `SkillImport.svelte`, `SkillEditor.svelte`, `SkillsAndAgentsLibrary.svelte`, `SkillCard.svelte`; `server/skills.ts` 450 (partially kept).

Context: `ContextPanel.svelte` 465 (restyle only).

Existing browser surface: `browser` extension (registry id `browser`, panelMode `browser`, default-enabled) already renders URLs; `browser-preview` registry entry is an unimplemented placeholder.

## 3. Delta A — Preview stack removal

**Delete (server):** all nine preview files listed in §2 plus the `services/preview/` directory. Known dependents to unhook (found 2026-07-20; the inventory step re-verifies): `routes/worktrees.ts` imports `cleanupWorktreePreview` from `worktree-preview.ts` (extract or drop that call, don't keep the route for it); `routes/sessions.ts` calls `nativePreviewService.stopForSession` in session lifecycle; `routes/background-processes.ts` lazily imports `services/preview`; `server/index.ts` registers the preview/port-fixer routes.

**Delete (frontend):** the five preview panels, `PreviewButton`, `preview` and `preview-unified` registry entries and panel modes, App.svelte preview state/handlers (including the `"preview"`/`"preview-unified"` members of the panel-mode unions in `App.svelte` and `src/lib/layout/RightPanel.svelte`), and the `browser-preview` placeholder registry entry.

**Keep — explicitly NOT deleted despite the name:** `src/lib/Preview.svelte` (1961 LoC) and `src/lib/components/WorkspacePanel.svelte` — this pair IS the browser panel (RightPanel renders it for `mode === "browser"`). It already renders URLs, markdown, images, HTML, JSON, and 3D files via the existing files API. Do not confuse it with `PreviewPanel.svelte` (173 LoC, delete list).

**Keep/extend — the browser panel:**
- URL bar + iframe/webview, as today. No proxying: localhost URLs load directly; whatever the user runs, they run themselves (terminal panel still exists for that).
- **Local file rendering:** already built in `Preview.svelte` (fetches content through the files API — no new endpoint needed). The work here is subtraction only: strip any dev-server/preview-stack couplings from `Preview.svelte`/`WorkspacePanel.svelte` if the inventory finds them.
- Failure states are the browser's own (iframe load error → simple message + retry). No log buffers, no restart buttons — there is no process to manage.

**DB/config:** remove preview-related per-project settings columns/keys if any exist (inventory step enumerates; same `dropLegacyTables()`/one-shot cleanup mechanism as Phase 1).

Exit: zero dev-server/port/proxy/container code in the repo; browser panel renders a URL and a local markdown file; typecheck + tests + smoke green.

## 4. Delta B — Skills flat list

**Delete:** `SkillMarketplace.svelte`, `SkillCommandInstall.svelte`, `SkillImport.svelte`, `SkillLibrary.svelte`, `SkillsAndAgentsLibrary.svelte`, `SkillEditor.svelte`, `routes/marketplace.ts` and its registration/mentions in `server/index.ts` and `src/lib/api.ts`.

**Replace with one panel (`SkillsPanel`):**
- Lists skills discovered from `~/.claude/skills/` (global) and `<project>/.claude/skills/` (project), labeled by origin. Reuse `SkillCard.svelte` if it survives simplification cheaply; otherwise plain rows.
- **Per-project enable/disable toggle** (the surviving job of `ProjectSkillSelector`; the component itself is absorbed/deleted). Persistence already exists and is kept as-is: `enabledSkillsDb` with `global`/`project` scopes, served by `server/routes/skills.ts`.
- Open folder (reveal in Finder), delete (with confirm — destructive).
- No install, no browse, no editor, no wizard.

**Server:** two files in scope. `server/routes/skills.ts` (1605 LoC) is the main surface and the home of the per-project toggle mechanism (`enabledSkillsDb.get(skill.id, "project", projectId)`) — trim it to list/toggle/delete endpoints, keeping the toggle path intact. `server/skills.ts` (450 LoC) slims to discovery plus whatever hash/sync the agent-SDK wiring genuinely needs (inventory before cutting).

Exit: marketplace route gone; one panel does list/toggle/open/delete; toggling a skill off for a project actually excludes it from that project's sessions.

## 5. Delta C — Context panel restyle

Pure presentation pass on `ContextPanel.svelte` (and any child components): adopt the accent-color tokens, spacing, and type scale used by the git and files panels. No store, API, or behavior changes. Exit: visual parity with sibling panels; diff shows markup/class changes only.

## 6. Mechanics

Same method as Phase 1, which worked: a fresh git worktree branch (the live checkout serves Bruno's running app), one commit per delta (Delta A may split server/frontend), `bun run check` + `bun test server/ shared/` + `scripts/smoke.sh` green before every commit, docs (`CLAUDE.md`, `docs/STATUS.md`) updated in a final commit. Backend restart is Bruno's, at merge time.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Preview code entangled with terminal/processes panels | Inventory-first per file; grep gates like Phase 1 tasks; known lazy import in `routes/background-processes.ts` |
| Session lifecycle hook regression | `routes/sessions.ts` calls `nativePreviewService.stopForSession` — remove the call site explicitly, verify session close still clean |
| `worktree-preview` secretly load-bearing for git feature | Known: `routes/worktrees.ts` imports `cleanupWorktreePreview`; extract or drop that dependency, verified by inventory |
| Per-project skill toggle regresses SDK session wiring | Keep existing persistence/lookup path; test a session with a disabled skill |
| Losing wanted marketplace installs | None needed — installing a skill is `git clone`/copy into `.claude/skills/`, documented in STATUS.md |

## 8. Execution errata (2026-07-21)

Found while executing; the plan deviated from the letter of §3 in these ways:

- `StreamingPreview.svelte` is the **chat streaming renderer** (in-flight assistant blocks), not preview-stack code — misclassified by name in §2. It was **kept**.
- The RightPanel/App panel-mode member `"preview"` is the files+Preview split view (file preview). Only `"preview-unified"` was removed.
- Two additional consumers surfaced and were handled: `Settings.svelte` had a whole "Previews" tab (container preview management — removed) and `WorktreeHeader.svelte` (preview start/stop per worktree) turned out to have zero importers and was deleted as an orphan.
- `main.ts` injected the branch-indicator script from the preview stack — removed.

## 9. Out of scope (explicitly)

Everything in the refocus spec's remaining phases (gateway hardening, session stabilization, workflow engine rebuild) — unchanged and still pending. New browser-panel features beyond URL + local file rendering. Skill authoring tools.
