# Navi Cloud

Zero-config deployment for Navi apps. Ship to `*.usenavi.app` with one command.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Navi Desktop App                          │
│                                                                   │
│  User: "ship it"  →  Claude builds & deploys                     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Navi Cloud API                              │
│                    (Cloudflare Worker)                            │
│                                                                   │
│  POST /deploy       Create/update deployment                     │
│  GET  /deploy/:slug Get deployment status                        │
│  DELETE /deploy/:slug Delete deployment                          │
│  GET  /apps         List all apps                                │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Cloudflare Infrastructure                     │
│                                                                   │
│  Pages Projects      One per deployed app                        │
│  D1 Databases        One per app (if needed)                     │
│  Router Worker       *.usenavi.app → correct Pages project       │
└──────────────────────────────────────────────────────────────────┘
```

## Setup (One-Time)

### 1. Cloudflare Account

Create a Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com).

### 2. Add usenavi.app Domain

1. Go to Cloudflare Dashboard → Add Site
2. Add `usenavi.app` domain
3. Update nameservers at your registrar
4. Enable "Proxy" (orange cloud) for DNS

### 3. Configure Wildcard DNS

```
Type: A
Name: *
Content: 192.0.2.1 (placeholder, will be proxied)
Proxy: ON
```

This routes all `*.usenavi.app` subdomains through Cloudflare.

### 4. Create API Token

1. Go to My Profile → API Tokens
2. Create Token with these permissions:
   - **Cloudflare Pages**: Edit
   - **D1**: Edit
   - **Account**: Read
3. Save the token securely

### 5. Create D1 Database (Registry)

```bash
cd packages/navi-cloud
bun install
wrangler d1 create navi-cloud-registry
```

Copy the database ID to `wrangler.toml` and `wrangler.router.toml`.

### 6. Run Migrations

```bash
wrangler d1 execute navi-cloud-registry --file=./migrations/001_init.sql
```

### 7. Set Secrets

```bash
# API Worker
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put DEPLOY_SECRET

# Router Worker (shares database, no secrets needed)
```

### 8. Deploy Workers

```bash
# Deploy API worker
bun run deploy

# Deploy router worker
bun run deploy:router
```

## Usage

### From Navi Desktop

Just say "ship it" or "deploy this" to Claude. It will:

1. Build your project
2. Upload to Navi Cloud
3. Return a live URL

### Programmatic API

```bash
# Deploy
curl -X POST https://api.usenavi.app/deploy \
  -H "Authorization: Bearer $DEPLOY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-app",
    "framework": "sveltekit",
    "files": [
      {"path": "index.html", "content": "base64..."}
    ]
  }'

# Response
{
  "success": true,
  "url": "https://my-app.usenavi.app",
  "pagesUrl": "https://navi-my-app-abc123.pages.dev"
}
```

## Development

```bash
# Install deps
bun install

# Run locally
bun run dev

# Deploy to production
bun run deploy
```

## Environment Variables

### Navi App (.env)

```env
NAVI_CLOUD_API=https://api.usenavi.app
NAVI_CLOUD_SECRET=your-deploy-secret
```

### Cloudflare Worker (secrets)

```
CLOUDFLARE_API_TOKEN=your-cf-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
DEPLOY_SECRET=shared-secret-with-navi-app
```

## Costs

- **Cloudflare Workers**: Free tier = 100k requests/day
- **Cloudflare Pages**: Unlimited sites, 500 builds/month free
- **D1 Database**: 5GB free, 5M rows read/day

At scale, roughly $0.15/million requests + $0.75/million D1 reads.

## Troubleshooting

### "App not found" at subdomain

1. Check DNS is proxied (orange cloud)
2. Verify router worker is deployed
3. Check app exists in D1 registry

### Deploy fails

1. Verify API token has Pages + D1 permissions
2. Check project name doesn't conflict
3. Look at worker logs: `wrangler tail`

### Build not found

1. Make sure you ran `bun run build` first
2. Check the output directory matches your framework
3. Verify files exist in build directory
