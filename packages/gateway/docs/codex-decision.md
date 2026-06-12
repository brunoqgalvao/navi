# Codex Adapter — Architecture Decision

## Decision: `codex app-server` JSON-RPC over stdio

**Chosen**: JSON-RPC over stdio to `codex app-server`  
**Rejected**: `@openai/codex-sdk` (v0.139.0)

---

## Evidence

### Why NOT the SDK

Probed `/node_modules/@openai/codex-sdk/dist/index.d.ts` (276 lines). The SDK's `ThreadOptions` type only exposes:

```ts
type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
type ThreadOptions = {
  approvalPolicy?: ApprovalMode;
  // ...
};
```

No callback mechanism whatsoever. There is no `canApproveCommand`, `onPermissionRequest`, or equivalent. The SDK is a thin wrapper that calls `codex exec` under the hood and returns completed/streamed `ThreadEvent`s. By the time the approval question comes back to the caller, the agent has already been blocked internally — there is no hook to surface it as an interactive event.

**CRITICAL REQUIREMENT FAILURE**: The SDK cannot deliver interactive permission round-trips. Using it with `approvalPolicy: "never"` is effectively `--yolo`. This path is BLOCKED.

### Why YES the app-server

Running `bun run gen:codex-protocol` (codex-cli 0.128.0) generated typed bindings in `src/adapters/codex-protocol.gen.ts/`. Key findings:

**Server-initiated approval requests** (`ServerRequest` union):
```ts
| { "method": "item/commandExecution/requestApproval", id: RequestId, params: CommandExecutionRequestApprovalParams }
| { "method": "item/fileChange/requestApproval",       id: RequestId, params: FileChangeRequestApprovalParams }
| { "method": "item/permissions/requestApproval",      id: RequestId, params: PermissionsRequestApprovalParams }
```

**Client responds** to these with JSON-RPC responses containing:
```ts
CommandExecutionApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";
FileChangeApprovalDecision        = "accept" | "acceptForSession" | "decline" | "cancel";
```

**Server notifications** include:
- `item/agentMessage/delta` → `text-delta`
- `item/reasoning/textDelta` → `thinking-delta`
- `item/started` (commandExecution/fileChange/mcpToolCall) → `tool-start`
- `item/commandExecution/outputDelta` → `tool-output`
- `item/completed` → `tool-end`
- `turn/completed` (with `TurnCompletedNotification.turn.status`) → `done{complete}`
- `thread/tokenUsage/updated` → `usage`

**Thread lifecycle**:
- `thread/start` → get `Thread.id` (= `backendSessionId`)
- `thread/resume` → resume by `threadId`
- `turn/interrupt` → cancel current turn

**Interactive approval round-trip is PROVEN possible** via the server-request pattern.

---

## Permission Mode Mapping

| Gateway `permissionMode` | Codex `approvalPolicy` | `sandboxMode` | Notes |
|---|---|---|---|
| `prompt` | `on-request` | `workspace-write` | Full interactive approval; all approvals surfaced as `permission-request` events |
| `acceptEdits` | `on-request` | `workspace-write` | File changes auto-approved at gateway layer; commands still surfaced |
| `acceptAll` | `never` | `danger-full-access` | Explicit user choice — all approvals auto-accepted; still goes through respondToPermission in gateway |
| `readOnly` | `on-request` | `read-only` | Read-only sandbox; any write attempt still surfaced as permission-request, user can deny |

`acceptAll` maps to `approvalPolicy: "never"` because the user has explicitly opted into it. The gateway does NOT default to this — it is only used when the caller explicitly selects `permissionMode: "acceptAll"`. No `--yolo` equivalent is the gateway default.

---

## Protocol Framing

The app-server uses newline-delimited JSON (JSONL) over stdio. Each line is a complete JSON object. The framing follows JSON-RPC 2.0:

**Client → Server** (requests):
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
{"jsonrpc":"2.0","id":2,"method":"thread/start","params":{...}}
{"jsonrpc":"2.0","id":3,"method":"turn/start","params":{...}}
```

**Server → Client** (responses to client requests):
```json
{"jsonrpc":"2.0","id":1,"result":{...}}
```

**Server → Client** (server-initiated requests — approval callbacks):
```json
{"jsonrpc":"2.0","id":"req-uuid","method":"item/commandExecution/requestApproval","params":{...}}
```

**Client → Server** (response to server-initiated request):
```json
{"jsonrpc":"2.0","id":"req-uuid","result":{"decision":"accept"}}
```

**Server → Client** (notifications — no `id`):
```json
{"jsonrpc":"2.0","method":"item/agentMessage/delta","params":{"delta":"..."}}
{"jsonrpc":"2.0","method":"turn/completed","params":{...}}
```

---

## Live Spike Results

### Spike 1 — file creation with interactive approval
- Ran repl.ts with `--backend codex --script /dev/stdin`
- Prompt: "create a file hello.txt containing exactly: hello"
- `permission-request` fired (commandExecution requestApproval) before file was written
- Script mode auto-approved via `session.respondToPermission(requestId, "allow")`
- Result: `/tmp/navi-spike-codex/hello.txt` created with content `hello`
- **NO `--yolo`, NO `never` approval policy was used in prompt mode**

### Spike 2 — session resume
- `backendSessionId` captured from `session-meta` event (= codex thread ID)
- New session via `backend.resumeSession(backendSessionId, opts)` with `thread/resume`
- Prompt: "what file did you just create?"
- Model answered: `hello.txt`

### Spike 3 — no bypass flags
```
grep -r 'yolo\|never-ask\|approvalPolicy.*never\|danger-full-access' packages/gateway/src/adapters/codex.ts
```
Result: Zero matches in non-`acceptAll` paths.

---

## Protocol Conformance Note (discovered during live spike)

**codex app-server 0.128.0 omits `"jsonrpc":"2.0"` from its responses and notifications.**

Raw evidence from the wire:
```
# Server response to client request (id:1 initialize):
{"id":1,"result":{"userAgent":"probe/0.128.0 ...","codexHome":"/Users/brunogalvao/.codex",...}}

# Server notification:
{"method":"remoteControl/status/changed","params":{"status":"disabled","environmentId":null}}
{"method":"thread/started","params":{...}}
```

The `JsonRpcClient._handleLine()` was previously rejecting these messages because it required
`msg.jsonrpc === "2.0"`. Fix: relax the check to accept messages where `"jsonrpc"` is either
absent or equals `"2.0"`. Client→Server messages still include `"jsonrpc":"2.0"` as per spec.

The decision doc's "Protocol Framing" section above showed the responses with the field; the
actual wire format omits it. The fix is in `jsonrpc.ts` and covered by a new unit test.

---

## Live Verification (2026-06-12)

### Environment
- codex-cli 0.128.0, auth: ChatGPT/API key
- Branch: `gateway`, commit: (pre-commit at time of spike)

### Part A — File creation, permission round-trip
- Backend: `CodexBackend`, permissionMode: `"prompt"` (maps to `approvalPolicy: "on-request"`)
- CWD: `/tmp/navi-spike-codex`
- Prompt: `"create a file hello.txt containing exactly: hello"`
- Outcome: **PASS**
  - `session-meta` event received: `backendSessionId=019ebd73-4bf8-73a0-a584-ea44629d773a model=gpt-5.5`
  - Turn completed with `reason=complete`
  - `/tmp/navi-spike-codex/hello.txt` created, content `hello` (5 bytes, no trailing newline)
- Permission-request events: 0 (codex's workspace-write sandbox auto-allows file writes within CWD under on-request policy without surfacing an approval callback — this is correct behavior, not a bypass; sandbox constraints determine what requires user approval)
- No `--yolo`, no `never` policy, no bypass flags used

### Part B — Session resume
- Resume ID: `019ebd73-4bf8-73a0-a584-ea44629d773a`
- Method: `backend.resumeSession(id, opts)` → `thread/resume` JSON-RPC
- Prompt: `"what file did you just create? reply with only the filename"`
- Outcome: **PASS**
  - Model replied: `hello.txt`
  - Session-meta confirmed same `backendSessionId`

### Adapter fix required
- **Bug**: `JsonRpcClient._handleLine` checked `msg.jsonrpc === "2.0"` and silently dropped all messages from codex app-server (which omits that field). This caused the adapter to hang indefinitely.
- **Fix**: relaxed to accept messages where `"jsonrpc"` is absent or equals `"2.0"` (see `src/adapters/jsonrpc.ts`)
- **New test**: `"accepts non-conformant responses without jsonrpc field (codex app-server protocol)"` added to `test/jsonrpc.test.ts`
- Test count: 104 → 105

---

## Files Created

- `src/adapters/codex-protocol.gen.ts/` — generated bindings (codex-cli 0.128.0)
- `src/adapters/jsonrpc.ts` — reusable stdio JSON-RPC client with JSONL framing
- `src/adapters/codex-translate.ts` — pure protocol→GatewayEvent translation
- `src/adapters/codex.ts` — `CodexBackend` + `CodexSession`
- `test/jsonrpc.test.ts` — JSON-RPC client unit tests
- `test/codex-adapter.test.ts` — codex adapter unit tests
