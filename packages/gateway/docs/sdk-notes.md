# Claude Agent SDK — Surface Notes

Grounded from `@anthropic-ai/claude-agent-sdk` v0.3.170 (`sdk.d.ts`).

## query()

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

const q: Query = query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options,
});
// Query extends AsyncGenerator<SDKMessage, void>
// q.interrupt()  — abort current turn
// q.close()      — terminate process
```

## Options (fields we use)

| Field | Type | Notes |
|---|---|---|
| `cwd` | `string` | working directory |
| `model` | `string` | e.g. `'claude-opus-4-1'` |
| `resume` | `string` | session UUID to resume |
| `permissionMode` | `PermissionMode` | see below |
| `allowDangerouslySkipPermissions` | `boolean` | required when `permissionMode: 'bypassPermissions'` |
| `canUseTool` | `CanUseTool` | permission callback |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server configs |
| `systemPrompt` | `string \| ...` | custom system prompt (or append to preset) |

## PermissionMode

```ts
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
```

Gateway `SessionOptions.permissionMode` mapping:
- `"prompt"` → SDK `"default"` + `canUseTool` callback wired
- `"acceptEdits"` → SDK `"acceptEdits"` (file edits auto-accepted, Bash still prompts)
- `"acceptAll"` → SDK `"bypassPermissions"` + `allowDangerouslySkipPermissions: true`
- `"readOnly"` → SDK `"plan"` (no tool execution; model can plan/read but not run tools)

Note: `"plan"` in the SDK is a strict no-execution mode. Chosen over `"dontAsk"` for readOnly
because `dontAsk` silently denies, while `plan` makes the constraint explicit to the model.

## CanUseTool callback

```ts
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    title?: string;        // e.g. "Claude wants to run a command"
    displayName?: string;  // e.g. "Run command"
    description?: string;  // subtitle
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;
```

## PermissionResult

```ts
type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[]; toolUseID?: string; decisionClassification?: PermissionDecisionClassification; }
  | { behavior: 'deny'; message: string; interrupt?: boolean; toolUseID?: string; decisionClassification?: PermissionDecisionClassification; };
```

Gateway `PermissionDecision` → SDK `PermissionResult` mapping:
- `"allow"` → `{ behavior: "allow" }`
- `"allow-session"` → `{ behavior: "allow", updatedPermissions: [{ type: 'addRules', rules: [{ toolName }], behavior: 'allow', destination: 'session' }] }` (persists in-session via SDK's own rule engine)
- `"deny"` → `{ behavior: "deny", message: "User denied permission" }`

## SDKMessage Union

```ts
type SDKMessage = SDKAssistantMessage | SDKResultMessage | SDKSystemMessage | SDKPartialAssistantMessage | SDKUserMessage | SDKUserMessageReplay | SDKThinkingTokensMessage | ... (many system subtypes)
```

### SDKSystemMessage (subtype: 'init')
```ts
{
  type: 'system'; subtype: 'init';
  session_id: string;   // ← the backendSessionId we capture
  model: string;
  cwd: string;
  permissionMode: PermissionMode;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  // ...
}
```
→ Emit `session-meta` with `backendSessionId = session_id`, `model`, `cwd`.

### SDKAssistantMessage
```ts
{
  type: 'assistant';
  message: BetaMessage;   // message.content: Array<BetaContentBlock>
  session_id: string;
  error?: SDKAssistantMessageError;
  // ...
}
```
Content blocks:
- `{ type: 'text', text: string, citations: null }` → `text-delta` events (one per block)
- `{ type: 'thinking', thinking: string, signature: string }` → `thinking-delta` events
- `{ type: 'tool_use', id: string, name: string, input: unknown }` → `tool-start` event

### SDKPartialAssistantMessage (streaming deltas)
```ts
{
  type: 'stream_event';
  event: BetaRawMessageStreamEvent;  // content_block_start, content_block_delta, etc.
  session_id: string;
}
```
Only emitted when `options.includePartialMessages: true`. We do NOT enable this —
we use the completed `SDKAssistantMessage` for text/thinking/tool-start, which is simpler
and avoids partial-JSON tool input reconstruction.

### SDKResultMessage (success or error)
```ts
// Success:
{ type: 'result'; subtype: 'success'; session_id: string; usage: NonNullableUsage; total_cost_usd: number; modelUsage: Record<string, ModelUsage>; ... }
// Error:
{ type: 'result'; subtype: 'error_during_execution' | 'error_max_turns' | ...; session_id: string; usage: NonNullableUsage; ... }
```
`NonNullableUsage` matches `BetaUsage` with non-null fields:
```ts
{ input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; ... }
```
→ Emit `usage` (via `normalizeUsage`) + `done`.

### SDKUserMessage / SDKUserMessageReplay
Emitted for replayed conversation history on resume. We skip these (they're echo, not output).

### Tool result in SDKUserMessage
When a `canUseTool` callback resolves to `deny`, the SDK internally generates a user message
with a `tool_result` block containing the denial. We observe this as `SDKUserMessage` with
`tool_use_result` populated. We emit `tool-end` with `isError: true` from the *assistant*
message's `tool_use` block when we see the result come back as an error in the next user msg.

Actually simpler: we track pending tool-use IDs from `tool-start` events. On `SDKUserMessage`
we look for `tool_result` blocks in `message.content` and emit `tool-end` for each.

## SDKThinkingTokensMessage
```ts
{ type: 'system'; subtype: 'thinking_tokens'; estimated_tokens: number; estimated_tokens_delta: number; session_id: string; }
```
Not translated (progress indicator only, no text content).

## BetaUsage → normalizeUsage mapping
```ts
NonNullableUsage {
  input_tokens: number            → inputTokens
  output_tokens: number           → outputTokens
  cache_read_input_tokens: number → cacheReadTokens
  cache_creation_input_tokens: number → cacheWriteTokens
}
```

## Critical SDK quirk: updatedInput must be {}

The SDK bridge internally passes `updatedInput: ar.updatedInput` from the PermissionResult
to the subprocess. If `updatedInput` is `undefined`, the bridge Zod schema throws:
```
ZodError: Invalid input: expected record, received undefined
```
**Fix:** Always include `updatedInput: {}` in allow responses.

## Live spike results (2026-06-11)

**Spike 1 — file creation:**
- Script mode ran with `permissionMode: "default"` + `canUseTool` auto-approving all requests
- `/tmp/navi-spike/hello.txt` created with content `hello` (resolves to `/private/tmp/navi-spike/hello.txt` on macOS)
- Usage line printed to stderr; backendSessionId printed to stderr
- Verified: `cat /tmp/navi-spike/hello.txt` → `hello`

**Spike 2 — resume:**
- `--resume d16a28b3-f254-49ab-929f-ce77863e6638` successfully resumed the session
- Model answered `hello.txt` (just the filename, as instructed)
- Session backendSessionId matched the resumed ID

**Spike 3 — permission callback path:**
- Script mode uses `permissionMode: "default"` (NOT `bypassPermissions`)
- All `canUseTool` callbacks auto-approve via `respondToPermission(requestId, "allow")`
- `canUseTool` fires permission-request events through the EventChannel (concurrent producer pattern)
- The channel allows the consumer to call `respondToPermission` while the SDK generator is blocked
- Unit test "permission-request event emitted and respondToPermission resolves canUseTool" verifies
  the full round-trip without touching the live SDK
