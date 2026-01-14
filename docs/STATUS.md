# Navi Feature Status

> Feature inventory and status tracking

Last updated: January 11, 2026

---

## Feature Categories

| Status | Meaning |
|--------|---------|
| **CORE** | Essential, actively maintained |
| **STABLE** | Working, low maintenance |
| **EXPERIMENTAL** | In development, may change or be removed |
| **DEPRECATED** | Scheduled for removal |

---

## CORE Features

These are essential to Navi's operation.

### Sessions & Projects
| Feature | Location | Notes |
|---------|----------|-------|
| Session management | `routes/sessions.ts`, `services/session-manager.ts` | Chat sessions |
| Project management | `routes/projects.ts` | Workspaces |
| Messages | `routes/messages.ts` | Chat history |
| WebSocket handler | `websocket/handler.ts` | Real-time communication |

### File System & Terminal
| Feature | Location | Notes |
|---------|----------|-------|
| File browser | `routes/filesystem.ts` | Read/write files |
| Terminal/PTY | `routes/terminal.ts` | Shell integration |
| Background processes | `routes/background-processes.ts` | Process management |

### Git Integration
| Feature | Location | Notes |
|---------|----------|-------|
| Git operations | `routes/git.ts` | Status, commit, branch, etc. |
| Git UI | `features/git/` | Frontend components |
| Worktrees | `routes/worktrees.ts` | Git worktree management |

### Skills System
| Feature | Location | Notes |
|---------|----------|-------|
| Skill loader | `routes/skills.ts` | Load from `.claude/skills/` |
| Core skills | See skills table below | |

### Preview System
| Feature | Location | Notes |
|---------|----------|-------|
| Native preview | `services/native-preview.ts` | Dev server preview |
| Preview proxy | `routes/preview-proxy.ts` | Proxy for previews |
| Container preview | `routes/container-preview.ts` | Docker previews |

---

## STABLE Features

Working features that don't need active development.

### UI Components
| Feature | Location | Notes |
|---------|----------|-------|
| Chat input/view | `components/ChatInput.svelte`, `ChatView.svelte` | Main chat interface |
| Sidebar | `components/sidebar/Sidebar.svelte` | Navigation |
| Settings | `components/Settings.svelte` | App configuration |
| Extensions panel | `features/extensions/` | Right panel tabs |

### Kanban
| Feature | Location | Notes |
|---------|----------|-------|
| Task board | `features/kanban/` | Task management |
| Kanban API | `routes/kanban.ts` | Backend |

### Commands
| Feature | Location | Notes |
|---------|----------|-------|
| Slash commands | `routes/commands.ts` | `/command` system |
| Command UI | `features/commands/` | Frontend |

---

## EXPERIMENTAL Features

**These features are in development. They may be incomplete, buggy, or removed.**

### Proactive Hooks System
**Status:** EXPERIMENTAL - Future development

| Component | Location | Purpose |
|-----------|----------|---------|
| Analyzer | `features/proactive-hooks/analyzer.ts` | Analyze chat for suggestions |
| Runner | `features/proactive-hooks/runner.ts` | Execute hook actions |
| Error detector | `features/proactive-hooks/hooks/error-detector.ts` | Auto-detect errors |
| Memory builder | `features/proactive-hooks/hooks/memory-builder.ts` | Build context memory |
| Skill scout | `features/proactive-hooks/hooks/skill-scout.ts` | Suggest skills |
| Suggestion UI | `features/proactive-hooks/components/` | Toast notifications |
| Backend | `routes/proactive-hooks.ts` | API endpoints |

**Goal:** AI-driven suggestions based on chat context.

---

### Sessions Board
**Status:** EXPERIMENTAL - Future development

| Component | Location | Purpose |
|-----------|----------|---------|
| Board view | `features/sessions-board/components/SessionsBoard.svelte` | Visual session layout |
| Column view | `features/sessions-board/components/BoardColumn.svelte` | Kanban columns |
| Session cards | `features/sessions-board/components/SessionCard.svelte` | Card UI |
| Backend | `routes/sessions-board.ts` | API endpoints |

**Goal:** Visual management of multiple sessions.

---

### Ensemble Consensus
**Status:** EXPERIMENTAL - Future development

| Component | Location | Purpose |
|-----------|----------|---------|
| Skill | `.claude/skills/ensemble-consensus/` | Multi-LLM voting |
| Runner | `.claude/skills/ensemble-consensus/index.ts` | Execute across models |

**Goal:** Run prompts through multiple LLMs and synthesize best answer.

---

### Loop Mode
**Status:** EXPERIMENTAL - Default OFF

| Component | Location | Purpose |
|-----------|----------|---------|
| Feature flag | `stores/ui.ts` (`loopModeEnabled`) | Toggle in Settings |
| UI toggle | `components/ChatInput.svelte` | Button in chat input |
| Handler | `handlers/useMessageHandler.ts` | Until-done iteration logic |

**Enable:** Settings → Experimental → Loop Mode

**Goal:** Allow Claude to continue working automatically until a task is complete.

---

### Deploy to Cloud
**Status:** EXPERIMENTAL - Default OFF

| Component | Location | Purpose |
|-----------|----------|---------|
| Feature flag | `stores/ui.ts` (`deployToCloudEnabled`) | Toggle in Settings |
| Routes | `routes/deploy.ts` | API endpoints for deployment |
| Skill | `.claude/skills/ship-it/` | "Ship it" deployment skill |

**Enable:** Settings → Experimental → Deploy to Cloud

**Goal:** Deploy apps to Navi Cloud (`*.usenavi.app`) with zero configuration.

---

## DEPRECATED / TO REMOVE

These features are candidates for removal.

### E2B Cloud Execution
| Component | Location | Notes |
|-----------|----------|-------|
| E2B executor | `services/e2b-executor.ts` | Cloud sandbox execution |
| Cloud routes | `routes/cloud-execution.ts` | API |
| Toggle UI | `components/CloudExecutionToggle.svelte` | |
| Status UI | `components/CloudExecutionStatus.svelte` | |

**Reason:** Navi Cloud pivot makes this obsolete.

---

### Experimental Agents Framework
| Component | Location | Notes |
|-----------|----------|-------|
| Experimental agents | `services/experimental-agents.ts` | 649 lines |
| Experimental routes | `routes/experimental.ts` | 395 lines |
| Agents panel | `components/agents/ExperimentalAgentsPanel.svelte` | |
| Quick buttons | `components/agents/QuickAgentButtons.svelte` | |
| Self-healing widget | `components/agents/SelfHealingWidget.svelte` | |

**Reason:** Overlaps with multi-session agents, unclear purpose.

---

### Self-Healing Builds
| Component | Location | Notes |
|-----------|----------|-------|
| Self-healing service | `services/self-healing-builds.ts` | 641 lines |

**Reason:** Premature optimization, complex.

---

## CORE Features (continued)

### Multi-Agent System
**Status:** CORE - Production-ready hierarchical agent coordination

A sophisticated system for spawning and coordinating multiple AI agents working in parallel.

| Component | Location | Purpose |
|-----------|----------|---------|
| Session hierarchy | `routes/session-hierarchy.ts` | Parent-child session management |
| Multi-session tools | `services/multi-session-tools.ts` | Agent communication (spawn, escalate, deliver) |
| Child sessions UI | `features/session-hierarchy/` | Real-time hierarchy visualization |
| Agent loader | `services/agent-loader.ts` | Load agents from `.claude/agents/*.md` |

**Key capabilities:**
- Spawn child agents for parallel subtasks (depth limit: 3)
- Inter-agent communication (get_context, log_decision, escalate, deliver)
- Shared decisions and artifacts across hierarchy
- Specialized native UIs for agent types (browser, coding, runner)

---

### OAuth Integrations
**Status:** STABLE - Keep

| Component | Location | Purpose |
|-----------|----------|---------|
| OAuth framework | `server/integrations/` | OAuth2 flow handling |
| Integrations routes | `routes/integrations.ts` | API endpoints |
| Settings UI | `components/IntegrationSettings.svelte` | Connection management |
| Integrations skill | `.claude/skills/integrations/` | Gmail, Sheets, Drive access |

---

### Backend Selector
**Status:** STABLE - Keep (multi-model support)

| Component | Location | Purpose |
|-----------|----------|---------|
| Backends routes | `routes/backends.ts` | API for model selection |
| Backends folder | `server/backends/` | Provider implementations |
| Selector UI | `components/BackendSelector.svelte` | Model picker UI |

---

## EXPERIMENTAL Features (continued)

### Email Feature
**Status:** EXPERIMENTAL - AgentMail integration for autonomous agent email

| Component | Location | Purpose |
|-----------|----------|---------|
| Email routes | `routes/email.ts` | Email API |
| Email feature | `features/email/` | Frontend |
| Email widget | `components/widgets/EmailNotificationWidget.svelte` | Notifications |

---

### Browser Integration
**Status:** EXPERIMENTAL - Backend for browser-use skill

| Component | Location | Purpose |
|-----------|----------|---------|
| Browser routes | `routes/browser.ts` | API for browser-use Python skill |
| Browser widget | `components/widgets/BrowserActionWidget.svelte` | Task status UI |
| Browser-email init | `features/browser-email-init.ts` | Initialization |

---

## TO REMOVE

### Channels System
**Status:** CUT - Remove

| Component | Location |
|-----------|----------|
| Channels routes | `routes/channels.ts` |
| Channels feature | `features/channels/` |

---

### Plugins System
**Status:** CUT - Remove (redundant with skills/extensions)

| Component | Location |
|-----------|----------|
| Plugins routes | `routes/plugins.ts` |
| Plugins feature | `features/plugins/` |

---

## Skills Inventory

### Core Skills (Keep)
| Skill | Purpose | Status |
|-------|---------|--------|
| `playwright` | Browser automation | STABLE |
| `navi` | Control Navi from Claude | STABLE |
| `stock-compare` | Stock charts in chat | STABLE |
| `project-template` | Project scaffolding | STABLE |
| `ship-it` | Deploy to Navi Cloud | STABLE |

### Utility Skills (Keep)
| Skill | Purpose | Status |
|-------|---------|--------|
| `navi-llm` | Dispatch to other LLMs | STABLE |
| `nano-banana-image-gen` | Image generation | STABLE |
| `codex` | OpenAI Codex CLI | STABLE |
| `gemini-cli` | Google Gemini CLI | STABLE |

### Experimental Skills
| Skill | Purpose | Status |
|-------|---------|--------|
| `browser-agent` | CDP browser control | EXPERIMENTAL |
| `browser-use` | Browser-use library | EXPERIMENTAL |
| `canvas-design` | Visual art generation | EXPERIMENTAL |
| `ensemble-consensus` | Multi-LLM voting | EXPERIMENTAL |
| `dashboard` | Custom dashboards | EXPERIMENTAL |
| `web-deploy-quickstart` | Quick deploy | EXPERIMENTAL |

---

## File Cleanup Candidates

### Safe to Remove (Deprecated)

```
# Deprecated routes
packages/navi-app/server/routes/cloud-execution.ts
packages/navi-app/server/routes/experimental.ts

# Deprecated services
packages/navi-app/server/services/e2b-executor.ts
packages/navi-app/server/services/experimental-agents.ts
packages/navi-app/server/services/self-healing-builds.ts

# Deprecated components
packages/navi-app/src/lib/components/CloudExecutionStatus.svelte
packages/navi-app/src/lib/components/CloudExecutionToggle.svelte
packages/navi-app/src/lib/components/agents/ExperimentalAgentsPanel.svelte
packages/navi-app/src/lib/components/agents/QuickAgentButtons.svelte
packages/navi-app/src/lib/components/agents/SelfHealingWidget.svelte
```

### Safe to Remove (Cut Features)

```
# Channels (cut)
packages/navi-app/server/routes/channels.ts
packages/navi-app/src/lib/features/channels/

# Plugins (cut - redundant with skills)
packages/navi-app/server/routes/plugins.ts
packages/navi-app/src/lib/features/plugins/
```

---

## Next Steps

1. ~~**Decide** on IN PROGRESS features~~ ✅ Done
2. **Remove** DEPRECATED code (E2B, self-healing, experimental agents)
3. **Remove** CUT features (channels, browser, plugins)
4. **Mark** EXPERIMENTAL features clearly in UI
5. **Document** remaining features properly

---

*This document should be updated when features change status.*
