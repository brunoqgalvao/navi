---
name: ship-it
description: Deploy apps to Navi Cloud with one command. Use when the user says "ship it", "deploy this", "make it live", "publish", or wants to deploy their vibe-coded app to production.
---

# Ship It - Deploy to Navi Cloud

Deploy apps to `*.usenavi.app` with zero configuration. Database included if needed.

```
┌─────────────────────────────────────────────────────────────────┐
│  "ship it"  →  Build  →  Upload  →  https://myapp.usenavi.app   │
└─────────────────────────────────────────────────────────────────┘
```

## How It Works

1. User says "ship it" or "deploy this"
2. You build the app for production
3. You call the Navi Cloud deploy API
4. User gets a live URL instantly

## Supported Frameworks

| Framework | Build Command | Output Directory |
|-----------|---------------|------------------|
| Static HTML | (none) | project root |
| SvelteKit | `bun run build` | `build/` or `.svelte-kit/output` |
| Vite (React/Vue/Svelte) | `bun run build` | `dist/` |
| Next.js (static) | `bun run build && bun run export` | `out/` |
| Astro | `bun run build` | `dist/` |

## Deployment Flow

### Step 1: Determine Project Type

Check for framework markers:
```bash
# Check package.json for framework
cat package.json | jq '.dependencies // {} | keys'
```

**Framework Detection:**
- `@sveltejs/kit` → SvelteKit
- `next` → Next.js
- `astro` → Astro
- `vite` (without above) → Vite SPA
- No package.json → Static HTML

### Step 2: Build the Project

```bash
# Install dependencies if needed
bun install

# Build based on framework
bun run build
```

### Step 3: Collect Build Output

Determine output directory:
- SvelteKit: `build/` (with adapter-static) or check `svelte.config.js`
- Vite/React/Vue: `dist/`
- Next.js: `out/` (with static export)
- Astro: `dist/`
- Static: project root (filter to .html, .css, .js, images)

### Step 4: Generate Deploy Slug

If user doesn't specify a name, generate one:
```bash
# Use project folder name, sanitized
SLUG=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')
```

Rules:
- 3-30 characters
- lowercase alphanumeric + hyphens
- Must start/end with alphanumeric

### Step 5: Deploy to Navi Cloud

Use the deploy endpoint:

```bash
# Build file list with base64 content
FILES=$(find BUILD_DIR -type f | while read f; do
  REL_PATH="${f#BUILD_DIR/}"
  CONTENT=$(base64 < "$f" | tr -d '\n')
  echo "{\"path\": \"$REL_PATH\", \"content\": \"$CONTENT\"}"
done | jq -s '.')

# Deploy
curl -X POST http://localhost:3001/api/deploy \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\": \"$SLUG\",
    \"framework\": \"$FRAMEWORK\",
    \"needsDatabase\": false,
    \"files\": $FILES
  }"
```

### Step 6: Report Success

```
Shipped!

Your app is live at: https://myapp.usenavi.app

Deployment details:
- Framework: SvelteKit
- Files: 23
- Deploy time: 4.2s
```

## Database Support

If the app needs a database (detected by Drizzle/Prisma config, or user request):

```bash
# Set needsDatabase: true in deploy request
# Navi Cloud creates a D1 database and returns connection info
```

The response includes:
```json
{
  "database": {
    "id": "abc123",
    "name": "navi-myapp-db",
    "connectionUrl": "..."
  }
}
```

## Example Conversations

### Simple Deploy
```
User: ship it
Claude: Building your SvelteKit app...
        → bun run build
        Deploying to Navi Cloud...

        Shipped! Your app is live at: https://my-project.usenavi.app
```

### With Custom Name
```
User: deploy this as "habit-tracker"
Claude: Building...
        Shipped! Your app is live at: https://habit-tracker.usenavi.app
```

### With Database
```
User: ship it, I need a database
Claude: Building...
        Creating D1 database...
        Shipped!

        App: https://my-project.usenavi.app
        Database: navi-my-project-db (D1)
```

## Error Handling

| Error | Solution |
|-------|----------|
| Build failed | Show error output, help fix |
| Slug taken | Suggest alternatives with suffix |
| No build output | Check framework detection, build command |
| Deploy API error | Retry once, then report to user |

## Important Notes

1. **Build before deploy** - Always run the build command first
2. **Check for errors** - Don't deploy if build fails
3. **Sanitize slugs** - Enforce naming rules
4. **Report progress** - Keep user informed during deploy
5. **Show final URL prominently** - The whole point is the live link!

## API Reference

### Deploy Endpoint (via Navi backend proxy)

```
POST http://localhost:3001/api/deploy
```

Request:
```json
{
  "slug": "my-app",
  "name": "My App",
  "framework": "sveltekit",
  "needsDatabase": false,
  "files": [
    { "path": "index.html", "content": "base64..." },
    { "path": "app.js", "content": "base64..." }
  ]
}
```

Response:
```json
{
  "success": true,
  "url": "https://my-app.usenavi.app",
  "pagesUrl": "https://navi-my-app-abc123.pages.dev",
  "deploymentId": "xyz789",
  "database": null
}
```

### Check Status

```
GET http://localhost:3001/api/deploy/my-app
```

### List Deployed Apps

```
GET http://localhost:3001/api/deploy
```

---

## Quick Reference

When user says "ship it":

1. `bun install && bun run build`
2. Find build output directory
3. Generate/validate slug
4. POST to `/api/deploy` with files
5. Show user their live URL
