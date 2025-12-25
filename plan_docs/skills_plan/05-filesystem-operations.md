# Filesystem Operations

## Directory Structure

```
~/.claude-code-ui/
├── skill-library/                    # Our managed skill store
│   ├── debug-detective/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── concise-writer/
│   │   └── SKILL.md
│   └── code-reviewer/
│       ├── SKILL.md
│       └── scripts/
│
└── marketplace-cache/                # Downloaded, not yet imported
    └── downloaded-skill/
        └── SKILL.md

~/.claude/
└── skills/                           # Global enabled (copies)
    ├── debug-detective/              # Copy from library
    │   └── SKILL.md
    └── concise-writer/
        └── SKILL.md

{project}/
└── .claude/
    └── skills/                       # Project enabled (copies)
        └── debug-detective/
            └── SKILL.md
```

## Core Operations

### 1. Create Skill

```typescript
async function createSkill(data: CreateSkillInput): Promise<Skill> {
  const slug = data.slug || slugify(data.name);
  
  // SECURITY: Validate slug before any filesystem operations
  validateSlug(slug);
  
  const skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);
  
  // 1. Validate slug doesn't exist
  if (existsSync(skillDir)) {
    throw new Error(`Skill "${slug}" already exists`);
  }
  
  // 2. Create directory structure
  mkdirSync(skillDir, { recursive: true });
  
  // 3. Write SKILL.md
  const skillMd = generateSkillMd({
    name: data.name,
    description: data.description,
    version: '1.0.0',
    allowed_tools: data.allowed_tools,
    content: data.content
  });
  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
  
  // 4. Calculate hash
  const contentHash = calculateSkillHash(skillDir);
  
  // 5. Insert into DB
  const skill = {
    id: generateId(),
    slug,
    name: data.name,
    description: data.description,
    version: '1.0.0',
    content_hash: contentHash,
    source_type: 'local',
    category: data.category,
    tags: data.tags,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  
  db.skills.create(skill);
  
  return skill;
}
```

### 2. Enable Skill (Copy to Target)

```typescript
async function enableSkill(
  skillId: string,
  scope: 'global' | 'project',
  projectId?: string
): Promise<EnabledSkill> {
  const skill = db.skills.get(skillId);
  if (!skill) throw new Error('Skill not found');
  
  // 1. Determine target directory
  const targetDir = scope === 'global'
    ? join(CLAUDE_GLOBAL_SKILLS, skill.slug)
    : join(getProjectPath(projectId!), '.claude', 'skills', skill.slug);
  
  // 2. Ensure parent exists
  mkdirSync(dirname(targetDir), { recursive: true });
  
  // 3. Copy skill directory
  const sourceDir = join(SKILL_LIBRARY_PATH, skill.slug);
  copyDirRecursive(sourceDir, targetDir);
  
  // 4. Calculate hash of copy
  const localHash = calculateSkillHash(targetDir);
  
  // 5. Record in DB
  const enabled = {
    id: generateId(),
    skill_id: skillId,
    scope,
    project_id: projectId || null,
    library_version: skill.version,
    local_hash: localHash,
    has_local_changes: false,
    enabled_at: Date.now(),
    updated_at: Date.now()
  };
  
  db.enabled_skills.create(enabled);
  
  return enabled;
}
```

### 3. Disable Skill (Remove Copy)

```typescript
async function disableSkill(
  skillId: string,
  scope: 'global' | 'project',
  projectId?: string
): Promise<void> {
  const skill = db.skills.get(skillId);
  if (!skill) throw new Error('Skill not found');
  
  // 1. Determine target directory
  const targetDir = scope === 'global'
    ? join(CLAUDE_GLOBAL_SKILLS, skill.slug)
    : join(getProjectPath(projectId!), '.claude', 'skills', skill.slug);
  
  // 2. Remove directory
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true });
  }
  
  // 3. Remove from DB
  db.enabled_skills.delete(skillId, scope, projectId);
}
```

### 4. Detect Local Changes

```typescript
async function checkForLocalChanges(
  skillId: string,
  scope: 'global' | 'project',
  projectId?: string
): Promise<boolean> {
  const enabled = db.enabled_skills.get(skillId, scope, projectId);
  if (!enabled) return false;
  
  const skill = db.skills.get(skillId);
  const targetDir = scope === 'global'
    ? join(CLAUDE_GLOBAL_SKILLS, skill.slug)
    : join(getProjectPath(projectId!), '.claude', 'skills', skill.slug);
  
  if (!existsSync(targetDir)) {
    // Skill was deleted externally
    db.enabled_skills.delete(skillId, scope, projectId);
    return false;
  }
  
  const currentHash = calculateSkillHash(targetDir);
  const hasChanges = currentHash !== enabled.local_hash;
  
  if (hasChanges !== enabled.has_local_changes) {
    db.enabled_skills.update(enabled.id, {
      local_hash: currentHash,
      has_local_changes: hasChanges,
      updated_at: Date.now()
    });
  }
  
  return hasChanges;
}
```

### 5. Sync to Library

```typescript
async function syncToLibrary(
  skillId: string,
  scope: 'global' | 'project',
  projectId?: string,
  newVersion?: string
): Promise<Skill> {
  const skill = db.skills.get(skillId);
  const enabled = db.enabled_skills.get(skillId, scope, projectId);
  
  const sourceDir = scope === 'global'
    ? join(CLAUDE_GLOBAL_SKILLS, skill.slug)
    : join(getProjectPath(projectId!), '.claude', 'skills', skill.slug);
  
  const libraryDir = join(SKILL_LIBRARY_PATH, skill.slug);
  
  // 1. Determine new version
  const version = newVersion || bumpPatch(skill.version);
  
  // 2. Copy back to library
  rmSync(libraryDir, { recursive: true });
  copyDirRecursive(sourceDir, libraryDir);
  
  // 3. Update SKILL.md version
  updateSkillMdVersion(join(libraryDir, 'SKILL.md'), version);
  
  // 4. Calculate new hash
  const newHash = calculateSkillHash(libraryDir);
  
  // 5. Update DB
  db.skills.update(skillId, {
    version,
    content_hash: newHash,
    updated_at: Date.now()
  });
  
  // 6. Create version record
  db.skill_versions.create({
    id: generateId(),
    skill_id: skillId,
    version,
    content_hash: newHash,
    created_at: Date.now()
  });
  
  // 7. Mark enabled as synced
  db.enabled_skills.update(enabled.id, {
    library_version: version,
    local_hash: newHash,
    has_local_changes: false,
    updated_at: Date.now()
  });
  
  return db.skills.get(skillId);
}
```

### 6. Update from Library

```typescript
async function updateFromLibrary(
  skillId: string,
  scope: 'global' | 'project',
  projectId?: string
): Promise<EnabledSkill> {
  const skill = db.skills.get(skillId);
  const enabled = db.enabled_skills.get(skillId, scope, projectId);
  
  const sourceDir = join(SKILL_LIBRARY_PATH, skill.slug);
  const targetDir = scope === 'global'
    ? join(CLAUDE_GLOBAL_SKILLS, skill.slug)
    : join(getProjectPath(projectId!), '.claude', 'skills', skill.slug);
  
  // 1. Remove old copy
  rmSync(targetDir, { recursive: true });
  
  // 2. Copy fresh from library
  copyDirRecursive(sourceDir, targetDir);
  
  // 3. Update DB
  const newHash = calculateSkillHash(targetDir);
  db.enabled_skills.update(enabled.id, {
    library_version: skill.version,
    local_hash: newHash,
    has_local_changes: false,
    updated_at: Date.now()
  });
  
  return db.enabled_skills.get(skillId, scope, projectId);
}
```

### 7. Filesystem Scan (Reconciliation)

```typescript
async function scanAndReconcile(): Promise<ScanResults> {
  const results = {
    library: { added: [], updated: [], removed: [] },
    global_enabled: { found: [], orphaned: [], synced: 0 },
    project_enabled: {}
  };
  
  // 1. Scan library directory
  const librarySkills = scanSkillDirectory(SKILL_LIBRARY_PATH);
  const dbSkills = db.skills.list();
  
  for (const fs of librarySkills) {
    const existing = dbSkills.find(s => s.slug === fs.slug);
    if (!existing) {
      // New skill found on disk
      const skill = await importSkillFromDisk(fs.path);
      results.library.added.push(fs.slug);
    } else if (fs.hash !== existing.content_hash) {
      // Skill changed on disk - re-parse SKILL.md to update ALL metadata
      const parsed = parseSkillMd(join(fs.path, 'SKILL.md'));
      db.skills.update(existing.id, {
        name: parsed.name,
        description: parsed.description,
        allowed_tools: parsed.allowed_tools,
        license: parsed.license,
        content_hash: fs.hash,
        updated_at: Date.now()
      });
      results.library.updated.push(fs.slug);
    }
  }
  
  // Check for removed skills
  for (const db of dbSkills) {
    if (!librarySkills.find(fs => fs.slug === db.slug)) {
      db.skills.delete(db.id);
      results.library.removed.push(db.slug);
    }
  }
  
  // 2. Scan global enabled
  const globalEnabled = scanSkillDirectory(CLAUDE_GLOBAL_SKILLS);
  for (const fs of globalEnabled) {
    results.global_enabled.found.push(fs.slug);
    const skill = db.skills.findBySlug(fs.slug);
    if (!skill) {
      results.global_enabled.orphaned.push(fs.slug);
    } else {
      results.global_enabled.synced++;
    }
  }
  
  // 3. Scan project enabled (for each known project)
  for (const project of db.projects.list()) {
    const projectSkillsDir = join(project.path, '.claude', 'skills');
    if (existsSync(projectSkillsDir)) {
      const projectEnabled = scanSkillDirectory(projectSkillsDir);
      results.project_enabled[project.id] = {
        found: projectEnabled.map(s => s.slug),
        orphaned: [],
        synced: 0
      };
      // ... similar reconciliation
    }
  }
  
  return results;
}
```

## Helper Functions

```typescript
const SKILL_LIBRARY_PATH = join(homedir(), '.claude-code-ui', 'skill-library');
const CLAUDE_GLOBAL_SKILLS = join(homedir(), '.claude', 'skills');

// =============================================================================
// SECURITY: Path Validation
// =============================================================================

/**
 * Validate that a slug is safe for filesystem use.
 * Prevents path traversal attacks (e.g., "../../../etc/passwd").
 */
function validateSlug(slug: string): void {
  // Must be non-empty
  if (!slug || slug.trim().length === 0) {
    throw new Error('Slug cannot be empty');
  }
  
  // Allowlist: only alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new Error(`Invalid slug "${slug}": only alphanumeric, hyphens, and underscores allowed`);
  }
  
  // Deny reserved names
  const reserved = ['.', '..', 'con', 'prn', 'aux', 'nul'];
  if (reserved.includes(slug.toLowerCase())) {
    throw new Error(`Invalid slug "${slug}": reserved name`);
  }
  
  // Length limit
  if (slug.length > 100) {
    throw new Error('Slug too long (max 100 characters)');
  }
}

/**
 * Ensure a resolved path is within the expected base directory.
 * Prevents zip-slip and path traversal attacks.
 */
function assertPathWithinBase(targetPath: string, basePath: string): void {
  const resolvedTarget = resolve(targetPath);
  const resolvedBase = resolve(basePath);
  
  if (!resolvedTarget.startsWith(resolvedBase + sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Path traversal detected: ${targetPath} is outside ${basePath}`);
  }
}

/**
 * Safe path join that validates the result stays within base.
 */
function safeJoin(basePath: string, ...parts: string[]): string {
  const joined = join(basePath, ...parts);
  assertPathWithinBase(joined, basePath);
  return joined;
}

/**
 * Copy directory recursively, preserving file permissions.
 * 
 * IMPORTANT: Preserves executable bits for scripts.
 */
function copyDirRecursive(src: string, dest: string, baseDest?: string) {
  const effectiveBaseDest = baseDest || dest;
  mkdirSync(dest, { recursive: true });
  
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    // Validate destination stays within base (zip-slip protection)
    assertPathWithinBase(destPath, effectiveBaseDest);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, effectiveBaseDest);
    } else {
      // Copy file content
      copyFileSync(srcPath, destPath);
      
      // Preserve file mode (permissions including executable bit)
      const stat = statSync(srcPath);
      chmodSync(destPath, stat.mode);
    }
  }
}

function generateSkillMd(data: {
  name: string;
  description: string;
  version: string;
  allowed_tools?: string[];
  content: string;
}): string {
  const frontmatter = [
    '---',
    `name: ${data.name}`,
    `description: ${data.description}`,
    `version: ${data.version}`,
  ];
  
  if (data.allowed_tools?.length) {
    frontmatter.push(`allowed-tools: ${data.allowed_tools.join(', ')}`);
  }
  
  frontmatter.push('---', '');
  
  return frontmatter.join('\n') + data.content;
}

function bumpPatch(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}
```
