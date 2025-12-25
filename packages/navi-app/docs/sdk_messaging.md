# SDK Messaging Architecture

> **Last Updated:** 2025-12-24 - Tool + tool_result persistence with subagent linkage

## Overview

This document describes how messages flow from the Claude Agent SDK through the server to the frontend UI, including storage and rendering.

---

## 1. SDK Source → Worker (server/query-worker.ts)

The Claude Agent SDK emits `SDKMessage` events which are processed by `query-worker.ts` (default path). A direct in-process path exists in `server/index.ts` (`handleQuery`) but is not used by the WebSocket entrypoint.

```
SDK query() → async iterator → formatMessage() → send() → stdout
```

### Key Message Types from SDK

| Type | Description |
|------|-------------|
| `system` | Init, status, compact_boundary, hook_response |
| `assistant` | Contains `content: ContentBlock[]` |
| `user` | Tool results / synthetic user messages |
| `result` | Completion with costs/usage |
| `tool_progress` | Subagent updates |
| `stream_event` | Real-time streaming deltas |

### formatMessage() (query-worker.ts)

Transforms SDK messages, adding:
- `uiSessionId` - maps to UI session
- `timestamp`, `uuid`
- `parentToolUseId` - for subagent nesting
- `isSynthetic`, `toolUseResult`, `isReplay` (user-only flags)

---

## 2. Worker → WebSocket (server/index.ts)

The server spawns `query-worker.ts` as a child process and reads stdout line-by-line:

```
child.stdout → buffer → JSON.parse → ws.send()
```

### Message Routing

| Message Type | Action |
|-------------|--------|
| `message` | Forwards `msg.data` to WebSocket and upserts assistant + tool_result user messages |
| `permission_request` | Stores in `pendingPermissions` Map, sends to WS |
| `complete` | Finalizes cost/title, sends `done` |
| `error` | Forwards error |

Persistence uses the SDK-provided `uuid` when available and skips replayed user messages (`isReplay`).

When the SDK’s final `assistant` message omits `thinking` blocks, the server merges `thinking` captured from `stream_event` before persistence and forwarding. This preserves reasoning content in the transcript.

### Session Attach (Reconnect)

If the frontend reloads while a session is still generating, it can rebind to the active worker:

```
{ type: "attach", sessionId }
```

The server updates the active WebSocket for that session, emits a **synthetic** `stream_event: message_start` to restore streaming state, and re-sends any pending `permission_request` messages for that session. If the same WS is already attached, the server skips the synthetic replay to avoid duplicate streaming resets.

---

## 3. WebSocket → Frontend Stores

### Entry Point: useMessageHandler.ts

```typescript
handleMessage(msg) → logEvent() + handler.handle()
```

### messageHandler.ts Routing

| Message Type | Action |
|-------------|--------|
| `system` (init) | Stores debug info in `sessionDebugInfo` |
| `stream_event` | Calls `handleStreamEvent()` |
| `assistant` | Adds to `sessionMessages` store |
| `user` (tool_result) | Adds tool result messages to `sessionMessages` store |
| `tool_progress` | Updates `activeSubagents` |
| `result` | Updates cost, calls `onComplete` |
| `permission_request` | Shows notification |

---

## 4. Streaming Store (streamingStore.ts)

### State Per Session

```typescript
interface StreamingState {
  isStreaming: boolean;
  currentBlocks: ContentBlock[];
  partialText: string;
  partialThinking: string;
  partialJson: string;
}
```

### Stream Events Flow

```
message_start      → start(sessionId)     // Initialize state
content_block_start → addBlock()          // Add new block
content_block_delta → appendDelta()       // Throttled (1500ms) append
content_block_stop  → finishBlock()       // Finalize block content
message_stop        → stop()              // Clear streaming state
```

### Throttling (streamingStore.ts)

Deltas are batched every 1500ms to reduce re-renders.

---

## 5. Rendering (ChatView.svelte)

### Data Sources

```svelte
const messages = $derived(sessionId ? messagesMap.get(sessionId) : []);
const streamingState = $derived(sessionId ? streamingMap.get(sessionId) : undefined);
```

### Rendering Logic

1. **Completed messages:** `{#each getMainMessages() as msg}` → `UserMessage` or `AssistantMessage`
2. **Tool result messages:** user messages containing only `tool_result` blocks render via `AssistantMessage`
3. **Active streaming:** `{#if isStreaming && streamingState}` → `StreamingPreview` component

---

## 6. StreamingPreview.svelte

Renders `currentBlocks` with streaming content:

```svelte
{#each getDisplayBlocks() as { block, isStreaming, streamingContent }}
  {#if block.type === "text"}
    <MermaidRenderer content={streamingContent || block.text} />
    {#if isStreaming}<span class="cursor">|</span>{/if}
  {:else if block.type === "thinking"}
    <pre>{streamingContent || block.thinking}</pre>
  {:else if block.type === "tool_use"}
    <!-- Tool preview -->
  {/if}
{/each}
```

---

## Store Summary

| Store | Purpose | Location |
|-------|---------|----------|
| `sessionMessages` | Finalized messages per session | `stores.ts:40-85` |
| `streamingStore` | Live streaming state | `streamingStore.ts` |
| `sessionTodos` | Todo items per session | `stores.ts:330-348` |
| `sessionEvents` | SDK events log | `stores.ts:889-925` |
| `sessionStatus` | Running/idle/permission state | `stores.ts:538-621` |
| `loadingSessions` | Set of active sessions | `stores.ts:210` |

---

## Message Persistence

### Database Schema (db.ts)

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,        -- JSON stringified ContentBlock[]
  timestamp INTEGER NOT NULL,
  parent_tool_use_id TEXT,      -- Links subagent messages to parent tool
  is_synthetic INTEGER DEFAULT 0 -- System-generated vs user-typed
);
```

`parent_tool_use_id` is used by the UI to group subagent updates under the originating tool call.

### What Gets Persisted

| SDK Message Type | Persisted? | Notes |
|-----------------|------------|-------|
| `SDKAssistantMessage` | ✅ Yes | Full content including tool_use blocks |
| `SDKUserMessage` (prompt) | ✅ Yes | Persisted when query starts (server writes prompt) |
| `SDKUserMessage` (tool result / synthetic) | ✅ Yes | Persisted when `shouldPersistUserMessage()` is true |
| `SDKUserMessage` (replay) | ❌ No | Skipped when `isReplay` is true |
| `SDKPartialAssistantMessage` | ❌ No | Streaming deltas (transient) |
| `SDKToolProgressMessage` | ❌ No | Progress updates (transient) |
| `SDKSystemMessage` | ❌ No | Init/status info |
| `SDKResultMessage` | ⚠️ Partial | Cost saved to session, not as message |

### Server Persistence Logic (server/index.ts)

```typescript
// Assistant messages - includes tool_use blocks
if (sessionId && data.type === "assistant" && hasMessageContent(data.content)) {
  const msgId = data.uuid || crypto.randomUUID();
  const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now();
  messages.upsert(
    msgId,
    sessionId,
    "assistant",
    JSON.stringify(data.content),
    timestamp,
    data.parentToolUseId ?? null,
    0
  );
}

// User messages with tool results / synthetic content
if (sessionId && shouldPersistUserMessage(data)) {
  const msgId = data.uuid || crypto.randomUUID();
  const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now();
  messages.upsert(
    msgId,
    sessionId,
    "user",
    JSON.stringify(data.content ?? []),
    timestamp,
    data.parentToolUseId ?? null,
    data.isSynthetic ? 1 : 0
  );
}
```

### shouldPersistUserMessage() Criteria

Returns `true` if:
- `isSynthetic` is true (system-generated), OR
- `toolUseResult` exists (has parsed tool result), OR
- `content` contains `tool_result` blocks

Skips if:
- `isReplay` is true (replayed messages on session resume)

### messages.upsert()

Uses `ON CONFLICT(id) DO UPDATE` to handle duplicate UUIDs from SDK:

```typescript
messages.upsert(
  msgId,           // SDK uuid or generated
  sessionId,
  role,            // 'assistant' | 'user'
  JSON.stringify(content),
  timestamp,
  parentToolUseId, // Links subagent messages
  isSynthetic      // 0 or 1
);
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Agent SDK                             │
│  query() → SDKMessage iterator                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   query-worker.ts                                │
│  formatMessage(msg) → { type, uiSessionId, content, ... }       │
│  send() → stdout (JSON per line)                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   server/index.ts                                │
│  child.stdout → parse lines → ws.send(JSON)                     │
│  Also: upserts assistant + tool_result user messages            │
│  Query start: saves user prompt                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   useMessageHandler.ts                           │
│  handleMessage(msg) → logEvent() + handler.handle()             │
└────────────────────┬─────────────────────────┬──────────────────┘
                     │                         │
          ┌──────────┴──────────┐   ┌──────────┴──────────┐
          ▼                     ▼   ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────┐
│   streamHandler.ts  │  │  messageHandler.ts  │  │ sessionEvents│
│                     │  │                     │  │  (logging)   │
│  stream_event →     │  │  assistant/user →   │  └──────────────┘
│  streamingStore     │  │  sessionMessages    │
│   .start()          │  │   .addMessage()     │
│   .addBlock()       │  │                     │
│   .appendDelta()    │  │  result →           │
│   .finishBlock()    │  │  callbacks.onComplete│
│   .stop()           │  │                     │
└──────────┬──────────┘  └──────────┬──────────┘
           │                        │
           ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Svelte Stores                               │
│  streamingStore (Map<sessionId, StreamingState>)                │
│  sessionMessages (Map<sessionId, ChatMessage[]>)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ChatView.svelte                             │
│  $derived(streamingMap.get(sessionId))                          │
│  $derived(messagesMap.get(sessionId))                           │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │  AssistantMessage    │  │  StreamingPreview   │              │
│  │ (completed/toolres)  │  │  (live streaming)   │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `server/query-worker.ts` | Spawns SDK query, formats messages |
| `server/index.ts` | WebSocket server, message routing, persistence |
| `server/db.ts` | SQLite database with messages table |
| `src/lib/handlers/streamHandler.ts` | Processes stream_event messages |
| `src/lib/handlers/messageHandler.ts` | Routes all message types, adds to stores |
| `src/lib/handlers/streamingStore.ts` | Manages streaming state |
| `src/lib/stores.ts` | All Svelte stores (ChatMessage interface) |
| `src/lib/components/ChatView.svelte` | Main chat renderer, tool result detection |
| `src/lib/components/StreamingPreview.svelte` | Live streaming UI |
| `src/lib/components/AssistantMessage.svelte` | Completed message UI, tool blocks |

---

## Changes Summary (2025-12-24)

### Database (db.ts)
- Added `parent_tool_use_id TEXT` column to messages
- Added `is_synthetic INTEGER DEFAULT 0` column to messages
- Added `messages.upsert()` function with `ON CONFLICT` handling
- Migration runs via `ALTER TABLE` on init

### Server (index.ts)
- `shouldPersistUserMessage()` - Determines if user message should be saved
- `isToolResultContent()` - Checks for tool_result blocks in content
- Now persists both assistant AND user messages with tool data
- Uses SDK's `uuid` + `timestamp` for message identity
- `formatMessage()` includes `isSynthetic`, `toolUseResult`, `isReplay`

### Frontend (messageHandler.ts)
- Now handles `case "user"` messages
- Saves user messages with tool results to sessionMessages store
- Includes `isSynthetic` and `parentToolUseId` fields

### Frontend (ChatView.svelte)
- `isToolResultMessage()` - Detects pure tool result messages
- Tool result user messages rendered via AssistantMessage component
- `getSubagentMessages()` - Filters messages with parentToolUseId

### Frontend (stores.ts)
- `ChatMessage.isSynthetic?: boolean` added
- `ChatMessage.parentToolUseId?: string | null` added
