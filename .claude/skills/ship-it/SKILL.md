---
name: ship-it
description: Deploy apps to Navi Cloud with one command. Use when the user says "ship it", "deploy this", "make it live", "publish", or wants to deploy their vibe-coded app to production.
---

# Ship It - Deploy to Navi Cloud

Deploy apps to `*.usenavi.app` with zero configuration.

```
┌─────────────────────────────────────────────────────────────────┐
│  "ship it"  →  Build  →  Upload  →  https://myapp.usenavi.app   │
└─────────────────────────────────────────────────────────────────┘
```

## Stack

- **Framework**: Vite + React (default)
- **Hosting**: Cloudflare Workers for Platforms
- **Database**: D1 (SQLite, optional)
- **Auth**: Navi Auth (built-in, optional)

## The Flow

### Step 1: Check Project Type

```bash
# Check package.json
cat package.json | jq -r '.dependencies | keys[]' 2>/dev/null
```

**Detection:**
- Has `react` + `vite` → Vite React (default)
- Has `@sveltejs/kit` → Not supported yet, build as static
- No package.json or no framework → Static HTML

### Step 2: Build the Project

```bash
# Install dependencies
bun install

# Build
bun run build
```

**Build output locations:**
- Vite: `dist/`
- Static: project root (`.html`, `.css`, `.js` files only)

### Step 3: Generate Slug

If user doesn't specify a name:

```bash
# Use folder name, sanitized
SLUG=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | head -c 30)
```

**Rules:**
- 3-30 characters
- Lowercase alphanumeric + hyphens only
- Must start/end with alphanumeric

### Step 4: Collect Files

```bash
# Find build output
BUILD_DIR="dist"  # or project root for static

# Collect files with base64 content
find "$BUILD_DIR" -type f | while read f; do
  REL_PATH="${f#$BUILD_DIR/}"
  CONTENT=$(base64 < "$f" | tr -d '\n')
  echo "{\"path\": \"$REL_PATH\", \"content\": \"$CONTENT\"}"
done
```

**Skip:**
- Files > 10MB
- `node_modules/`
- Hidden files (`.git`, etc.)

### Step 5: Deploy

```bash
# POST to Navi Cloud API
curl -X POST http://localhost:3001/api/deploy \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\": \"$SLUG\",
    \"framework\": \"vite-react\",
    \"needsDatabase\": false,
    \"files\": [...]
  }"
```

### Step 6: Report Success

```
Shipped!

Your app is live at: https://myapp.usenavi.app

Details:
- Framework: Vite + React
- Files: 23
- Size: 1.2 MB
```

## Database Support

If user needs a database:

```bash
# Add needsDatabase: true
{
  "slug": "myapp",
  "needsDatabase": true,
  ...
}
```

Response includes:
```json
{
  "database": {
    "id": "abc123",
    "name": "navi-myapp-db"
  }
}
```

The app can access it via `env.DB` in Workers.

## Example Conversations

### Simple Deploy

```
User: ship it

Claude: Building your Vite + React app...
        → bun run build ✓

        Deploying to Navi Cloud...
        → 23 files, 1.2 MB

        Shipped! Your app is live at:
        https://my-project.usenavi.app
```

### With Custom Name

```
User: deploy this as "habit-tracker"

Claude: Building...
        Deployed!

        https://habit-tracker.usenavi.app
```

### With Database

```
User: ship it, I need a database

Claude: Building...
        Creating D1 database...
        Deployed!

        App: https://my-project.usenavi.app
        Database: navi-my-project-db

        Access the database in your app:
        - Workers: env.DB.prepare(...)
```

## Error Handling

| Error | Solution |
|-------|----------|
| Build failed | Show error, help fix |
| Slug taken | Suggest adding suffix: `myapp-2` |
| No build output | Check build command, verify dist/ exists |
| Files too large | Skip large files, warn user |
| API error | Retry once, then report |

## API Reference

### Deploy Endpoint

```
POST http://localhost:3001/api/deploy

Request:
{
  "slug": "my-app",
  "name": "My App",
  "framework": "vite-react",
  "needsDatabase": false,
  "files": [
    { "path": "index.html", "content": "base64..." }
  ]
}

Response:
{
  "success": true,
  "url": "https://my-app.usenavi.app",
  "slug": "my-app",
  "deployCount": 1,
  "database": null
}
```

### Check Status

```
GET http://localhost:3001/api/deploy/my-app
```

### List All Apps

```
GET http://localhost:3001/api/deploys
```

### Delete App

```
DELETE http://localhost:3001/api/deploy/my-app
```

## Supported Frameworks

| Framework | Build Command | Output Dir | Status |
|-----------|---------------|------------|--------|
| Vite + React | `bun run build` | `dist/` | ✅ |
| Static HTML | (none) | `.` | ✅ |
| Vite + Vue | `bun run build` | `dist/` | ✅ |
| Vite + Svelte | `bun run build` | `dist/` | ✅ |
| Next.js | Not supported | - | ❌ |
| SvelteKit | Not supported | - | ❌ |

**Note:** SSR frameworks (Next.js, SvelteKit) are not supported yet. Only static builds work.

## Quick Reference

When user says "ship it":

1. Check for `package.json` and framework
2. Run `bun install && bun run build`
3. Find build output (`dist/` or root)
4. Generate slug from folder name
5. Collect files as base64
6. POST to `/api/deploy`
7. Show user their live URL

## Important

- **Always build first** - Don't deploy source files
- **Check build success** - Don't deploy if build fails
- **Show the URL prominently** - That's the whole point!
- **Warn about large files** - Skip files > 10MB
