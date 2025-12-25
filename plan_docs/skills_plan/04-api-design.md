# API Design

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Library** |||
| GET | `/api/skills` | List all skills in library |
| GET | `/api/skills/:id` | Get skill details |
| POST | `/api/skills` | Create new skill |
| PUT | `/api/skills/:id` | Update skill |
| DELETE | `/api/skills/:id` | Delete skill from library |
| GET | `/api/skills/:id/versions` | Get version history |
| POST | `/api/skills/:id/versions` | Create new version |
| **Enable/Disable** |||
| GET | `/api/skills/enabled` | List globally enabled skills |
| POST | `/api/skills/:id/enable` | Enable skill globally |
| DELETE | `/api/skills/:id/enable` | Disable skill globally |
| GET | `/api/projects/:pid/skills` | List project-enabled skills |
| POST | `/api/projects/:pid/skills/:id/enable` | Enable skill for project |
| DELETE | `/api/projects/:pid/skills/:id/enable` | Disable skill for project |
| **Sync** |||
| POST | `/api/skills/:id/sync-to-library` | Sync enabled changes back to library |
| POST | `/api/skills/:id/update-from-library` | Update enabled copy from library |
| POST | `/api/skills/scan` | Scan filesystem, reconcile with DB |
| **Marketplace** |||
| GET | `/api/marketplace/skills` | Browse marketplace |
| GET | `/api/marketplace/skills/:slug` | Get marketplace skill details |
| POST | `/api/marketplace/skills/:slug/import` | Import to library |
| **Import/Export** |||
| POST | `/api/skills/import` | Import from file/URL |
| GET | `/api/skills/:id/export` | Export skill as zip |

## SKILL.md Round-Tripping Contract

**CRITICAL**: The API and filesystem operations must agree on how SKILL.md is handled.

### Principle

The API **never** accepts or returns raw SKILL.md strings. Instead:
- **Frontmatter fields** are structured data (name, description, version, allowed-tools, license, etc.)
- **Body content** is the markdown instructions after the frontmatter

### Create/Update Flow

```
UI Form → API Request → Filesystem
───────────────────────────────────
{
  name: "my-skill",
  description: "Does X",
  allowed_tools: ["Read", "Grep"],
  license: "MIT",
  body: "# Instructions\n\nDo this..."
}
       ↓
   API validates fields
       ↓
   serializeSkillMd() combines into:
   ---
   name: my-skill
   description: Does X
   allowed-tools: Read, Grep
   license: MIT
   ---
   # Instructions
   
   Do this...
```

### Read Flow

```
Filesystem → API Response → UI
──────────────────────────────
SKILL.md file
       ↓
   parseSkillMd() extracts:
       ↓
{
  frontmatter: {
    name: "my-skill",
    description: "Does X",
    allowed_tools: ["Read", "Grep"],
    license: "MIT"
  },
  body: "# Instructions\n\nDo this..."
}
```

### Supported Frontmatter Fields

Per Claude's skill spec, these fields MUST be preserved:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier (required) |
| `description` | string | What the skill does (required) |
| `version` | string | Semver version |
| `allowed-tools` | string[] | Tool restrictions |
| `license` | string | License type |
| `disable-model-invocation` | boolean | Prevents model use |

Any unrecognized fields should be **preserved** during round-trips.

### Implementation

```typescript
interface SkillMdParsed {
  frontmatter: {
    name: string;
    description: string;
    version?: string;
    'allowed-tools'?: string[];
    license?: string;
    'disable-model-invocation'?: boolean;
    [key: string]: unknown;  // preserve unknown fields
  };
  body: string;
}

function parseSkillMd(content: string): SkillMdParsed { /* ... */ }
function serializeSkillMd(parsed: SkillMdParsed): string { /* ... */ }
```

---

## Request/Response Examples

### List Library Skills

```http
GET /api/skills?category=debugging&search=debug
```

```json
{
  "skills": [
    {
      "id": "sk_abc123",
      "slug": "debug-detective",
      "name": "debug-detective",
      "description": "Systematic debugging approach for complex issues",
      "version": "1.2.0",
      "category": "debugging",
      "tags": ["debug", "logs", "errors"],
      "enabled_globally": true,
      "enabled_projects": ["proj_xyz"],
      "has_update": false,
      "created_at": 1703001234567,
      "updated_at": 1703005678901
    }
  ]
}
```

### Create Skill

```http
POST /api/skills
Content-Type: application/json

{
  "slug": "my-new-skill",
  "name": "My New Skill",
  "description": "What this skill does",
  "body": "# Instructions\n\nDetailed skill instructions go here...",
  "allowed_tools": ["Read", "Grep", "Glob"],
  "license": "MIT",
  "category": "productivity",
  "tags": ["workflow", "automation"]
}
```

```json
{
  "id": "sk_newid",
  "slug": "my-new-skill",
  "name": "my-new-skill",
  "description": "What this skill does",
  "version": "1.0.0",
  "path": "~/.claude-code-ui/skill-library/my-new-skill/SKILL.md",
  "created_at": 1703009999999
}
```

### Enable Skill Globally

```http
POST /api/skills/sk_abc123/enable
```

```json
{
  "success": true,
  "enabled_skill": {
    "id": "es_xyz",
    "skill_id": "sk_abc123",
    "scope": "global",
    "library_version": "1.2.0",
    "path": "~/.claude/skills/debug-detective/",
    "enabled_at": 1703010000000
  }
}
```

### Enable for Project

```http
POST /api/projects/proj_xyz/skills/sk_abc123/enable
```

```json
{
  "success": true,
  "enabled_skill": {
    "id": "es_abc",
    "skill_id": "sk_abc123",
    "scope": "project",
    "project_id": "proj_xyz",
    "library_version": "1.2.0",
    "path": "/path/to/project/.claude/skills/debug-detective/",
    "enabled_at": 1703010000000
  }
}
```

### Get Skill with Status

```http
GET /api/skills/sk_abc123
```

```json
{
  "id": "sk_abc123",
  "slug": "debug-detective",
  "name": "debug-detective",
  "description": "Systematic debugging approach",
  "version": "1.2.0",
  "content": "---\nname: debug-detective\n...",
  "allowed_tools": ["Read", "Grep", "Glob", "Bash"],
  "category": "debugging",
  "tags": ["debug", "logs"],
  "source_type": "local",
  "content_hash": "abc123...",
  
  "enabled": {
    "global": {
      "enabled": true,
      "library_version": "1.2.0",
      "has_local_changes": false,
      "path": "~/.claude/skills/debug-detective/"
    },
    "projects": {
      "proj_xyz": {
        "enabled": true,
        "library_version": "1.1.0",
        "has_local_changes": true,
        "path": "/path/to/project/.claude/skills/debug-detective/"
      }
    }
  },
  
  "versions": [
    { "version": "1.2.0", "created_at": 1703005678901 },
    { "version": "1.1.0", "created_at": 1702001234567 },
    { "version": "1.0.0", "created_at": 1701001234567 }
  ]
}
```

### Sync Changes to Library

```http
POST /api/skills/sk_abc123/sync-to-library
Content-Type: application/json

{
  "source": "global",           // or "project"
  "project_id": null,           // required if source is "project"
  "new_version": "1.3.0",       // optional, auto-bumps patch if omitted
  "changelog": "Fixed edge case in error detection"
}
```

```json
{
  "success": true,
  "skill": {
    "id": "sk_abc123",
    "version": "1.3.0",
    "content_hash": "newHash..."
  },
  "version_created": {
    "version": "1.3.0",
    "changelog": "Fixed edge case in error detection"
  }
}
```

### Import from Marketplace

```http
POST /api/marketplace/skills/code-reviewer/import
```

```json
{
  "success": true,
  "skill": {
    "id": "sk_imported",
    "slug": "code-reviewer",
    "name": "code-reviewer",
    "version": "2.1.0",
    "source_type": "marketplace",
    "source_url": "https://marketplace.example.com/skills/code-reviewer",
    "source_version": "2.1.0"
  }
}
```

### Filesystem Scan

```http
POST /api/skills/scan
```

```json
{
  "success": true,
  "results": {
    "library": {
      "added": ["new-skill"],
      "updated": ["existing-skill"],
      "removed": []
    },
    "global_enabled": {
      "found": ["debug-detective", "concise-writer"],
      "orphaned": [],              // enabled but not in library
      "synced": 2
    },
    "project_enabled": {
      "proj_xyz": {
        "found": ["debug-detective"],
        "orphaned": [],
        "synced": 1
      }
    }
  }
}
```
