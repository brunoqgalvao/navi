# Navi Preview System (Colima-based)

## Overview

Session-aware preview system that runs dev servers in isolated Docker containers via Colima.
Each session's worktree gets its own preview container, automatically managed based on session lifecycle.

## Architecture

```
Session A (worktree) ←→ Container A → {slug}-a.preview.localhost:4000
Session B (worktree) ←→ Container B → {slug}-b.preview.localhost:4000
Session C (main)     ←→ Container C → {slug}-main.preview.localhost:4000

All routed through Traefik proxy on port 4000
```

## Key Design Decisions

1. **Session-bound previews**: Preview is tied to session's worktree, not a separate selector
2. **Auto-lifecycle**: Preview starts when requested, pauses after idle, cleans up with session
3. **Subdomain routing**: Each preview gets `{slug}.preview.localhost:4000`
4. **Resource limits**: 1GB RAM, 2 CPU per container max
5. **Framework detection**: Auto-detect Vite/Next/etc and inject proper port binding

## Files

```
server/services/preview/
├── index.ts              # Main PreviewService class (singleton)
├── types.ts              # TypeScript interfaces
├── runtime-detector.ts   # Detect Colima/Docker/OrbStack
├── framework-detector.ts # Detect framework, build dev command
├── container-manager.ts  # Docker container lifecycle
├── proxy-manager.ts      # Traefik setup and routing
└── README.md             # This file
```

## API Endpoints

Existing routes enhanced (in `routes/worktree-preview.ts`):
- `POST /api/sessions/:id/worktree/preview` - Start container preview
- `DELETE /api/sessions/:id/worktree/preview` - Stop container preview
- `GET /api/sessions/:id/worktree/preview` - Get preview status + URL

New routes:
- `GET /api/preview/runtime` - Check Colima/Docker status
- `POST /api/preview/setup` - Initialize Traefik proxy

## Usage

```typescript
import { previewService } from './services/preview';

// Initialize on server start
await previewService.initialize();

// Start preview for a session
const preview = await previewService.startPreview(sessionId);
// Returns: { url: 'http://myapp-feature.preview.localhost:4000', status: 'starting' }

// Preview auto-binds to session's worktree_path
// When session is deleted, preview is cleaned up
```

## Requirements

- Colima (recommended) or Docker Desktop or OrbStack
- macOS (primary target)

Install Colima:
```bash
brew install colima docker
colima start --cpu 4 --memory 4 --disk 60
```
