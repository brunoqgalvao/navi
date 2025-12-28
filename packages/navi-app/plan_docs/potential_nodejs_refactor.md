# Bun → Node Refactor Plan

## Background

The bundled Tauri app has issues with Bun compiled binaries:
1. **JIT entitlements** - Bun compiled binaries need special macOS signing for executable memory
2. **`process.execPath`** - Returns virtual `/$bunfs/...` paths in compiled binaries
3. **Spawning bun** - Need to bundle bun itself as a sidecar

## Bun-Specific Code Inventory

| File | Bun API | Replacement |
|------|---------|-------------|
| `server/index.ts:73` | `Bun.env.PORT` | `process.env.PORT` |
| `server/index.ts:80` | `Bun.serve()` | Express or Fastify or native `http` + `ws` |
| `server/routes/filesystem.ts:11` | `Bun.file()` | `fs.readFile()` / `fs.createReadStream()` |
| `server/websocket/handler.ts` | Bun WebSocket handlers format | `ws` library handlers |

## Required Changes

### A. Main Server (`server/index.ts`)
- Replace `Bun.serve()` with **Express + ws** or **Fastify**
- Change WebSocket upgrade handling to use `ws` library
- Replace `Bun.env` with `process.env`

### B. Filesystem Routes (`server/routes/filesystem.ts`)
- Replace `Bun.file(path)` with `fs.readFile()` or `fs.createReadStream()`
- Replace `file.exists()` with `fs.existsSync()` or `fs.access()`
- Replace `file.text()` with `fs.readFile(path, 'utf-8')`

### C. WebSocket Handler (`server/websocket/handler.ts`)
- Adapt `createWebSocketHandlers()` return format from Bun's `{ open, message, close }` to `ws` library's event-based API
- Worker spawning already uses `child_process.spawn()` - no change needed

### D. Query Worker (`server/query-worker.ts`)
- Already uses Node-compatible APIs (`readline`, `fs`, `path`, `os`)
- No changes needed

### E. Database (`server/db.ts`)
- Uses `sql.js` (pure JS SQLite) - fully Node compatible
- No changes needed

## New Dependencies

**Add:**
- `express` or `fastify` (HTTP server)
- `ws` (WebSocket library)
- `tsx` or `esbuild` (for TypeScript execution/bundling)

**Remove:**
- None (current deps are cross-compatible)

## Build & Bundle Strategy

### Current (Bun)
```bash
bun build server/index.ts --compile --outfile navi-server
```

### New Options

**Option A: esbuild + pkg**
```bash
esbuild server/index.ts --bundle --platform=node --outfile=dist/server.js
pkg dist/server.js --targets node18-macos-arm64 --output navi-server
```

**Option B: esbuild + ship Node**
- Bundle with esbuild to single JS file
- Ship Node.js as sidecar (like we tried with Bun)
- Node doesn't have JIT signing issues

**Option C: Use tsx at runtime**
- Ship `node` + `tsx` + source files
- More files but simpler

**Recommendation:** Option B - bundle to single JS, ship Node

## Estimated Effort

| Task | Effort |
|------|--------|
| Replace `Bun.serve()` with Express/ws | 2-3 hours |
| Replace `Bun.file()` | 30 min |
| Adapt WebSocket handler format | 1-2 hours |
| Set up esbuild bundling | 1 hour |
| Test all routes | 1-2 hours |
| Update Tauri config | 30 min |
| **Total** | **6-9 hours** |

## What We Keep

- All route handlers (just change Response creation)
- Database layer (sql.js is pure JS)
- Query worker (already Node-compatible)
- All business logic
- Frontend (no changes needed)

## What We Gain

- No JIT entitlement signing
- Standard `process.execPath` behavior  
- Node is ubiquitous and well-tested for desktop bundling
- Can use system Node or bundle Node (smaller than Bun ~40MB vs ~60MB)
- More mature tooling (`pkg`, `nexe`, `vercel/pkg`)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Express/ws behavior differences | Write integration tests |
| Response API differences | Create compatibility layer in `utils/response.ts` |
| Streaming responses | Test file downloads, SSE endpoints |
| Performance regression | Negligible for desktop app |

## Decision

Deferred for now. Current approach attempts to bundle Bun as a sidecar with proper environment variable passing from Tauri (`NAVI_BUN_PATH`, `NAVI_CLAUDE_CODE_PATH`, `TAURI_RESOURCE_DIR`).

If Bun sidecar issues persist, this refactor should be revisited.
