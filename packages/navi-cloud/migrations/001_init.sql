-- Navi Cloud Registry Schema (Pages-based)

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,              -- subdomain: myapp → myapp.usenavi.app
  name TEXT,                               -- display name
  pages_project TEXT NOT NULL,             -- Cloudflare Pages project name
  pages_url TEXT NOT NULL,                 -- e.g., navi-myapp-abc123.pages.dev
  status TEXT DEFAULT 'live',              -- live, deleted
  deploy_count INTEGER DEFAULT 1,
  last_deployed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(slug);
CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
