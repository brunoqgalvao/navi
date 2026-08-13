# Claude Code UI - Project Instructions

This project is a GUI for Claude Code with preview capabilities.

## Preview Feature

The UI has a built-in file preview panel (inside the Files panel) that can display:
- **Files**: Code files with syntax highlighting
- **Markdown**: Rendered markdown documents
- **Images**: PNG, JPG, GIF, SVG, etc.

There is no embedded browser — URLs open in the user's system browser.

### How to Suggest Previews

When you create or modify files that the user might want to see, suggest they preview it:

1. For files: "You can preview this file using the Files panel on the right"
2. For markdown: "Open it from the Files panel to see the rendered markdown"
3. For web apps: give the localhost URL and let the user open it in their browser

### File Browser

The Files panel shows the project directory structure. Users can:
- Navigate directories by clicking folders
- Click files to preview them
- Use the tabs to switch between Files and Preview

## Development

- Frontend: Svelte 5 + Vite + Tailwind
- Backend: Bun + WebSocket server
- Desktop: Tauri v2

### Commands
- `bun run dev:all` - Run both frontend and backend
- `bun run tauri:dev` - Run as desktop app
- `bun run build` - Build for production
