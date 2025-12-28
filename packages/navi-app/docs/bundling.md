# Navi Bundling Architecture

This document describes how Navi is bundled for distribution as a macOS app.

## Overview

Navi uses Tauri v2 to create a native macOS app that bundles:
1. **Frontend** - Svelte app compiled to static files
2. **Server sidecar** - Bun-compiled binary (`navi-server`)
3. **Bun runtime** - For running the query worker
4. **Query worker** - Bundled JS file for Claude SDK queries
5. **Claude Agent SDK** - The full SDK package for API communication

## Build Process

The build script (`scripts/build-app.sh`) performs these steps:

```
1. Detect architecture (arm64 / x86_64)
2. Copy Bun binary to src-tauri/binaries/
3. Bundle query-worker.ts -> query-worker.js (IMPORTANT!)
4. Copy Claude Agent SDK to src-tauri/resources/
5. Compile server to standalone binary
6. Run Tauri build
7. Copy DMG to landing page downloads
```

## Critical: Worker Bundling

**Problem we solved (Dec 2024):**

The `query-worker.ts` imports local modules:
- `./utils/claude-code`
- `./utils/navi-auth`
- `./utils/logging`
- `./utils/bun`

Originally, only `query-worker.ts` was copied to the bundle, causing:
```
Cannot find module './utils/claude-code' from '.../query-worker.ts'
```

**Solution:**

Bundle the worker into a single JS file with all dependencies:
```bash
bun build ./server/query-worker.ts --outfile src-tauri/resources/query-worker.js --target bun
```

The bundled file includes all imports, so it runs standalone.

## File Locations

### Source (development)
```
packages/navi-app/
├── server/
│   ├── index.ts          # Main server
│   ├── query-worker.ts   # Worker (has local imports)
│   └── utils/
│       ├── claude-code.ts
│       ├── navi-auth.ts
│       ├── logging.ts
│       └── bun.ts
└── src-tauri/
    ├── binaries/         # Compiled binaries (gitignored)
    └── resources/        # Runtime resources (gitignored)
```

### Bundle (macOS app)
```
Navi.app/Contents/
├── MacOS/
│   ├── claude-code-ui    # Tauri main binary
│   ├── navi-server       # Compiled server sidecar
│   └── bun               # Bun runtime for worker
└── Resources/
    └── resources/
        ├── query-worker.js        # BUNDLED worker (not .ts!)
        └── claude-agent-sdk/      # Full SDK
            └── cli.js             # SDK entry point
```

## Tauri Configuration

In `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "externalBin": [
      "binaries/navi-server",
      "binaries/bun"
    ],
    "resources": [
      "resources/query-worker.js",
      "resources/claude-agent-sdk/**/*"
    ]
  }
}
```

## Worker Resolution

The server finds the worker at runtime (`server/websocket/handler.ts`):

```typescript
// In bundled app, look for .js in Resources
const bundledWorkerPath = join(execDir, "..", "Resources", "resources", "query-worker.js");

// In development, use .ts directly (Bun handles TypeScript)
const fallbackWorkerPath = join(__dirname, "..", "query-worker.ts");
```

## Debugging Bundle Issues

### 1. Check if worker exists
```bash
ls -la /Applications/Navi.app/Contents/Resources/resources/
```

### 2. Run app from terminal to see errors
```bash
/Applications/Navi.app/Contents/MacOS/claude-code-ui 2>&1
```

### 3. Common errors

**"Cannot find module './utils/...'"**
- Worker was copied as `.ts` instead of bundled as `.js`
- Fix: Ensure build script uses `bun build` not `cp`

**"Failed to fetch models"**
- Check SDK path exists
- Check Bun sidecar is executable

**"Port in use"**
- Kill existing processes: `pkill -f navi-server`

### 4. Enable debug logging
```bash
export NAVI_LOG_DIR=~/Desktop
/Applications/Navi.app/Contents/MacOS/claude-code-ui
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NAVI_BUN_SIDECAR_PATH` | Override Bun binary location |
| `NAVI_CLAUDE_CODE_PATH` | Override Claude SDK CLI path |
| `NAVI_LOG_DIR` | Custom log directory |
| `NAVI_LOG_FILE` | Custom log file path |

## Common Pitfalls

1. **Don't copy .ts files to bundle** - Always bundle with `bun build`
2. **Keep tauri.conf.json in sync** - If you rename files, update resources list
3. **Check file extensions** - `.js` in bundle, `.ts` in development
4. **Test the actual DMG** - Dev mode may work while bundle fails
