# Spawn Spike Results

**Date:** 2026-06-12  
**Script:** `scripts/spike-spawn.ts`  
**Result:** PASS

## Setup

- CWD: `/tmp/navi-spike-spawn`
- Root session: Claude (claude-fable-5, permissionMode=acceptAll, mcpServers=[navi-spawn])
- Child session: Codex (spawned by Claude via spawn_agent MCP tool)
- Control server: Bun.serve on random loopback port (51513 in this run)

## What Happened

1. Claude session started. MCP server `navi-spawn` injected via stdio proxy.
2. Claude called `ToolSearch` (discovering available MCP tools).
3. Claude called `mcp__navi-spawn__spawn_agent` → codex agent spawned (id: `94e4b35f-4128-4958-8663-ecc2faf09f16`).
4. Claude called `mcp__navi-spawn__get_agent_result` twice — first returned `{status: "running"}`.
5. Claude called `Bash` to verify the file on disk (file was already there).
6. Claude called `mcp__navi-spawn__get_agent_result` a final time → `{status: "done"}`.
7. Claude's final text described the outcome correctly.

## Checks (all passed)

| Check | Result |
|---|---|
| spawnCalled | true |
| getResultCalled | true |
| hasChildAgent (1 agent in tree) | true |
| add.py exists | true |
| add.py contains `def add(a, b)` | true |
| claude mentions outcome | true |
| no error events | true |

## add.py Content

```python
def add(a, b):
    return a + b
```

## Token Usage

- inputTokens: 13,408 — outputTokens: 1,189 — costUsd: $0.93961

## Observations

- Claude SDK (`claude-fable-5`) correctly prefixes MCP tool names as `mcp__navi-spawn__spawn_agent` etc.
- The stdio proxy (`mcp-stdio.ts`) + control server architecture works correctly for bridging the out-of-process MCP boundary.
- The tree correctly tracks child agent status and exposes it via `get_agent_result`.
- No permission bubbling was observed in this run (codex ran with `acceptAll` mode from the inherited default).
- The `spawnServerConfigFor` helper correctly wired `NAVI_SPAWN_URL` and `NAVI_SPAWN_TOKEN` env vars into the stdio process.
