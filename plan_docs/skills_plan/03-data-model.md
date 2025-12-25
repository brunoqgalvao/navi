# Data Model

## Database Schema

### skills table (Library)

```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,           -- matches directory name
  name TEXT NOT NULL,                   -- from SKILL.md frontmatter
  description TEXT NOT NULL,            -- from SKILL.md frontmatter
  version TEXT DEFAULT '1.0.0',
  allowed_tools TEXT,                   -- JSON array or comma-separated
  license TEXT,
  
  -- Our metadata (not in SKILL.md)
  category TEXT,                        -- user-defined category
  tags TEXT,                            -- JSON array
  content_hash TEXT NOT NULL,           -- SHA256 of entire skill directory (all files)
  
  -- Marketplace tracking
  source_type TEXT,                     -- 'local' | 'marketplace' | 'import'
  source_url TEXT,                      -- if imported
  source_version TEXT,                  -- version when imported
  
  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_skills_slug ON skills(slug);
CREATE INDEX idx_skills_category ON skills(category);
```

### enabled_skills table

```sql
CREATE TABLE enabled_skills (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  scope TEXT NOT NULL,                  -- 'global' | 'project'
  project_id TEXT,                      -- NULL for global scope
  
  -- Version tracking
  library_version TEXT NOT NULL,        -- version when enabled/copied
  local_hash TEXT NOT NULL,             -- current hash of enabled copy
  has_local_changes INTEGER DEFAULT 0,  -- 1 if diverged from library
  
  -- Timestamps
  enabled_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  -- Note: SQLite treats NULL as distinct, so we use COALESCE for uniqueness
  UNIQUE(skill_id, COALESCE(project_id, '__GLOBAL__'))
);

CREATE INDEX idx_enabled_skills_scope ON enabled_skills(scope, project_id);
CREATE INDEX idx_enabled_skills_skill ON enabled_skills(skill_id);
```

### skill_versions table (Version History)

```sql
CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  changelog TEXT,                       -- optional release notes
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  UNIQUE(skill_id, version)
);

CREATE INDEX idx_skill_versions_skill ON skill_versions(skill_id);
```

### marketplace_cache table

```sql
CREATE TABLE marketplace_cache (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT,
  version TEXT NOT NULL,
  download_url TEXT NOT NULL,
  
  -- Stats
  downloads INTEGER DEFAULT 0,
  rating REAL,
  
  -- Cache metadata
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_marketplace_slug ON marketplace_cache(slug);
```

## TypeScript Interfaces

```typescript
// Core skill from library
interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  allowed_tools?: string[];
  license?: string;
  
  // Our metadata
  category?: string;
  tags?: string[];
  content_hash: string;
  
  // Source tracking
  source_type: 'local' | 'marketplace' | 'import';
  source_url?: string;
  source_version?: string;
  
  created_at: number;
  updated_at: number;
}

// Enabled skill instance
interface EnabledSkill {
  id: string;
  skill_id: string;
  scope: 'global' | 'project';
  project_id?: string;
  
  library_version: string;
  local_hash: string;
  has_local_changes: boolean;
  
  enabled_at: number;
  updated_at: number;
  
  // Joined data
  skill?: Skill;
}

// Version history entry
interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  content_hash: string;
  changelog?: string;
  created_at: number;
}

// Marketplace listing
interface MarketplaceSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  author?: string;
  version: string;
  download_url: string;
  downloads?: number;
  rating?: number;
  cached_at: number;
}

// UI view model - skill with status
interface SkillWithStatus extends Skill {
  enabled_globally: boolean;
  enabled_projects: string[];  // project IDs where enabled
  has_update: boolean;         // newer version in marketplace
  global_has_changes: boolean;
  project_changes: { [projectId: string]: boolean };
}
```

## Content Hash Calculation

The content hash covers the **entire skill directory** (all files recursively), not just SKILL.md.
This ensures any change to scripts, assets, or the skill definition triggers change detection.

```typescript
import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Calculate SHA256 hash of entire skill directory.
 * 
 * Hash includes:
 * - All file names (for detecting renames/additions/deletions)
 * - All file contents
 * - Sorted for deterministic ordering
 * 
 * Does NOT include:
 * - File permissions (handled separately during copy)
 * - Timestamps
 */
function calculateSkillHash(skillPath: string): string {
  const hash = createHash('sha256');
  
  function hashDir(dir: string, prefix: string = '') {
    const entries = readdirSync(dir).sort();
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = prefix ? `${prefix}/${entry}` : entry;
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Include directory marker for empty dir detection
        hash.update(`DIR:${relativePath}\n`);
        hashDir(fullPath, relativePath);
      } else {
        // Include relative path and content
        hash.update(`FILE:${relativePath}\n`);
        hash.update(readFileSync(fullPath));
      }
    }
  }
  
  hashDir(skillPath);
  return hash.digest('hex');
}
```
