# Dockerized Worktree Preview - Implementation Plan

> **Status:** Planning
> **Created:** 2026-01-08
> **Goal:** Enable seamless branch preview switching without port conflicts or dependency issues

## Problem Statement

When working with git worktrees in Navi, users want to preview different branches of their application. Current challenges:

1. **Port conflicts** - Running multiple dev servers requires different ports, but apps often hardcode ports
2. **node_modules isolation** - Worktrees don't share `node_modules`, requiring fresh installs
3. **Project-specific complexity** - Different projects use different frameworks, package managers, and dev commands
4. **User code intrusion** - Preview shouldn't require changes to user's codebase

## Solution Overview

A single Docker container managed entirely by Navi that:
- Mounts any worktree directory as source
- Handles dependency installation internally
- Auto-detects project type and runs appropriate dev command
- Exposes a single, consistent preview port

Users click a branch in a dropdown → container switches to that worktree → preview updates.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  HOST (macOS)                                                   │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ .worktrees/     │  │ .worktrees/     │  │ main repo       │  │
│  │ feature-a/      │  │ feature-b/      │  │ (your dev)      │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │
│           │                    │              (port 1420)       │
│           └────────┬───────────┘                                │
│                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Docker Container: navi-preview                             ││
│  │  ┌───────────────────────────────────────────────────────┐  ││
│  │  │  /preview-src  ← bind mount (user's worktree, r/o)    │  ││
│  │  │  /app          ← working copy (rsync from src)        │  ││
│  │  │  /app/node_modules ← container-managed (volume)       │  ││
│  │  │                                                       │  ││
│  │  │  Internal ports: 3000 (app)                           │  ││
│  │  └───────────────────────────────────────────────────────┘  ││
│  │                                                             ││
│  │  Exposed: localhost:4000 → container:3000                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Navi UI: localhost:1420                                        │
│  Preview:  localhost:4000                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Single container** - One preview at a time, simplifies port management
2. **rsync, not direct mount** - Avoids file locking issues, allows container to own `/app`
3. **Named volume for node_modules** - Persists between switches, speeds up subsequent installs
4. **All Docker files in Navi** - User's repo stays clean
5. **Smart entrypoint** - Auto-detects framework and package manager

---

## File Structure

All preview infrastructure lives inside Navi:

```
packages/navi-app/
├── .docker/
│   └── preview/
│       ├── Dockerfile
│       ├── docker-compose.yml
│       └── entrypoint.sh
├── server/
│   ├── routes/
│   │   └── preview.ts              # HTTP endpoints
│   └── services/
│       └── preview-container.ts    # Docker management
└── src/lib/
    ├── components/
    │   └── PreviewSwitcher.svelte  # UI dropdown
    └── api.ts                      # API client methods
```

---

## Docker Setup

### Dockerfile

```dockerfile
# packages/navi-app/.docker/preview/Dockerfile
FROM oven/bun:1.3-debian

WORKDIR /app

# Install Node.js (needed for some tools like node-pty)
RUN apt-get update && \
    apt-get install -y nodejs npm rsync && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install common global tools
RUN bun install -g pnpm yarn

# Create directories
RUN mkdir -p /preview-src /app

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Single exposed port - app should bind to this
EXPOSE 3000

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s \
  CMD curl -f http://localhost:3000 || exit 1

ENTRYPOINT ["/entrypoint.sh"]
```

### docker-compose.yml

```yaml
# packages/navi-app/.docker/preview/docker-compose.yml
version: '3.8'

services:
  navi-preview:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: navi-preview
    ports:
      - "${PREVIEW_PORT:-4000}:3000"
    volumes:
      # Source code from worktree (read-only)
      - ${PREVIEW_SOURCE:?PREVIEW_SOURCE required}:/preview-src:ro,cached
      # Persistent node_modules (container-managed)
      - preview_node_modules:/app/node_modules
      # Persistent bun cache
      - preview_bun_cache:/root/.bun
    environment:
      - NODE_ENV=development
      - PORT=3000
    restart: unless-stopped
    # Limit resources
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 1G

volumes:
  preview_node_modules:
    name: navi-preview-node-modules
  preview_bun_cache:
    name: navi-preview-bun-cache
```

### entrypoint.sh

```bash
#!/bin/bash
# packages/navi-app/.docker/preview/entrypoint.sh
set -e

echo "=========================================="
echo "  Navi Preview Container"
echo "=========================================="

# Sync source code (excludes node_modules and .git)
echo "[Preview] Syncing source code..."
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.next' \
  --exclude='.nuxt' \
  --exclude='dist' \
  --exclude='build' \
  /preview-src/ /app/

cd /app

# Detect package manager
detect_package_manager() {
  if [ -f "bun.lockb" ]; then
    echo "bun"
  elif [ -f "pnpm-lock.yaml" ]; then
    echo "pnpm"
  elif [ -f "yarn.lock" ]; then
    echo "yarn"
  else
    echo "npm"
  fi
}

PM=$(detect_package_manager)
echo "[Preview] Detected package manager: $PM"

# Check if deps need install
HASH_FILE="/app/.navi-deps-hash"
CURRENT_HASH=""
if [ -f "package.json" ]; then
  CURRENT_HASH=$(md5sum package.json | cut -d' ' -f1)
fi
STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$STORED_HASH" ] || [ ! -d "node_modules" ]; then
  echo "[Preview] Installing dependencies with $PM..."
  case $PM in
    bun)  bun install --no-save ;;
    pnpm) pnpm install --frozen-lockfile || pnpm install ;;
    yarn) yarn install --frozen-lockfile || yarn install ;;
    npm)  npm ci || npm install ;;
  esac
  echo "$CURRENT_HASH" > "$HASH_FILE"
else
  echo "[Preview] Dependencies up to date, skipping install"
fi

# Detect framework and get appropriate dev command
detect_dev_command() {
  # Check for framework-specific configs
  if [ -f "vite.config.js" ] || [ -f "vite.config.ts" ] || [ -f "vite.config.mjs" ]; then
    echo "vite --host 0.0.0.0 --port 3000"
    return
  fi

  if [ -f "next.config.js" ] || [ -f "next.config.mjs" ] || [ -f "next.config.ts" ]; then
    echo "next dev -H 0.0.0.0 -p 3000"
    return
  fi

  if [ -f "nuxt.config.ts" ] || [ -f "nuxt.config.js" ]; then
    echo "nuxt dev --host 0.0.0.0 --port 3000"
    return
  fi

  if [ -f "svelte.config.js" ]; then
    echo "vite dev --host 0.0.0.0 --port 3000"
    return
  fi

  if [ -f "astro.config.mjs" ] || [ -f "astro.config.ts" ]; then
    echo "astro dev --host 0.0.0.0 --port 3000"
    return
  fi

  if [ -f "remix.config.js" ]; then
    echo "remix dev --port 3000"
    return
  fi

  # Fallback: check package.json scripts
  if [ -f "package.json" ]; then
    if grep -q '"dev"' package.json; then
      echo "dev"
      return
    fi
    if grep -q '"start"' package.json; then
      echo "start"
      return
    fi
  fi

  echo ""
}

DEV_CMD=$(detect_dev_command)

if [ -z "$DEV_CMD" ]; then
  echo "[Preview] ERROR: Could not detect dev command"
  echo "[Preview] No vite.config, next.config, or 'dev' script found"
  echo "[Preview] Sleeping to keep container alive for debugging..."
  sleep infinity
fi

echo "[Preview] Starting: $PM run $DEV_CMD"
echo "=========================================="

# Run the dev command
# Use exec to replace shell process (proper signal handling)
case $PM in
  bun)
    if [[ "$DEV_CMD" == *" "* ]]; then
      # Direct command (e.g., "vite --host...")
      exec bun x $DEV_CMD
    else
      exec bun run $DEV_CMD
    fi
    ;;
  pnpm)
    if [[ "$DEV_CMD" == *" "* ]]; then
      exec pnpm exec $DEV_CMD
    else
      exec pnpm run $DEV_CMD
    fi
    ;;
  yarn)
    if [[ "$DEV_CMD" == *" "* ]]; then
      exec yarn $DEV_CMD
    else
      exec yarn run $DEV_CMD
    fi
    ;;
  npm)
    if [[ "$DEV_CMD" == *" "* ]]; then
      exec npx $DEV_CMD
    else
      exec npm run $DEV_CMD
    fi
    ;;
esac
```

---

## Backend Implementation

### Preview Container Service

```typescript
// packages/navi-app/server/services/preview-container.ts

import { exec, spawn } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { existsSync } from "fs";

const execAsync = promisify(exec);

// Path to docker-compose file (relative to server)
const DOCKER_COMPOSE_PATH = join(__dirname, "../../.docker/preview/docker-compose.yml");

export interface PreviewState {
  running: boolean;
  containerId?: string;
  worktreePath?: string;
  branch?: string;
  sessionId?: string;
  port: number;
  url: string;
  startedAt?: number;
  error?: string;
}

let currentPreview: PreviewState = {
  running: false,
  port: 4000,
  url: "http://localhost:4000",
};

// Check if Docker is available
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync("docker info");
    return true;
  } catch {
    return false;
  }
}

// Check if container is running
export async function isContainerRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      "docker ps --filter name=navi-preview --format '{{.Names}}'"
    );
    return stdout.trim() === "navi-preview";
  } catch {
    return false;
  }
}

// Get container ID
async function getContainerId(): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync(
      "docker ps --filter name=navi-preview --format '{{.ID}}'"
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

// Start preview with a specific worktree
export async function startPreview(
  worktreePath: string,
  branch: string,
  sessionId?: string
): Promise<PreviewState> {
  // Validate worktree exists
  if (!existsSync(worktreePath)) {
    throw new Error(`Worktree path does not exist: ${worktreePath}`);
  }

  // Check Docker availability
  if (!(await isDockerAvailable())) {
    throw new Error("Docker is not available. Please install and start Docker.");
  }

  // Stop existing preview if running
  if (await isContainerRunning()) {
    await stopPreview();
  }

  console.log(`[Preview] Starting preview for: ${branch}`);
  console.log(`[Preview] Worktree path: ${worktreePath}`);

  // Start container with worktree mounted
  const env = {
    ...process.env,
    PREVIEW_SOURCE: worktreePath,
    PREVIEW_PORT: "4000",
  };

  try {
    await execAsync(
      `docker-compose -f "${DOCKER_COMPOSE_PATH}" up -d --build`,
      { env }
    );

    // Wait for container to be ready
    await waitForContainer(10000);

    currentPreview = {
      running: true,
      containerId: await getContainerId(),
      worktreePath,
      branch,
      sessionId,
      port: 4000,
      url: "http://localhost:4000",
      startedAt: Date.now(),
    };

    console.log(`[Preview] Started successfully: ${currentPreview.url}`);
    return currentPreview;
  } catch (error: any) {
    console.error("[Preview] Failed to start:", error);
    throw new Error(`Failed to start preview: ${error.message}`);
  }
}

// Stop preview container
export async function stopPreview(): Promise<void> {
  console.log("[Preview] Stopping preview container...");

  try {
    await execAsync(`docker-compose -f "${DOCKER_COMPOSE_PATH}" down`);
    currentPreview = {
      running: false,
      port: 4000,
      url: "http://localhost:4000",
    };
    console.log("[Preview] Stopped successfully");
  } catch (error: any) {
    console.error("[Preview] Failed to stop:", error);
    throw new Error(`Failed to stop preview: ${error.message}`);
  }
}

// Switch preview to different worktree
export async function switchPreview(
  worktreePath: string,
  branch: string,
  sessionId?: string
): Promise<PreviewState> {
  // Just restart with new source
  return startPreview(worktreePath, branch, sessionId);
}

// Get current preview status
export function getPreviewStatus(): PreviewState {
  return { ...currentPreview };
}

// Get container logs
export async function getPreviewLogs(tail: number = 100): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `docker logs navi-preview --tail ${tail} 2>&1`
    );
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Stream logs (returns a readable stream)
export function streamPreviewLogs(): NodeJS.ReadableStream | null {
  try {
    const proc = spawn("docker", ["logs", "-f", "navi-preview"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return proc.stdout;
  } catch {
    return null;
  }
}

// Wait for container to be healthy
async function waitForContainer(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isContainerRunning()) {
      // Additional check: wait for port to be available
      try {
        await execAsync("curl -sf http://localhost:4000 > /dev/null");
        return;
      } catch {
        // Port not ready yet
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // Don't throw - container might still be installing deps
  console.log("[Preview] Container started but app may still be initializing");
}

// Cleanup on process exit
process.on("exit", () => {
  // Async cleanup not reliable here, but try anyway
  exec(`docker-compose -f "${DOCKER_COMPOSE_PATH}" down`);
});
```

### Preview Routes

```typescript
// packages/navi-app/server/routes/preview.ts

import { json } from "../utils/response";
import { sessions, projects } from "../db";
import {
  isDockerAvailable,
  startPreview,
  stopPreview,
  switchPreview,
  getPreviewStatus,
  getPreviewLogs,
  streamPreviewLogs,
} from "../services/preview-container";

export async function handlePreviewRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {

  // GET /api/preview/status - Get current preview state
  if (url.pathname === "/api/preview/status" && method === "GET") {
    const dockerAvailable = await isDockerAvailable();
    const status = getPreviewStatus();

    return json({
      ...status,
      dockerAvailable,
    });
  }

  // POST /api/preview/start - Start/switch preview
  if (url.pathname === "/api/preview/start" && method === "POST") {
    const body = await req.json();
    const { worktreePath, sessionId } = body;

    // Get worktree path from session if not provided directly
    let targetPath = worktreePath;
    let branch = body.branch;

    if (!targetPath && sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return json({ error: "Session not found" }, 404);
      }
      if (!session.worktree_path) {
        return json({ error: "Session has no worktree" }, 400);
      }
      targetPath = session.worktree_path;
      branch = session.worktree_branch;
    }

    if (!targetPath) {
      return json({ error: "worktreePath or sessionId required" }, 400);
    }

    try {
      const status = await startPreview(targetPath, branch, sessionId);
      return json(status);
    } catch (error: any) {
      return json({ error: error.message }, 500);
    }
  }

  // POST /api/preview/stop - Stop preview
  if (url.pathname === "/api/preview/stop" && method === "POST") {
    try {
      await stopPreview();
      return json({ success: true });
    } catch (error: any) {
      return json({ error: error.message }, 500);
    }
  }

  // GET /api/preview/logs - Get recent logs
  if (url.pathname === "/api/preview/logs" && method === "GET") {
    const tail = parseInt(url.searchParams.get("tail") || "100");
    const logs = await getPreviewLogs(tail);
    return json({ logs });
  }

  // GET /api/preview/logs/stream - Stream logs via SSE
  if (url.pathname === "/api/preview/logs/stream" && method === "GET") {
    const stream = streamPreviewLogs();
    if (!stream) {
      return json({ error: "Preview not running" }, 400);
    }

    // Return SSE stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => {
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            if (line.trim()) {
              controller.enqueue(encoder.encode(`data: ${line}\n\n`));
            }
          }
        });
        stream.on("end", () => controller.close());
        stream.on("error", () => controller.close());
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // GET /api/preview/docker - Check Docker availability
  if (url.pathname === "/api/preview/docker" && method === "GET") {
    const available = await isDockerAvailable();
    return json({ available });
  }

  return null;
}
```

---

## Frontend Implementation

### API Client

```typescript
// Add to packages/navi-app/src/lib/api.ts

export interface PreviewStatus {
  running: boolean;
  dockerAvailable?: boolean;
  containerId?: string;
  worktreePath?: string;
  branch?: string;
  sessionId?: string;
  port: number;
  url: string;
  startedAt?: number;
  error?: string;
}

export const previewApi = {
  // Get current preview status
  getStatus: () =>
    request<PreviewStatus>("/preview/status"),

  // Start preview for a worktree
  start: (options: { worktreePath?: string; sessionId?: string; branch?: string }) =>
    request<PreviewStatus>("/preview/start", {
      method: "POST",
      body: JSON.stringify(options),
    }),

  // Stop preview
  stop: () =>
    request<{ success: boolean }>("/preview/stop", {
      method: "POST",
    }),

  // Get recent logs
  getLogs: (tail = 100) =>
    request<{ logs: string[] }>(`/preview/logs?tail=${tail}`),

  // Check if Docker is available
  checkDocker: () =>
    request<{ available: boolean }>("/preview/docker"),
};
```

### Preview Switcher Component

```svelte
<!-- packages/navi-app/src/lib/components/PreviewSwitcher.svelte -->
<script lang="ts">
  import { previewApi, worktreeApi, type PreviewStatus } from "../api";
  import { onMount } from "svelte";

  interface Worktree {
    sessionId: string;
    path: string;
    branch: string;
    title: string;
  }

  let status = $state<PreviewStatus>({ running: false, port: 4000, url: "" });
  let worktrees = $state<Worktree[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let showDropdown = $state(false);
  let dockerAvailable = $state(true);

  onMount(() => {
    loadStatus();
    loadWorktrees();
    // Poll status every 5 seconds
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  });

  async function loadStatus() {
    try {
      status = await previewApi.getStatus();
      dockerAvailable = status.dockerAvailable ?? true;
    } catch (e) {
      console.error("Failed to load preview status:", e);
    }
  }

  async function loadWorktrees() {
    try {
      // Get all sessions with worktrees
      const sessions = await worktreeApi.listAll();
      worktrees = sessions.map(s => ({
        sessionId: s.id,
        path: s.worktree_path!,
        branch: s.worktree_branch!,
        title: s.title,
      }));
    } catch (e) {
      console.error("Failed to load worktrees:", e);
    }
  }

  async function startPreview(wt: Worktree) {
    loading = true;
    error = null;
    try {
      status = await previewApi.start({
        sessionId: wt.sessionId,
        branch: wt.branch,
      });
      showDropdown = false;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function stopPreview() {
    loading = true;
    error = null;
    try {
      await previewApi.stop();
      await loadStatus();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function openPreview() {
    window.open(status.url, "_blank");
  }

  function formatBranch(branch: string): string {
    return branch.replace(/^session\//, "");
  }
</script>

{#if worktrees.length > 0}
  <div class="preview-switcher">
    <button
      class="preview-toggle"
      class:active={status.running}
      onclick={() => showDropdown = !showDropdown}
      disabled={!dockerAvailable}
    >
      {#if !dockerAvailable}
        <span class="status-dot unavailable"></span>
        Docker Required
      {:else if status.running}
        <span class="status-dot running"></span>
        Preview: {formatBranch(status.branch || "")}
      {:else}
        <span class="status-dot stopped"></span>
        Preview
      {/if}
      <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if showDropdown}
      <div class="dropdown-menu">
        {#if !dockerAvailable}
          <div class="docker-warning">
            <p>Docker is required for branch preview.</p>
            <a href="https://www.docker.com/products/docker-desktop/" target="_blank">
              Install Docker Desktop
            </a>
          </div>
        {:else}
          {#if status.running}
            <div class="current-preview">
              <div class="preview-info">
                <span class="label">Currently previewing:</span>
                <span class="branch">{formatBranch(status.branch || "")}</span>
              </div>
              <div class="preview-actions">
                <button class="open-btn" onclick={openPreview}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open ({status.url})
                </button>
                <button class="stop-btn" onclick={stopPreview} disabled={loading}>
                  {loading ? "Stopping..." : "Stop"}
                </button>
              </div>
            </div>
            <hr />
          {/if}

          <div class="worktree-list">
            <span class="list-label">Switch to:</span>
            {#each worktrees as wt}
              <button
                class="worktree-item"
                class:active={status.worktreePath === wt.path}
                onclick={() => startPreview(wt)}
                disabled={loading}
              >
                <span class="branch-name">{formatBranch(wt.branch)}</span>
                <span class="session-title">{wt.title}</span>
                {#if status.worktreePath === wt.path}
                  <svg class="check" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                {/if}
              </button>
            {/each}
          </div>

          {#if error}
            <div class="error-message">{error}</div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .preview-switcher {
    position: relative;
  }

  .preview-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preview-toggle:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .preview-toggle.active {
    background: #f0fdf4;
    border-color: #86efac;
    color: #166534;
  }

  .preview-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  .status-dot.running {
    background: #22c55e;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
  }

  .status-dot.stopped {
    background: #9ca3af;
  }

  .status-dot.unavailable {
    background: #f59e0b;
  }

  .chevron {
    width: 1rem;
    height: 1rem;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    min-width: 320px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    z-index: 100;
    overflow: hidden;
  }

  .docker-warning {
    padding: 1rem;
    text-align: center;
    color: #92400e;
    background: #fef3c7;
  }

  .docker-warning a {
    display: inline-block;
    margin-top: 0.5rem;
    color: #1d4ed8;
    text-decoration: underline;
  }

  .current-preview {
    padding: 1rem;
    background: #f0fdf4;
  }

  .preview-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .preview-info .label {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .preview-info .branch {
    font-family: monospace;
    font-weight: 600;
    color: #166534;
  }

  .preview-actions {
    display: flex;
    gap: 0.5rem;
  }

  .open-btn, .stop-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .open-btn {
    background: #166534;
    color: white;
    border: none;
  }

  .open-btn:hover {
    background: #14532d;
  }

  .open-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .stop-btn {
    background: white;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .stop-btn:hover:not(:disabled) {
    background: #fef2f2;
  }

  .stop-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 0;
  }

  .worktree-list {
    padding: 0.5rem;
  }

  .list-label {
    display: block;
    padding: 0.5rem;
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .worktree-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 0.75rem;
    background: none;
    border: none;
    border-radius: 0.5rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
    position: relative;
  }

  .worktree-item:hover:not(:disabled) {
    background: #f3f4f6;
  }

  .worktree-item.active {
    background: #f0fdf4;
  }

  .worktree-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .branch-name {
    font-family: monospace;
    font-size: 0.875rem;
    font-weight: 500;
    color: #1f2937;
  }

  .session-title {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.125rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .check {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.25rem;
    height: 1.25rem;
    color: #22c55e;
  }

  .error-message {
    padding: 0.75rem 1rem;
    background: #fef2f2;
    color: #dc2626;
    font-size: 0.875rem;
  }
</style>
```

---

## Integration with App.svelte

Add the PreviewSwitcher to the header area:

```svelte
<!-- In App.svelte header section -->
<script>
  import PreviewSwitcher from "./lib/components/PreviewSwitcher.svelte";
</script>

<!-- Add to header/toolbar area -->
<div class="header-actions">
  <!-- ... other header items ... -->
  <PreviewSwitcher />
</div>
```

---

## Implementation Checklist

### Phase 1: Docker Setup
- [ ] Create `.docker/preview/` directory in navi-app
- [ ] Write `Dockerfile`
- [ ] Write `docker-compose.yml`
- [ ] Write `entrypoint.sh`
- [ ] Test Docker setup manually

### Phase 2: Backend
- [ ] Implement `preview-container.ts` service
- [ ] Implement `preview.ts` routes
- [ ] Register routes in `server/index.ts`
- [ ] Add worktree listing endpoint (if not exists)
- [ ] Test backend endpoints

### Phase 3: Frontend
- [ ] Add preview API methods to `api.ts`
- [ ] Create `PreviewSwitcher.svelte` component
- [ ] Add to App.svelte header
- [ ] Test full flow

### Phase 4: Polish
- [ ] Handle Docker not installed gracefully
- [ ] Add loading states
- [ ] Add error recovery
- [ ] Clean up old experimental preview code
- [ ] Test with various project types (Vite, Next, etc.)

### Phase 5: Future Enhancements (Optional)
- [ ] Embed preview in Navi's preview panel
- [ ] Multiple simultaneous previews
- [ ] Remember last previewed branch
- [ ] Preview logs panel in UI

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Docker not installed | Show "Install Docker" message with link |
| Docker not running | Show "Start Docker" message |
| Container fails to start | Display logs in UI for debugging |
| Port 4000 in use | Make port configurable in settings |
| Worktree deleted while preview running | Detect and stop preview gracefully |
| Package.json missing | Show error: "Not a valid Node.js project" |
| No dev script found | Show error with detected project structure |
| Dependencies fail to install | Stream logs so user can see npm errors |
| Slow initial startup | Show "Installing dependencies..." status |
| macOS file system slow | Use `:cached` mount flag |

---

## Security Considerations

1. **Container isolation** - User code runs in container, not on host
2. **Read-only source mount** - Container can't modify user's worktree
3. **Resource limits** - Memory limits prevent runaway processes
4. **No privileged mode** - Container runs with default permissions
5. **Network isolation** - Only preview port exposed

---

## Performance Considerations

1. **Named volumes for node_modules** - Persists between switches, avoids re-download
2. **Bun cache volume** - Speeds up subsequent installs
3. **rsync for source sync** - Efficient incremental updates
4. **Cached mounts** - macOS optimization for bind mounts
5. **Package.json hash check** - Skip install if deps unchanged

---

## Testing Strategy

1. **Manual testing matrix:**
   - Vite project
   - Next.js project
   - Create React App
   - Plain Node.js
   - Monorepo (packages/app structure)

2. **Error scenarios:**
   - Docker not installed
   - Docker not running
   - Invalid worktree path
   - No package.json
   - Dependencies fail to install

3. **Switch scenarios:**
   - Switch between branches
   - Stop and start
   - Switch while installing deps
