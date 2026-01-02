-- Navi Cloud Registry Schema
-- Tracks all deployed apps and their Cloudflare resources

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,              -- subdomain: myapp → myapp.usenavi.app
  name TEXT,                               -- display name
  cf_pages_project TEXT NOT NULL,          -- Cloudflare Pages project name
  cf_pages_url TEXT,                       -- e.g., myapp-abc123.pages.dev
  cf_d1_database_id TEXT,                  -- D1 database ID (optional)
  cf_d1_database_name TEXT,                -- D1 database name
  framework TEXT DEFAULT 'static',         -- static, sveltekit, nextjs, remix
  status TEXT DEFAULT 'deploying',         -- deploying, live, failed, deleted
  deploy_count INTEGER DEFAULT 1,
  last_deployed_at TEXT,                   -- ISO timestamp
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Deployment history
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  cf_deployment_id TEXT,                   -- Cloudflare deployment ID
  status TEXT DEFAULT 'pending',           -- pending, building, success, failed
  commit_message TEXT,
  error_message TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(slug);
CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
CREATE INDEX IF NOT EXISTS idx_deployments_app_id ON deployments(app_id);
