-- Navi Cloud Registry Schema
-- Central database tracking all deployed apps and their resources

-- Deployed apps registry
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,                    -- nanoid
  slug TEXT UNIQUE NOT NULL,              -- subdomain: myapp → myapp.usenavi.app
  name TEXT,                               -- display name

  -- Worker info
  worker_name TEXT NOT NULL,               -- name in dispatch namespace

  -- Database info (D1 per app)
  d1_database_id TEXT,                     -- D1 database UUID
  d1_database_name TEXT,                   -- D1 database name

  -- App metadata
  framework TEXT DEFAULT 'vite-react',     -- vite-react, static
  has_auth BOOLEAN DEFAULT FALSE,          -- uses Navi Auth

  -- Status
  status TEXT DEFAULT 'deploying',         -- deploying, live, failed, suspended, deleted

  -- Stats
  deploy_count INTEGER DEFAULT 1,
  last_deployed_at TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Deployment history
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending',           -- pending, uploading, live, failed

  -- Deployment details
  files_count INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,            -- bytes

  -- Error tracking
  error_message TEXT,

  -- Timestamps
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(slug);
CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
CREATE INDEX IF NOT EXISTS idx_deployments_app_id ON deployments(app_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
