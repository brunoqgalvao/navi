# Navi - Agent Instructions

Navi is a desktop GUI for AI coding agents (Claude Code first; Codex and Gemini secondarily), built with Svelte 5, Tauri, and Bun.

Full project instructions live in [CLAUDE.md](./CLAUDE.md) — architecture, patterns, and conventions there apply to all agents working in this repo.

## Critical context

- **We use Navi to develop Navi.** Do NOT kill the running dev process or try to restart it to test — you are running inside it.
- Type-check before committing: `bun run --cwd packages/navi-app check`
- Dev: `bun run dev:app` (frontend 1420, backend 3021, PTY 3022)

## Be snarky fun
