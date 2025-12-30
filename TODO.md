# Navi App TODO

## UI Improvements

### Header / Navigation
- [x] Add "Open in..." dropdown menu at the top (similar to Cursor)
  - Finder - open project folder
  - Cursor - open in Cursor IDE
  - Terminal - open terminal at project path
  - VS Code - open in VS Code
  - Copy path - copy project path to clipboard

### Chat View
- [x] Add scroll-to-bottom button when user is not at the end of the conversation
  - Show floating button when scrolled up
  - Hide when at bottom
  - Smooth scroll animation on click

### Chat Input
- [x] Auto-expand textarea on multiline input
  - Grow height as user types multiple lines
  - Max height capped at 4-5 lines
  - Shrink back when content is deleted

### Image Preview
- [x] Close image preview modal with ESC key
  - Add keyboard event listener for Escape key
  - Should close any opened preview image

### Empty State
- [x] Improve empty chat state (currently shows "Continue the conversation..." which is weird for new chats)
  - Better messaging for new vs resumed conversations
  - Maybe show suggestions or quick actions
  - More engaging visual design

## Skills

### Navi Skill
- [x] Add ability to send chat messages (not just create chats)
  - Send messages to existing conversations
  - Support for programmatic chat interactions
  - Endpoint: POST /api/sessions/{id}/messages with { "message": "..." }

## Future Ideas
- [ ] ...

---

## Plugin Integration Roadmap

### Background

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) natively supports plugins, skills, hooks, and MCP servers - but Navi currently only uses manual skill/agent loading. This roadmap outlines the work to leverage the SDK's built-in capabilities.

### Current State

- **Skills**: Manually loaded via `loadAllSkills()` in `query-worker.ts` (~100 lines)
- **Agents**: Manually loaded via `loadAllAgents()` in `query-worker.ts`
- **Plugins**: Not supported
- **Hooks**: Not supported (only `canUseTool` for permissions)
- **MCP Servers**: Not supported

### SDK Capabilities Available

```typescript
query({
  prompt: "...",
  options: {
    plugins: [{ type: 'local', path: '/path/to/plugin' }],
    settingSources: ['user', 'project', 'local'],
    tools: [..., 'Skill'],
    allowedTools: [..., 'Skill'],
    hooks: { PreToolUse: [...], PostToolUse: [...] },
    mcpServers: { "server-name": { command: "node", args: ["server.js"] } }
  }
})
```

### Phase 1: Quick Wins

#### [ ] 1. Use SDK native plugin support
**File**: `packages/navi-app/server/query-worker.ts`

Load plugins from `~/.claude/plugins/installed_plugins.json` and pass to `query()`:

```typescript
function loadInstalledPlugins(projectPath: string): Array<{ type: 'local', path: string }> {
  const registryPath = path.join(os.homedir(), '.claude/plugins/installed_plugins.json');
  if (!fs.existsSync(registryPath)) return [];
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  // Filter for user-scoped + project-scoped plugins
  // Return array of { type: 'local', path: installPath }
}
```

**Impact**: Enables claude-mem, frontend-design, and all CLI-installed plugins

#### [ ] 2. Remove manual skill loading - use SDK instead
**File**: `packages/navi-app/server/query-worker.ts`

**Delete**: `loadAllSkills()`, `loadSkillsFromDir()`, `parseSkillFrontmatter()`, `buildSkillsMetadataPrompt()`

**Add**: `'Skill'` to `tools` and `allowedTools` arrays

**Impact**: ~100 lines deleted, SDK handles skill discovery automatically

#### [ ] 3. Verify plugin loading from installed_plugins.json
Test that plugins are correctly loaded by checking `system.init` message for loaded plugins/skills.

### Phase 2: Enhanced Features

#### [ ] 4. Add native SDK hooks support
Use `hooks` option in `query()` for custom event handling:
- `PreToolUse` - validation before tool execution
- `PostToolUse` - logging/analytics
- `SessionStart`/`SessionEnd` - lifecycle events

#### [ ] 5. Add native SDK MCP server support
Support all three transport types:
- STDIO (external process)
- HTTP/SSE (remote server)
- SDK (in-process)

### Phase 3: UI Features

#### [ ] 6. Add plugin management UI in Navi
**New files**:
- `src/lib/components/PluginManager.svelte`
- `server/routes/plugins.ts`

**Features**:
- List installed plugins
- Enable/disable per project
- Browse marketplaces
- Install from marketplace

**API Routes**:
- `GET /api/plugins` - List installed
- `POST /api/plugins/:id/enable` - Enable
- `GET /api/marketplaces` - Browse
- `POST /api/plugins/install` - Install

### Plugin Architecture Reference

```
~/.claude/plugins/
├── installed_plugins.json      # Registry
├── marketplaces/[name]/        # Cloned repos
└── cache/[marketplace]/[plugin]/[version]/
    ├── .claude-plugin/plugin.json  # Manifest
    ├── skills/                     # SKILL.md files
    ├── agents/                     # Agent .md files
    ├── commands/                   # Slash commands
    ├── hooks/hooks.json            # Hook config
    └── .mcp.json                   # MCP servers
```

### Priority Order

1. **Tasks 1-3**: Plugin + skill loading (enables claude-mem immediately)
2. **Tasks 4-5**: Hooks + MCP (enhanced features)
3. **Task 6**: UI (full plugin management)
