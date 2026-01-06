# Navi Cloud

Zero-config deployment platform for Navi. Ship apps to `*.usenavi.app` instantly.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Navi Desktop                             │
│                                                                   │
│    User: "ship it"  →  Build  →  POST /deploy                    │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                    api.usenavi.app (API Worker)                   │
│                                                                   │
│  POST /deploy       Create/update app                            │
│  GET  /deploy/:slug Get app status                               │
│  DELETE /deploy/:slug Delete app                                 │
│  GET  /apps         List all apps                                │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Workers for Platforms ($25/mo)                   │
│                                                                   │
│  Dispatch Worker    Routes *.usenavi.app to user workers         │
│  User Workers       One per deployed app (in dispatch namespace) │
│  D1 Databases       One per app that needs a database            │
└──────────────────────────────────────────────────────────────────┘
```

## Stack

| Component | Tech |
|-----------|------|
| **Hosting** | Cloudflare Workers for Platforms |
| **Database** | D1 (SQLite, one per app) |
| **Auth** | Navi Auth (built-in, session-based) |
| **Framework** | Vite + React (default) |

## Pricing

Workers for Platforms: **$25/month flat** includes:
- 20 million requests
- 60 million CPU milliseconds
- 1,000 scripts (user apps)

Overage:
- $0.30 per million additional requests
- $0.02 per additional script
- D1 is essentially free for most usage

## Setup (One-Time)

### Prerequisites

1. Cloudflare account with Workers for Platforms enabled
2. `usenavi.app` domain added to Cloudflare
3. Wrangler CLI: `npm install -g wrangler`

### 1. Login to Cloudflare

```bash
wrangler login
```

### 2. Create Resources

```bash
cd packages/navi-cloud

# Create D1 database
wrangler d1 create navi-cloud-registry
# Copy the database_id to wrangler.toml and wrangler.api.toml

# Create dispatch namespace (requires Workers for Platforms)
wrangler dispatch-namespace create navi-user-apps

# Run migrations
wrangler d1 execute navi-cloud-registry --file=./migrations/001_init.sql
```

### 3. Set Secrets

```bash
# For API worker
wrangler secret put DEPLOY_SECRET --config wrangler.api.toml
wrangler secret put CLOUDFLARE_API_TOKEN --config wrangler.api.toml
wrangler secret put CLOUDFLARE_ACCOUNT_ID --config wrangler.api.toml

# For dispatch worker
wrangler secret put DEPLOY_SECRET
```

### 4. Deploy Workers

```bash
# Deploy both workers
npm run deploy:all
```

### 5. Configure DNS

In Cloudflare DNS for `usenavi.app`:

```
Type: AAAA
Name: *
Content: 100::
Proxy: ON (orange cloud)

Type: AAAA
Name: api
Content: 100::
Proxy: ON (orange cloud)
```

## Development

```bash
# Install deps
npm install

# Run dispatch worker locally
npm run dev

# Run API worker locally
npm run dev:api

# View logs
npm run tail
npm run tail:api
```

## API Reference

### Deploy App

```bash
POST https://api.usenavi.app/deploy
Authorization: Bearer <DEPLOY_SECRET>
Content-Type: application/json

{
  "slug": "my-app",
  "name": "My App",
  "framework": "vite-react",
  "needsDatabase": false,
  "needsAuth": false,
  "files": [
    { "path": "index.html", "content": "<base64>" },
    { "path": "assets/app.js", "content": "<base64>" }
  ]
}
```

Response:
```json
{
  "success": true,
  "url": "https://my-app.usenavi.app",
  "slug": "my-app",
  "deployCount": 1,
  "database": null,
  "hasAuth": false
}
```

### Get App Status

```bash
GET https://api.usenavi.app/deploy/my-app
Authorization: Bearer <DEPLOY_SECRET>
```

### List Apps

```bash
GET https://api.usenavi.app/apps
Authorization: Bearer <DEPLOY_SECRET>
```

### Delete App

```bash
DELETE https://api.usenavi.app/deploy/my-app
Authorization: Bearer <DEPLOY_SECRET>
```

## Environment Variables

### Navi Desktop (.env)

```env
NAVI_CLOUD_API=https://api.usenavi.app
NAVI_CLOUD_SECRET=<your-deploy-secret>
```

### Cloudflare Workers (secrets)

```
DEPLOY_SECRET=<shared-secret>
CLOUDFLARE_API_TOKEN=<cf-api-token>
CLOUDFLARE_ACCOUNT_ID=<cf-account-id>
```

## File Structure

```
packages/navi-cloud/
├── src/
│   ├── dispatch.ts      # Routes *.usenavi.app to user workers
│   └── api.ts           # Handles deploy API requests
├── migrations/
│   └── 001_init.sql     # Registry database schema
├── wrangler.toml        # Dispatch worker config
├── wrangler.api.toml    # API worker config
└── package.json
```

## How It Works

1. **Deploy request** comes in with files (base64 encoded)
2. **API Worker** generates a user Worker script that serves those files
3. **User Worker** is uploaded to the dispatch namespace
4. **Registry** records the app → worker mapping in D1
5. **Dispatch Worker** receives requests to `*.usenavi.app`
6. **Lookup** finds the worker name from registry
7. **Forward** request to the user's Worker
8. **Response** served from the user's static files

## Limitations

- Static files only (no server-side code in user apps yet)
- Max ~25MB per app (Worker script size limit)
- D1 database per app (not shared)

## Future Enhancements

- [ ] API routes in user apps (serverless functions)
- [ ] Navi Auth integration
- [ ] Custom domains per app
- [ ] Build logs streaming
- [ ] Rollback to previous deployments
