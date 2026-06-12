# Gemini ACP Spike Findings

**CLI version**: gemini 0.24.4  
**Protocol**: Agent Client Protocol (ACP), `--experimental-acp` flag  
**SDK**: @agentclientprotocol/sdk 0.25.0  
**Date**: 2026-06-12  
**Spike script**: packages/gateway/scripts/spike-gemini.ts  

---

## Decision Summary

| Capability | Decision | Evidence |
|---|---|---|
| Permissions | **callback** | `session/request_permission` arrives as server-initiated JSON-RPC request; round-trip confirmed |
| thinkingStream | **true** | `agent_thought_chunk` notifications observed on every turn |
| Resume | **false** | `agentCapabilities.loadSession: false`; `session/load` → -32601 method not found; `session/resume` → -32601 method not found |
| Usage | **omitted** | No `usage_update` notifications observed in any turn |

---

## a. Permissions (callback tier)

`session/request_permission` arrives as a server-initiated JSON-RPC request (has both `id` and `method`, no `result`/`error`). The client must respond with a matching `id`. Confirmed with a `write_file` tool call.

**Raw sample** (incoming from gemini):
```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "session/request_permission",
  "params": {
    "sessionId": "96b33483-38cf-4f0a-83a2-0068f631a04f",
    "options": [
      { "optionId": "proceed_always", "name": "Allow All Edits", "kind": "allow_always" },
      { "optionId": "proceed_once",   "name": "Allow",          "kind": "allow_once"  },
      { "optionId": "cancel",         "name": "Reject",         "kind": "reject_once" }
    ],
    "toolCall": {
      "toolCallId": "write_file-1781297128764",
      "status": "pending",
      "title": "write_file",
      "content": [],
      "locations": [],
      "kind": "file"
    }
  }
}
```

**Correct allow response** (client → gemini):
```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "outcome": { "outcome": "selected", "optionId": "proceed_once" }
  }
}
```

**Correct deny/cancel response**:
```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "outcome": { "outcome": "cancelled" }
  }
}
```

**Notes**:
- `options` array is dynamic; the `optionId` values vary by context:
  - `proceed_once` = allow once
  - `proceed_always` = allow always (for this tool)
  - `proceed_always_server` = allow always for MCP server
  - `proceed_always_tool` = allow always for this tool name
  - `cancel` = reject
- Gateway mapping: `allow` → `proceed_once`; `allow-session` → `proceed_always`; `deny` → `cancel`
- `allowedTools` set managed locally in GeminiSession (mirrors codex pattern)
- `permissionMode: acceptAll` → respond automatically with `proceed_always` (first `allow_always` option or fallback to `proceed_once`)

---

## b. Thinking stream

`agent_thought_chunk` notifications stream before and during responses. The `content` field is a `ContentBlock` (`{ type: "text", text: "..." }`).

**Raw sample**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "84c9b47c-7ee3-4a79-a6e6-fd9788bd745f",
    "update": {
      "sessionUpdate": "agent_thought_chunk",
      "content": {
        "type": "text",
        "text": "**Delivering the Solution**\n\nI've crafted a direct response..."
      }
    }
  }
}
```

**`thinkingStream: true`** — emit `thinking-delta` events.

---

## c. Session resume

**Finding: resume is NOT supported in gemini 0.24.4 ACP mode.**

Evidence:
- `agentCapabilities.loadSession: false` in initialize response
- `session/load` → JSON-RPC error -32601 "Method not found": session/load
- `session/resume` → JSON-RPC error -32601 "Method not found": session/resume
- `agentCapabilities.sessionCapabilities` is absent (no `resume` sub-capability)

The `--resume` CLI flag exists for interactive mode but there is no ACP protocol equivalent.  
**`resume: false`** in capabilities.

---

## d. Usage / token reporting

No `usage_update` session notifications were observed in any turn (simple prompt, tool-invoking prompt, multi-turn). The `UsageUpdate` schema (`size`, `used`, optional `cost`) exists in the ACP spec but gemini 0.24.4 does not emit it.

**Decision**: omit usage events; document in capabilities.

---

## Session update types observed

From spike runs:
- `agent_thought_chunk` — thinking deltas, always present
- `agent_message_chunk` — text response deltas
- `tool_call_update` — tool execution progress/result updates

Not observed (but in spec):
- `tool_call` — initial tool call announcement (gemini goes straight to `tool_call_update`)
- `usage_update` — token usage
- `plan` / `plan_update` — not used by gemini

---

## ACP message shapes

### initialize request/response
```json
// request
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": { "protocolVersion": 1, "clientInfo": { "name": "...", "version": "..." }, "clientCapabilities": {} }}

// response
{ "jsonrpc": "2.0", "id": 1, "result": {
  "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": false,
    "promptCapabilities": { "image": true, "audio": true, "embeddedContext": true },
    "mcpCapabilities": { "http": true, "sse": true }
  }
}}
```

### session/new
```json
// request
{ "jsonrpc": "2.0", "id": 2, "method": "session/new",
  "params": { "cwd": "/path/to/dir", "mcpServers": [] }}

// response
{ "jsonrpc": "2.0", "id": 2, "result": { "sessionId": "uuid-here" }}
```

### session/prompt
```json
// request
{ "jsonrpc": "2.0", "id": 3, "method": "session/prompt",
  "params": {
    "sessionId": "uuid-here",
    "prompt": [{ "type": "text", "text": "user message here" }]
  }}

// response (end of turn)
{ "jsonrpc": "2.0", "id": 3, "result": { "stopReason": "end_turn" }}
// other stopReasons: "max_tokens", "cancelled", "refusal"
```

### session/cancel
```json
{ "jsonrpc": "2.0", "method": "session/cancel", "params": { "sessionId": "uuid-here" }}
```
(notification — no response expected)

### agent_message_chunk notification
```json
{ "jsonrpc": "2.0", "method": "session/update",
  "params": { "sessionId": "...", "update": {
    "sessionUpdate": "agent_message_chunk",
    "content": { "type": "text", "text": "Hello! 2+2 equals 4." }
  }}}
```

### agent_thought_chunk notification
```json
{ "jsonrpc": "2.0", "method": "session/update",
  "params": { "sessionId": "...", "update": {
    "sessionUpdate": "agent_thought_chunk",
    "content": { "type": "text", "text": "**Thinking...**\n\n..." }
  }}}
```

### tool_call_update notification
```json
{ "jsonrpc": "2.0", "method": "session/update",
  "params": { "sessionId": "...", "update": {
    "sessionUpdate": "tool_call_update",
    "toolCallId": "write_file-1781297111442",
    "status": "in_progress",
    "title": "write_file",
    "content": [],
    "locations": [{ "path": "/tmp/navi-spike-gemini/hello.txt" }],
    "kind": "file"
  }}}
```

### session/request_permission server request
See section (a) above.

---

## Permission mode mapping

| Gateway permissionMode | ACP behavior |
|---|---|
| `prompt` | Surface `session/request_permission` as `permission-request` event; block until respondToPermission called |
| `acceptEdits` | Auto-accept `allow_always`-kind options for file tools; surface others |
| `acceptAll` | Auto-respond with first `allow_always` option (or `proceed_once` fallback) — explicit user opt-in |
| `readOnly` | Auto-respond with `cancel` to all permission requests |

---

## Live REPL verification (Step 3)

### Test 1: file creation
- Prompt: "create a file hello.txt containing exactly: hello" in `/tmp/navi-spike-gemini`
- `permission-request` emitted for `write_file` tool
- Responded via `respondToPermission(id, "allow")`
- File created successfully: `hello.txt` contains `hello`

### Test 2: resume
- Resume not supported in 0.24.4 ACP (see section c)
- `GeminiBackend.resumeSession` creates a new session (history not restored)
- Documented in capabilities: `resume: false`

---

## Model note

The gemini ACP server uses whatever model is set in `~/.gemini/settings.json` or the CLI `-m` flag. In testing with a stale config (gemini-3-pro-preview), the prompt returned `-32603 Internal error: model no longer available`. The adapter passes `-m gemini-2.5-flash` as the default when no model is specified, matching the working live CLI behavior.

Spawning command: `gemini --experimental-acp -m <model>` where model defaults to `gemini-2.5-flash`.
