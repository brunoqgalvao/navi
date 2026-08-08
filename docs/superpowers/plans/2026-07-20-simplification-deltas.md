# Simplification Deltas Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the three deltas from `docs/superpowers/specs/2026-07-20-simplification-deltas-design.md`: delete the entire preview/dev-server stack (browser panel survives), collapse the skills UI to one flat panel with per-project toggles, restyle the context panel.

**Architecture:** Pure subtraction plus one small new component (`SkillsPanel.svelte`). Work happens in a git worktree (the main checkout serves Bruno's live app). Each delta is one or two tasks: inventory greps → unhook wiring → delete files → verify → commit.

**Tech Stack:** Bun, Svelte 5, sql.js. Verification per task: `bun run check` (0 errors), `bun test server/ shared/`, `scripts/smoke.sh`.

**Spec:** `docs/superpowers/specs/2026-07-20-simplification-deltas-design.md`

---

## Ground rules

- **Work in the worktree** `.worktrees/simplification-deltas`, never the main checkout.
- Paths are relative to `packages/navi-app/` unless they start with `packages/` or `docs/`.
- **After EVERY task:** `bun run check` 0 errors, `bun test server/ shared/` pass, `scripts/smoke.sh` pass, then commit. Never start the next task red.
- Line numbers drift; locate wiring by identifier with grep.
- **Spec erratum (discovered during planning):** RightPanel/App's panel-mode union member `"preview"` is the **files+Preview split view** (file preview — a keep feature). Only `"preview-unified"` (the dev-server panel) is deleted. Do NOT remove the `"preview"` union member or the `showSplitView` logic.
- **Keep list — never delete:** `src/lib/Preview.svelte`, `src/lib/components/WorkspacePanel.svelte`, the `browser` registry entry, RightPanel `"preview"`/`"files"`/`"browser"` modes, inline chat file rendering, `server/routes/proxy.ts` (external URL proxy — distinct from preview-proxy).

## Chunk 1: Setup + Delta A (preview stack)

### Task 0: Worktree

- [x] **Step 1:**
```bash
cd /Users/brunogalvao/Documents/dev-bruno/claude-code-local-ui
git worktree add .worktrees/simplification-deltas -b simplification-deltas
cd .worktrees/simplification-deltas
bun install
bun install --cwd packages/navi-app
```
- [x] **Step 2: Baseline verify** — `bun run --cwd packages/navi-app check` (0 errors), `bun test server/ shared/` from `packages/navi-app`, `bash packages/navi-app/scripts/smoke.sh`. All green before any deletion.

### Task 1: Delta A — server-side preview stack

**Files:**
- Delete: `server/routes/container-preview.ts`, `server/routes/native-preview.ts`, `server/routes/port-manager-preview.ts`, `server/routes/preview-proxy.ts`, `server/routes/worktree-preview.ts`, `server/routes/port-fixer.ts`, `server/services/native-preview.ts`, `server/services/port-manager-preview.ts`, `server/services/port-fixer.ts`, `server/services/preview/` (whole directory)
- Modify: `server/index.ts`, `server/routes/sessions.ts`, `server/routes/worktrees.ts`, `server/routes/background-processes.ts`

- [x] **Step 1: Inventory.** `grep -rn "native-preview\|container-preview\|port-manager-preview\|port-fixer\|preview-proxy\|worktree-preview\|services/preview" server/ shared/ --include="*.ts"` — every hit must be in a deleted file or a modify-listed file. Any surprise hit: stop, add it to this task, then proceed.
- [x] **Step 2: Unhook `server/index.ts`** — remove the six route imports (`handleWorktreePreviewRoutes`, `handleContainerPreviewRoutes`, `handleNativePreviewRoutes`, `handlePreviewProxyRoutes`, `handlePortManagerPreviewRoutes`, `handlePortFixerRoutes`) and their dispatch blocks, and the `nativePreviewService` health-status block (`activePreviews`).
- [x] **Step 3: Unhook `server/routes/sessions.ts`** — remove the `nativePreviewService.stopForSession(id)` call and its import.
- [x] **Step 4: Unhook `server/routes/worktrees.ts`** — remove `cleanupWorktreePreview` import and call sites (worktree cleanup proceeds without preview teardown; there is no preview to tear down).
- [x] **Step 5: Unhook `server/routes/background-processes.ts`** — remove the lazy `import("./services/preview" …)` call sites and any code paths that only served preview process management.
- [x] **Step 6: Delete the ten files/dir.** `git rm -r` each.
- [x] **Step 7: Rerun the Step 1 grep** — zero non-test hits (docs/plan hits fine).
- [x] **Step 8: Verify + commit** — `bun run check`, `bun test server/ shared/`, `scripts/smoke.sh`; `git commit -m "deltas: remove server-side preview/dev-server stack"`.

### Task 2: Delta A — frontend preview panels

**Files:**
- Delete: `src/lib/components/NativePreviewPanel.svelte`, `src/lib/components/ContainerPreviewPanel.svelte`, `src/lib/components/PortManagerPreviewPanel.svelte`, `src/lib/components/PreviewPanel.svelte`, `src/lib/components/StreamingPreview.svelte`, `src/lib/components/PreviewButton.svelte` (if unused elsewhere — inventory decides)
- Modify: `src/lib/layout/RightPanel.svelte`, `src/lib/components/ChatView.svelte`, `src/App.svelte`, `src/lib/core/registries.ts`, `src/lib/core/types.ts`, `src/lib/features/extensions/registry.ts`, `src/lib/api.ts`, `src/lib/Preview.svelte` (keep file, but fix proxy coupling)

- [x] **Step 1: Inventory.** `grep -rn "PreviewPanel\|StreamingPreview\|PreviewButton\|preview-unified\|containerPreviewUrl\|browser-preview\|preview-proxy\|api/preview" src/` — hits must fall in delete/modify-listed files.
- [x] **Step 2: RightPanel** — remove `PreviewPanel` import, the `"preview-unified"` union member and its render branch, and container-preview props (`containerPreviewUrl`, `worktreeBranch` if preview-only). Keep `"preview"` mode + split view + `Preview.svelte` import.
- [x] **Step 3: ChatView** — remove `StreamingPreview` import and its render site.
- [x] **Step 4: App.svelte** — remove `"preview-unified"` from `RightPanelMode`, preview-stack state/handlers (container/native/port-manager URLs, preview start/stop calls). Keep file-preview (`previewSource`) plumbing and `"preview"` mode.
- [x] **Step 5: Registries** — in `src/lib/core/registries.ts` delete the `preview` entry (panelMode `preview-unified`) and the `browser-preview` placeholder; mirror in `src/lib/features/extensions/registry.ts`.
- [x] **Step 6: api.ts** — remove client sections for native/container/port-manager preview and port-fixer endpoints.
- [x] **Step 6b: Preview.svelte proxy fix (review finding)** — `getProxiedUrl` routes localhost URLs through the deleted `/api/preview/proxy/:port` route; change the local-URL branch to return the URL unchanged (drop inspector-injection proxying). Grep `api/preview` afterwards → zero hits.
- [x] **Step 6c: core/types.ts** — remove the `"preview-unified"` and `"browser-preview"` union members (keep `"preview"`).
- [x] **Step 7: Delete component files**, rerun Step 1 grep — zero hits outside keeps.
- [x] **Step 8: Verify + commit** — gates; `git commit -m "deltas: remove frontend preview panels; browser panel is the only preview surface"`.

## Chunk 2: Delta B (skills) + Delta C (context) + docs

### Task 3: Delta B — server: marketplace route + skills trim

**Files:**
- Delete: `server/routes/marketplace.ts`
- Modify: `server/index.ts`, `server/routes/skills.ts`, `server/skills.ts`

- [x] **Step 1: Inventory.** `grep -rn "marketplace\|Marketplace" server/ shared/ --include="*.ts"` and note handlers in `routes/skills.ts` for: `/import`, `/import-url`, `/generate`, `/examples`, `/export`, `/categories`.
- [x] **Step 2: Delete `routes/marketplace.ts`**; remove its import + dispatch in `server/index.ts`.
- [x] **Step 3: Trim `routes/skills.ts`** — delete the `/api/skills/import`, `/import-url`, `/generate`, `/examples`, `/:id/export`, `/categories` handlers and their now-unused helpers/imports. **Keep:** list, `/:id` GET/DELETE, `/document`, `/files`, `/open`, `/:id/sync`, `/sync-global`, `/scan`, `/enabled`, `/global`, `/default-enabled`, `/:id/enable`, `/projects/:id/skills(/…/enable)` — the toggle path (`enabledSkillsDb`) stays byte-identical.
- [x] **Step 4: Trim `server/skills.ts`** of helpers only the deleted handlers used (grep each exported symbol before cutting; keep discovery/hash/sync used by agent-SDK wiring).
- [x] **Step 5: Verify + commit** — gates; `git commit -m "deltas: remove skills marketplace/import/generate server surface"`.

### Task 4: Delta B — frontend: SkillsPanel replaces the zoo

**Files:**
- Create: `src/lib/components/SkillsPanel.svelte`
- Delete: `src/lib/components/SkillMarketplace.svelte`, `SkillCommandInstall.svelte`, `SkillImport.svelte`, `SkillLibrary.svelte`, `SkillsAndAgentsLibrary.svelte`, `SkillEditor.svelte`, `ProjectSkillSelector.svelte`, `SkillCard.svelte`
- Modify: `src/lib/components/Settings.svelte`, `src/lib/components/ProjectSettings.svelte`, `src/lib/api.ts`

- [x] **Step 1: Write `SkillsPanel.svelte`** — props `{ projectId?: string | null }`. On mount: `skillsApi.list()` (+ project-enabled list when `projectId`). Renders flat rows grouped by origin (Global `~/.claude/skills` / Project `.claude/skills`): name, description, toggle, open-folder button (`/skills/:id/open`), delete button with confirm. Toggle logic: `projectId` ? `skillsApi.enableForProject`/`disableForProject` : the global enable members (check exact names in api.ts — they are `enableGlobal`/`disableGlobal`-style, do not invent new ones). Optimistic updates per house pattern (flip state, revert on catch). Styling: same row/toggle classes as Settings feature toggles.
- [x] **Step 2: Settings.svelte** — replace `SkillLibrary` import/usage with `<SkillsPanel />` (global scope); drop "Skill Library" copy for "Skills".
- [x] **Step 3: ProjectSettings.svelte** — replace `ProjectSkillSelector`/`SkillEditor`/`SkillLibrary` usage and their modal state with `<SkillsPanel projectId={project.id} />`.
- [x] **Step 4: api.ts** — delete `marketplaceApi` and skillsApi members for import/import-url/generate/examples/export/categories; keep list/enable/disable/project-enable/open/delete/document/files/sync.
- [x] **Step 5: Delete the eight components.** Grep gate: `grep -rn "SkillLibrary\|SkillMarketplace\|SkillsAndAgentsLibrary\|SkillImport\|SkillEditor\|SkillCommandInstall\|ProjectSkillSelector\|SkillCard\|marketplaceApi" src/` → zero hits.
- [x] **Step 6: Verify + commit** — gates; `git commit -m "deltas: flat SkillsPanel replaces marketplace/library/editor UI"`.

### Task 5: Delta C — ContextPanel restyle

**Files:**
- Modify: `src/lib/features/context/components/ContextPanel.svelte`

- [x] **Step 1:** Read `src/lib/features/git/components/GitPanel.svelte` (or the files panel) and note its section-header, row, spacing, and accent classes.
- [x] **Step 2:** Restyle ContextPanel markup/classes to match (accent-* tokens, text scale, borders, dark-mode pairs). **No script-block changes** — diff must be template/class only.
- [x] **Step 3: Verify + commit** — full gates (check/test/smoke); `git commit -m "deltas: restyle ContextPanel to house design language"`.

### Task 6: Docs + final sweep

- [x] **Step 1:** Update `CLAUDE.md` (extensions table: drop preview row; feature status; skills section) and `docs/STATUS.md` (move preview stack + skills marketplace to "Removed", note browser panel as the preview surface).
- [x] **Step 2:** Final sweep: `grep -rniE "marketplace|native-preview|port-fixer|preview-unified|container-preview|preview-proxy|api/preview" packages/navi-app/src packages/navi-app/server` → zero hits.
- [x] **Step 3: Verify + commit** — gates; `git commit -m "deltas: docs updated to post-simplification reality"`.

### Task 7: Merge

- [x] Merge `simplification-deltas` into `main` (from the main checkout), rerun `bun run check` on main, notify Bruno to restart the backend, manual smoke in the live app: open browser panel with a URL, preview a markdown file from the file tree, toggle a skill per-project, open context panel.
