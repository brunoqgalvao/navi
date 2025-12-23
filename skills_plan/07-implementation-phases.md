# Implementation Phases

## Phase 1: Foundation (3-4 days)

### Goals
- Database schema
- Filesystem operations
- Core API endpoints
- Basic sync on startup

### Tasks

- [ ] **1.1 Database Schema**
  - Add `skills` table
  - Add `enabled_skills` table
  - Add `skill_versions` table
  - Add `marketplace_cache` table
  - Migration script

- [ ] **1.2 Filesystem Utilities**
  - `SKILL_LIBRARY_PATH` constant
  - `CLAUDE_GLOBAL_SKILLS` constant
  - `parseSkillMd()` - parse SKILL.md frontmatter
  - `generateSkillMd()` - generate SKILL.md from data
  - `calculateSkillHash()` - content hash
  - `copyDirRecursive()` - copy skill directory
  - `scanSkillDirectory()` - list skills in directory

- [ ] **1.3 Core API Endpoints**
  - `GET /api/skills` - list library
  - `GET /api/skills/:id` - get skill
  - `POST /api/skills` - create skill
  - `PUT /api/skills/:id` - update skill
  - `DELETE /api/skills/:id` - delete skill

- [ ] **1.4 Startup Sync**
  - Scan `~/.claude-code-ui/skill-library/`
  - Reconcile with database
  - Log discrepancies

### Deliverables
- Skills can be created/edited via API
- Skills are stored on filesystem
- Database tracks metadata
- Startup reconciliation works

---

## Phase 2: Enable/Disable (2-3 days)

### Goals
- Enable/disable skills globally
- Enable/disable skills per project
- Change detection

### Tasks

- [ ] **2.1 Enable API**
  - `POST /api/skills/:id/enable` - enable globally
  - `DELETE /api/skills/:id/enable` - disable globally
  - `POST /api/projects/:pid/skills/:id/enable` - enable for project
  - `DELETE /api/projects/:pid/skills/:id/enable` - disable for project
  - `GET /api/skills/enabled` - list globally enabled
  - `GET /api/projects/:pid/skills` - list project enabled

- [ ] **2.2 Copy Operations**
  - Copy to `~/.claude/skills/` on global enable
  - Copy to `{project}/.claude/skills/` on project enable
  - Remove on disable

- [ ] **2.3 Change Detection**
  - Compare hashes on read
  - `has_local_changes` flag
  - API returns change status

### Deliverables
- Skills can be enabled/disabled
- Copies appear in Claude's skill directories
- UI can show change status

---

## Phase 3: Settings UI (3-4 days)

### Goals
- Skills tab in Settings
- Skill library view
- Create/edit skill modal

### Tasks

- [ ] **3.1 Settings Tab**
  - Add "Skills" tab to Settings.svelte
  - Tab icon and navigation

- [ ] **3.2 SkillLibrary Component**
  - List all skills from library
  - Search/filter
  - Skill cards with status
  - Create skill button

- [ ] **3.3 SkillCard Component**
  - Name, description, version
  - Enable/disable toggles
  - Status indicators (synced, changes, update)
  - Edit button

- [ ] **3.4 SkillEditor Modal**
  - Create new skill
  - Edit existing skill
  - Name, description, version fields
  - Allowed tools picker
  - SKILL.md content editor
  - Category and tags
  - Save/cancel

- [ ] **3.5 Stores**
  - `skillLibrary` store
  - `enabledSkills` store
  - API integration
  - Loading states

### Deliverables
- Full skill management in Settings
- Create/edit/delete skills
- Toggle global enable

---

## Phase 4: Project Skills (2-3 days)

### Goals
- Skills section in project panel
- Enable/disable per project
- Quick skill picker

### Tasks

- [ ] **4.1 ProjectSkills Component**
  - Skills section in project panel
  - List enabled skills for project
  - Toggle enable/disable
  - Status indicators

- [ ] **4.2 SkillPicker Component**
  - Dropdown to add skills
  - Search library
  - Show already enabled
  - Quick enable action

- [ ] **4.3 Skill Popover**
  - Click skill for details
  - Description, version, status
  - Disable button
  - Edit link

### Deliverables
- Manage skills per project
- Quick enable from library
- Visual feedback on skill status

---

## Phase 5: Sync & Versioning (2-3 days)

### Goals
- Sync local changes to library
- Update enabled from library
- Version history

### Tasks

- [ ] **5.1 Sync API**
  - `POST /api/skills/:id/sync-to-library`
  - `POST /api/skills/:id/update-from-library`
  - Version bumping logic
  - Changelog support

- [ ] **5.2 Version History**
  - `GET /api/skills/:id/versions`
  - `POST /api/skills/:id/versions` (manual version)
  - Version list in skill detail

- [ ] **5.3 Sync UI**
  - "Sync to Library" button on changed skills
  - "Update from Library" button when update available
  - "Discard Changes" option
  - Version bump dialog
  - Changelog input

- [ ] **5.4 Conflict Resolution**
  - Warn when local changes exist and update requested
  - Options: overwrite, merge (future), keep local

### Deliverables
- Full version control for skills
- Sync changes both directions
- Version history viewable

---

## Phase 6: Import/Export (2-3 days)

### Goals
- Import skills from files/URLs
- Export skills for sharing
- Prepare for marketplace

### Tasks

- [ ] **6.1 Import API**
  - `POST /api/skills/import` - from file upload
  - `POST /api/skills/import-url` - from URL
  - Validate SKILL.md format
  - Handle skill directory structure

- [ ] **6.2 Export API**
  - `GET /api/skills/:id/export` - download as zip
  - Include all files in skill directory
  - Proper directory structure

- [ ] **6.3 Import UI**
  - Import button in library
  - File picker (zip or directory)
  - URL input
  - Preview before import
  - Conflict handling (skill exists)

- [ ] **6.4 Export UI**
  - Export button on skill card
  - Download zip file

### Deliverables
- Import skills from any source
- Export skills for sharing
- Foundation for marketplace

---

## Phase 7: Marketplace (3-4 days)

### Goals
- Browse marketplace skills
- Import from marketplace
- Update notifications

### Tasks

- [ ] **7.1 Marketplace API**
  - `GET /api/marketplace/skills` - browse/search
  - `GET /api/marketplace/skills/:slug` - details
  - `POST /api/marketplace/skills/:slug/import`
  - Cache management
  - (Future: submit skill)

- [ ] **7.2 Marketplace Data Source**
  - Local JSON file initially
  - (Future: remote API)
  - Cache expiration

- [ ] **7.3 MarketplaceBrowser Modal**
  - Grid of available skills
  - Search and filter
  - Category tabs
  - Skill cards with stats

- [ ] **7.4 MarketplaceCard Component**
  - Name, author, version
  - Downloads, rating
  - Description preview
  - Import button

- [ ] **7.5 SkillDetail View**
  - Full description
  - Changelog
  - Files included
  - Import action

- [ ] **7.6 Update Notifications**
  - Check for updates on startup
  - "Update available" badge
  - Update action

### Deliverables
- Browse and discover skills
- One-click import
- Update notifications

---

## Phase 8: Polish & Edge Cases (2-3 days)

### Goals
- Error handling
- Edge cases
- Performance
- Documentation

### Tasks

- [ ] **8.1 Error Handling**
  - Invalid SKILL.md format
  - Filesystem permission errors
  - Network failures (marketplace)
  - Duplicate skill names
  - Missing dependencies

- [ ] **8.2 Edge Cases**
  - Skill deleted externally
  - Skill modified externally
  - Project deleted with enabled skills
  - Large skill directories
  - Special characters in names

- [ ] **8.3 Performance**
  - Lazy loading skill content
  - Debounce hash calculations
  - Cache marketplace results
  - Batch filesystem operations

- [ ] **8.4 Documentation**
  - User guide for skills
  - Skill authoring guide
  - API documentation
  - Troubleshooting

### Deliverables
- Robust error handling
- Smooth user experience
- Complete documentation

---

## Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Foundation | 3-4 days | None |
| 2. Enable/Disable | 2-3 days | Phase 1 |
| 3. Settings UI | 3-4 days | Phase 1, 2 |
| 4. Project Skills | 2-3 days | Phase 3 |
| 5. Sync & Versioning | 2-3 days | Phase 2, 3 |
| 6. Import/Export | 2-3 days | Phase 3 |
| 7. Marketplace | 3-4 days | Phase 6 |
| 8. Polish | 2-3 days | All |

**Total: ~20-27 days**

## MVP (Phases 1-4): ~10-14 days

Minimum viable:
- Create/edit skills
- Enable globally and per-project
- Settings UI
- Project panel integration
