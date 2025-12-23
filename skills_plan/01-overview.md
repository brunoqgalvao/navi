# Agent Skills Feature - Implementation Plan

## Overview

Integrate Claude Code's native Agent Skills as a core feature of the UI, providing:

- Skill library management (create, edit, delete, version)
- Enable/disable skills at global and project levels
- Marketplace for discovering and importing skills
- Full compliance with Claude's skill specification

## Architecture Principle

**Filesystem is source of truth** - Claude reads skills from disk. Our DB is a cache/index for fast UI rendering and metadata tracking.

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                 │
│  Settings → Skills Tab    │    Project → Skills Panel            │
└─────────────────┬─────────────────────────┬─────────────────────┘
                  │                         │
                  ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Layer                                  │
│  /api/skills/*           │    /api/projects/:id/skills/*        │
└─────────────────┬─────────────────────────┬─────────────────────┘
                  │                         │
                  ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Filesystem + DB                               │
│                                                                  │
│  ~/.claude-code-ui/skill-library/    (our managed store)        │
│  ~/.claude/skills/                    (global enabled - copies)  │
│  {project}/.claude/skills/            (project enabled - copies) │
│                                                                  │
│  DB: metadata cache, version tracking, marketplace cache         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `~/.claude-code-ui/skill-library/` | All skills you own (source library) |
| `~/.claude-code-ui/marketplace-cache/` | Downloaded but not added to library |
| `~/.claude/skills/` | Globally enabled skills (copies from library) |
| `{project}/.claude/skills/` | Project-enabled skills (copies from library) |

## Core Concepts

### 1. Skill Library
Your personal collection of skills. All skills live here first, whether created locally or imported from marketplace.

### 2. Enabled Skills
Copies of library skills placed where Claude can discover them. Editable independently - can diverge from library version.

### 3. Versioning
- Library skills are versioned (semver)
- Enabled copies track which library version they came from
- UI shows sync status (synced / local changes / update available)

### 4. Marketplace
Local-first for now. Future: cloud sync and community sharing.
