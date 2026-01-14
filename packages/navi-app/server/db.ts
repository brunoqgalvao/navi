import initSqlJs, { type Database } from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DATA_DIR = join(homedir(), ".claude-code-ui");
const DB_PATH = join(DATA_DIR, "data.db");

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database;
let loadedDbMtimeMs: number | null = null;

export async function initDb() {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    // Record the file's modification time before reading
    const stats = statSync(DB_PATH);
    loadedDbMtimeMs = stats.mtimeMs;

    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    loadedDbMtimeMs = Date.now();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      claude_session_id TEXT,
      model TEXT,
      total_cost_usd REAL DEFAULT 0,
      total_turns INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      parent_tool_use_id TEXT,
      is_synthetic INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    -- Performance indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON sessions(favorite);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);

  try {
    db.run("ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN summary TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN summary_updated_at INTEGER");
  } catch {}
  try {
    db.run(`CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN pinned INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN sort_order INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN context_window INTEGER DEFAULT 200000");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN auto_accept_all INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN auto_accept_all INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN favorite INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN archived INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN archived INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN marked_for_review INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE workspace_folders ADD COLUMN pinned INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE messages ADD COLUMN parent_tool_use_id TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE messages ADD COLUMN is_synthetic INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE messages ADD COLUMN is_final INTEGER DEFAULT 0");
  } catch {}

  // Container preview config caching
  try {
    db.run("ALTER TABLE projects ADD COLUMN preview_config TEXT");
  } catch {}

  // Until Done (Ralph loop) mode columns
  try {
    db.run("ALTER TABLE sessions ADD COLUMN until_done_mode INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN until_done_iteration INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN until_done_max_iterations INTEGER DEFAULT 10");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN until_done_total_cost REAL DEFAULT 0");
  } catch {}

  // Worktree mode columns - allow sessions to run in isolated git worktrees
  try {
    db.run("ALTER TABLE sessions ADD COLUMN worktree_path TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN worktree_branch TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN worktree_base_branch TEXT");
  } catch {}

  // Multi-session hierarchy columns - fractal agent architecture
  try {
    db.run("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id)");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN root_session_id TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN depth INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN role TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN task TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN agent_status TEXT DEFAULT 'working'");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN deliverable TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN escalation TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN delivered_at INTEGER");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN archived_at INTEGER");
  } catch {}
  // Agent type for native UI (browser, coding, research, etc.)
  try {
    db.run("ALTER TABLE sessions ADD COLUMN agent_type TEXT");
  } catch {}

  // Backlog feature - sessions can be added to backlog for later
  try {
    db.run("ALTER TABLE sessions ADD COLUMN in_backlog INTEGER DEFAULT 0");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN backlog_added_at INTEGER");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN backlog_note TEXT");
  } catch {}

  // Cloud execution mode - run agents in E2B cloud sandboxes
  try {
    db.run("ALTER TABLE sessions ADD COLUMN execution_mode TEXT DEFAULT 'local'");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN cloud_repo_url TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN cloud_branch TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE sessions ADD COLUMN e2b_sandbox_id TEXT");
  } catch {}

  // Multi-backend support (claude, codex, gemini)
  try {
    db.run("ALTER TABLE sessions ADD COLUMN backend TEXT DEFAULT 'claude'");
  } catch {}
  try {
    db.run("ALTER TABLE projects ADD COLUMN default_backend TEXT DEFAULT 'claude'");
  } catch {}

  // Indexes for multi-session queries
  try {
    db.run("CREATE INDEX idx_sessions_parent ON sessions(parent_session_id)");
  } catch {}
  try {
    db.run("CREATE INDEX idx_sessions_root ON sessions(root_session_id)");
  } catch {}
  try {
    db.run("CREATE INDEX idx_sessions_agent_status ON sessions(agent_status)");
  } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS cost_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      cost_usd REAL NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cost_entries_session ON cost_entries(session_id);
    CREATE INDEX IF NOT EXISTS idx_cost_entries_project ON cost_entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_cost_entries_timestamp ON cost_entries(timestamp);
    CREATE INDEX IF NOT EXISTS idx_cost_entries_project_timestamp ON cost_entries(project_id, timestamp);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      allowed_tools TEXT,
      license TEXT,
      category TEXT,
      tags TEXT,
      content_hash TEXT NOT NULL,
      source_type TEXT DEFAULT 'local',
      source_url TEXT,
      source_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
    CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS enabled_skills (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      project_id TEXT,
      library_version TEXT NOT NULL,
      local_hash TEXT NOT NULL,
      has_local_changes INTEGER DEFAULT 0,
      enabled_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    );
    CREATE INDEX IF NOT EXISTS idx_enabled_skills_scope ON enabled_skills(scope, project_id);
    CREATE INDEX IF NOT EXISTS idx_enabled_skills_skill ON enabled_skills(skill_id);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS skill_versions (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      version TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      changelog TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);
  `);

  // Skills table migrations
  try {
    db.run("ALTER TABLE skills ADD COLUMN default_enabled INTEGER DEFAULT 0");
  } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      collapsed INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_folders_order ON workspace_folders(sort_order);
  `);

  try {
    db.run("ALTER TABLE projects ADD COLUMN folder_id TEXT");
  } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS search_index (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      project_id TEXT,
      session_id TEXT,
      session_title TEXT,
      searchable_text TEXT NOT NULL,
      preview TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_entity ON search_index(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_search_project ON search_index(project_id);
    CREATE INDEX IF NOT EXISTS idx_search_session ON search_index(session_id);
  `);

  // Pending questions table for ask_user_question tool
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      questions TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pending_questions_session ON pending_questions(session_id);
    CREATE INDEX IF NOT EXISTS idx_pending_questions_request ON pending_questions(request_id);
  `);

  // Extension settings table - per-project extension configuration
  db.run(`
    CREATE TABLE IF NOT EXISTS extension_settings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      extension_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      config TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, extension_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_extension_settings_project ON extension_settings(project_id);
  `);

  // Migration: Add sort_order column if missing
  try {
    db.run(`ALTER TABLE extension_settings ADD COLUMN sort_order INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }

  // Kanban cards table - agentic task board
  db.run(`
    CREATE TABLE IF NOT EXISTS kanban_cards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      title TEXT NOT NULL,
      spec TEXT,
      status TEXT DEFAULT 'spec',
      status_message TEXT,
      blocked INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_project ON kanban_cards(project_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_session ON kanban_cards(session_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_status ON kanban_cards(status);
  `);

  // Migration: add blocked column if not exists
  try {
    db.run("ALTER TABLE kanban_cards ADD COLUMN blocked INTEGER DEFAULT 0");
  } catch {}

  // Command settings table - per-workspace/global command configuration
  db.run(`
    CREATE TABLE IF NOT EXISTS command_settings (
      id TEXT PRIMARY KEY,
      command_name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('global', 'workspace')),
      project_id TEXT,
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      config TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(command_name, scope, project_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_command_settings_scope ON command_settings(scope, project_id);
    CREATE INDEX IF NOT EXISTS idx_command_settings_name ON command_settings(command_name);
  `);

  // Session decisions table - shared decisions across session tree
  db.run(`
    CREATE TABLE IF NOT EXISTS session_decisions (
      id TEXT PRIMARY KEY,
      root_session_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      category TEXT,
      decision TEXT NOT NULL,
      rationale TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (root_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_session_decisions_root ON session_decisions(root_session_id);
    CREATE INDEX IF NOT EXISTS idx_session_decisions_session ON session_decisions(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_decisions_category ON session_decisions(category);
  `);

  // Session artifacts table - artifacts produced by sessions
  db.run(`
    CREATE TABLE IF NOT EXISTS session_artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      root_session_id TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT,
      description TEXT,
      artifact_type TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (root_session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_session_artifacts_session ON session_artifacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_artifacts_root ON session_artifacts(root_session_id);
  `);

  // Cloud executions table - track E2B cloud sandbox executions
  db.run(`
    CREATE TABLE IF NOT EXISTS cloud_executions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      e2b_sandbox_id TEXT,
      status TEXT DEFAULT 'pending',
      stage TEXT,
      repo_url TEXT,
      branch TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER,
      exit_code INTEGER,
      error_message TEXT,
      modified_files TEXT,
      synced_files TEXT,
      e2b_cost_usd REAL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_executions_session ON cloud_executions(session_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_executions_status ON cloud_executions(status);
  `);

  // Add new columns if they don't exist (migration for existing DBs)
  try {
    db.run("ALTER TABLE cloud_executions ADD COLUMN synced_files TEXT");
  } catch {}
  try {
    db.run("ALTER TABLE cloud_executions ADD COLUMN e2b_cost_usd REAL");
  } catch {}

  // Channels - cross-workspace spaces for agent collaboration
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      workspace_access TEXT DEFAULT 'selected',
      settings TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
  `);

  // Channel-Workspace access mapping
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_workspaces (
      channel_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      PRIMARY KEY (channel_id, workspace_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_channel_workspaces_channel ON channel_workspaces(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_workspaces_workspace ON channel_workspaces(workspace_id);
  `);

  // Threads within channels
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_threads (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT,
      status TEXT DEFAULT 'active',
      workspace_id TEXT,
      branch_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_channel_threads_channel ON channel_threads(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_threads_status ON channel_threads(status);
  `);

  // Messages in threads
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      mentions TEXT DEFAULT '[]',
      agent_action TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES channel_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_channel_messages_thread ON channel_messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages(created_at);
  `);

  saveDb()
  return db;
}

export function saveDb() {
  if (db) {
    // Check if file on disk is newer than what we loaded
    if (loadedDbMtimeMs !== null && existsSync(DB_PATH)) {
      const currentMtimeMs = statSync(DB_PATH).mtimeMs;
      if (currentMtimeMs > loadedDbMtimeMs) {
        const ageMs = Date.now() - loadedDbMtimeMs;
        const diskAgeMs = Date.now() - currentMtimeMs;

        console.warn(`[DB] Save prevented: file on disk is newer than loaded data`);
        console.warn(`[DB] Loaded data age: ${Math.round(ageMs / 1000)}s ago, Disk file age: ${Math.round(diskAgeMs / 1000)}s ago`);
        console.warn(`[DB] This likely means another process has updated the database.`);
        console.warn(`[DB] Skipping save to prevent data loss. Reload the app to get latest data.`);

        // Update our loaded time to prevent spamming this warning
        loadedDbMtimeMs = currentMtimeMs;
        return;
      }
    }

    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);

    // Update the loaded time after successful save
    loadedDbMtimeMs = Date.now();
  }
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  summary: string | null;
  summary_updated_at: number | null;
  pinned: number;
  sort_order: number;
  context_window: number;
  auto_accept_all: number;
  archived: number;
  // Multi-backend support
  default_backend: "claude" | "codex" | "gemini" | null;
  created_at: number;
  updated_at: number;
}

// Agent status for multi-session hierarchy
export type AgentStatus = 'working' | 'waiting' | 'blocked' | 'delivered' | 'failed' | 'archived';

// Escalation types
export type EscalationType = 'question' | 'decision_needed' | 'blocker' | 'permission';

export interface Escalation {
  type: EscalationType;
  summary: string;
  context: string;
  options?: string[];
  created_at: number;
}

export interface Deliverable {
  type: 'code' | 'research' | 'decision' | 'artifact' | 'error';
  summary: string;
  content: any;
  artifacts?: SessionArtifact[];
}

export interface Session {
  id: string;
  project_id: string;
  title: string;
  claude_session_id: string | null;
  model: string | null;
  total_cost_usd: number;
  total_turns: number;
  input_tokens: number;
  output_tokens: number;
  pinned: number;
  sort_order: number;
  auto_accept_all: number;
  favorite: number;
  archived: number;
  marked_for_review: number;
  // Until Done (Ralph loop) mode
  until_done_mode: number;
  until_done_iteration: number;
  until_done_max_iterations: number;
  until_done_total_cost: number;
  // Worktree mode - session runs in isolated git worktree
  worktree_path: string | null;
  worktree_branch: string | null;
  worktree_base_branch: string | null;
  // Multi-session hierarchy - fractal agent architecture
  parent_session_id: string | null;
  root_session_id: string | null;
  depth: number;
  role: string | null;
  task: string | null;
  agent_status: AgentStatus;
  agent_type: string | null;  // 'browser' | 'coding' | 'research' | etc. for native UI
  deliverable: string | null;  // JSON string of Deliverable
  escalation: string | null;   // JSON string of Escalation
  delivered_at: number | null;
  archived_at: number | null;
  // Backlog
  in_backlog: number;
  backlog_added_at: number | null;
  backlog_note: string | null;
  // Cloud execution mode
  execution_mode: "local" | "cloud";
  cloud_repo_url: string | null;
  cloud_branch: string | null;
  e2b_sandbox_id: string | null;
  // Multi-backend support
  backend: "claude" | "codex" | "gemini" | null;
  // Timestamps
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  parent_tool_use_id?: string | null;
  is_synthetic?: number;
  is_final?: number;
}

function queryAll<T>(sql: string, params: any[] = []): T[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  } catch (e) {
    console.error("Query error:", sql, params, e);
    return [];
  }
}

function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

let saveDbTimeout: Timer | null = null;

function run(sql: string, params: any[] = []) {
  db.run(sql, params);

  // Debounce disk writes - batch multiple operations together
  if (saveDbTimeout) clearTimeout(saveDbTimeout);
  saveDbTimeout = setTimeout(() => {
    saveDb();
    saveDbTimeout = null;
  }, 1000); // Wait 1s before flushing to disk
}

// Immediate save for critical operations (export for use in shutdown handlers)
export function saveDbImmediate() {
  if (saveDbTimeout) {
    clearTimeout(saveDbTimeout);
    saveDbTimeout = null;
  }
  saveDb();
}

export interface ProjectWithStats extends Project {
  session_count: number;
  last_activity: number | null;
  summary: string | null;
  summary_updated_at: number | null;
  pinned: number;
  sort_order: number;
  archived: number;
}

export interface WorkspaceFolder {
  id: string;
  name: string;
  sort_order: number;
  collapsed: number;
  pinned: number;
  created_at: number;
  updated_at: number;
}

export const workspaceFolders = {
  list: () => queryAll<WorkspaceFolder>("SELECT * FROM workspace_folders ORDER BY pinned DESC, sort_order ASC"),
  get: (id: string) => queryOne<WorkspaceFolder>("SELECT * FROM workspace_folders WHERE id = ?", [id]),
  create: (id: string, name: string, sortOrder: number = 0) => {
    const now = Date.now();
    run("INSERT INTO workspace_folders (id, name, sort_order, collapsed, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)",
        [id, name, sortOrder, now, now]);
  },
  update: (id: string, name: string) =>
    run("UPDATE workspace_folders SET name = ?, updated_at = ? WHERE id = ?", [name, Date.now(), id]),
  delete: (id: string) => {
    run("UPDATE projects SET folder_id = NULL WHERE folder_id = ?", [id]);
    run("DELETE FROM workspace_folders WHERE id = ?", [id]);
  },
  updateOrder: (id: string, sortOrder: number) =>
    run("UPDATE workspace_folders SET sort_order = ? WHERE id = ?", [sortOrder, id]),
  toggleCollapsed: (id: string, collapsed: boolean) =>
    run("UPDATE workspace_folders SET collapsed = ? WHERE id = ?", [collapsed ? 1 : 0, id]),
  togglePin: (id: string, pinned: boolean) =>
    run("UPDATE workspace_folders SET pinned = ?, updated_at = ? WHERE id = ?", [pinned ? 1 : 0, Date.now(), id]),
};

export const projects = {
  list: (includeArchived: boolean = false) => queryAll<ProjectWithStats>(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM sessions WHERE project_id = p.id) as session_count,
      (SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id) as last_activity
    FROM projects p 
    ${includeArchived ? '' : 'WHERE p.archived = 0'}
    ORDER BY p.pinned DESC, p.sort_order ASC
  `),
  listArchived: () => queryAll<ProjectWithStats>(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM sessions WHERE project_id = p.id) as session_count,
      (SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id) as last_activity
    FROM projects p 
    WHERE p.archived = 1
    ORDER BY p.updated_at DESC
  `),
  get: (id: string) => queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]),
  create: (id: string, name: string, path: string, description: string | null, created_at: number, updated_at: number) =>
    run("INSERT INTO projects (id, name, path, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", 
        [id, name, path, description, created_at, updated_at]),
  update: (name: string, path: string, description: string | null, contextWindow: number, updated_at: number, id: string) =>
    run("UPDATE projects SET name = ?, path = ?, description = ?, context_window = ?, updated_at = ? WHERE id = ?",
        [name, path, description, contextWindow, updated_at, id]),
  delete: (id: string) => run("DELETE FROM projects WHERE id = ?", [id]),
  updateSummary: (id: string, summary: string, updated_at: number) =>
    run("UPDATE projects SET summary = ?, summary_updated_at = ? WHERE id = ?", [summary, updated_at, id]),
  togglePin: (id: string, pinned: boolean) =>
    run("UPDATE projects SET pinned = ?, updated_at = ? WHERE id = ?", [pinned ? 1 : 0, Date.now(), id]),
  updateOrder: (id: string, sortOrder: number) =>
    run("UPDATE projects SET sort_order = ? WHERE id = ?", [sortOrder, id]),
  setAutoAcceptAll: (id: string, autoAcceptAll: boolean) =>
    run("UPDATE projects SET auto_accept_all = ?, updated_at = ? WHERE id = ?", [autoAcceptAll ? 1 : 0, Date.now(), id]),
  setArchived: (id: string, archived: boolean) =>
    run("UPDATE projects SET archived = ?, updated_at = ? WHERE id = ?", [archived ? 1 : 0, Date.now(), id]),
  setFolder: (id: string, folderId: string | null) =>
    run("UPDATE projects SET folder_id = ?, updated_at = ? WHERE id = ?", [folderId, Date.now(), id]),
};

export interface SessionWithProject extends Session {
  project_name: string;
}

// Optimized session type for sidebar display (includes hierarchy fields for child session display)
export interface SessionSidebar {
  id: string;
  project_id: string;
  title: string;
  claude_session_id: string | null;
  model: string | null;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  pinned: number;
  favorite: number;
  archived: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
  worktree_path: string | null;
  worktree_branch: string | null;
  auto_accept_all: number;
  marked_for_review: number;
  // Hierarchy fields for child session display
  parent_session_id: string | null;
  root_session_id: string | null;
  depth: number;
  role: string | null;
  task: string | null;
  agent_status: string | null;
  agent_type: string | null;
  escalation: string | null;
  deliverable: string | null;
  // Backend selection (claude, codex, gemini)
  backend: string | null;
}

// Columns used for sidebar display (avoids SELECT * overhead with large JSON columns)
const SIDEBAR_COLUMNS = `id, project_id, title, claude_session_id, model, total_cost_usd,
  input_tokens, output_tokens, pinned, favorite, archived, sort_order,
  created_at, updated_at, worktree_path, worktree_branch, auto_accept_all, marked_for_review,
  parent_session_id, root_session_id, depth, role, task, agent_status, agent_type, escalation, deliverable, backend`;

export const sessions = {
  // Optimized query for sidebar - excludes heavy columns like deliverable, escalation, context_excerpt
  listByProjectLight: (projectId: string, includeArchived: boolean = false) =>
    queryAll<SessionSidebar>(`SELECT ${SIDEBAR_COLUMNS} FROM sessions WHERE project_id = ? ${includeArchived ? '' : 'AND (archived = 0 OR archived IS NULL)'} ORDER BY pinned DESC, favorite DESC, sort_order ASC, updated_at DESC`, [projectId]),
  // Full query when all columns are needed
  listByProject: (projectId: string, includeArchived: boolean = false) =>
    queryAll<Session>(`SELECT * FROM sessions WHERE project_id = ? ${includeArchived ? '' : 'AND (archived = 0 OR archived IS NULL)'} ORDER BY pinned DESC, favorite DESC, sort_order ASC, updated_at DESC`, [projectId]),
  // Optimized recent sessions for sidebar
  listRecentLight: (limit: number = 10, includeArchived: boolean = false) =>
    queryAll<SessionSidebar & { project_name: string }>(`
      SELECT ${SIDEBAR_COLUMNS.split(',').map(c => `s.${c.trim()}`).join(', ')}, p.name as project_name
      FROM sessions s
      LEFT JOIN projects p ON s.project_id = p.id
      ${includeArchived ? '' : 'WHERE (p.archived = 0 OR p.archived IS NULL) AND (s.archived = 0 OR s.archived IS NULL)'}
      ORDER BY s.updated_at DESC
      LIMIT ?
    `, [limit]),
  listRecent: (limit: number = 10, includeArchived: boolean = false) =>
    queryAll<SessionWithProject>(`
      SELECT s.*, p.name as project_name
      FROM sessions s
      LEFT JOIN projects p ON s.project_id = p.id
      ${includeArchived ? '' : 'WHERE (p.archived = 0 OR p.archived IS NULL) AND (s.archived = 0 OR s.archived IS NULL)'}
      ORDER BY s.updated_at DESC
      LIMIT ?
    `, [limit]),
  get: (id: string) => queryOne<Session>("SELECT * FROM sessions WHERE id = ?", [id]),
  create: (id: string, project_id: string, title: string, created_at: number, updated_at: number, backend?: string) =>
    run("INSERT INTO sessions (id, project_id, title, created_at, updated_at, backend) VALUES (?, ?, ?, ?, ?, ?)",
        [id, project_id, title, created_at, updated_at, backend || null]),
  updateTitle: (title: string, updated_at: number, id: string) =>
    run("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?", [title, updated_at, id]),
  updateModel: (model: string, id: string) =>
    run("UPDATE sessions SET model = ? WHERE id = ?", [model, id]),
  updateBackend: (backend: string, id: string) =>
    run("UPDATE sessions SET backend = ? WHERE id = ?", [backend, id]),
  updateClaudeSession: (claude_session_id: string | null, model: string | null, cost: number, turns: number, inputTokens: number, outputTokens: number, updated_at: number, id: string) =>
    run("UPDATE sessions SET claude_session_id = ?, model = ?, total_cost_usd = total_cost_usd + ?, total_turns = total_turns + ?, input_tokens = ?, output_tokens = ?, updated_at = ? WHERE id = ?",
        [claude_session_id, model, cost, turns, inputTokens, outputTokens, updated_at, id]),
  delete: (id: string) => run("DELETE FROM sessions WHERE id = ?", [id]),
  togglePin: (id: string, pinned: boolean) =>
    run("UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ?", [pinned ? 1 : 0, Date.now(), id]),
  toggleFavorite: (id: string, favorite: boolean) =>
    run("UPDATE sessions SET favorite = ?, updated_at = ? WHERE id = ?", [favorite ? 1 : 0, Date.now(), id]),
  updateOrder: (id: string, sortOrder: number) =>
    run("UPDATE sessions SET sort_order = ? WHERE id = ?", [sortOrder, id]),
  search: (projectId: string, query: string) =>
    queryAll<Session>(`
      SELECT DISTINCT s.* FROM sessions s 
      LEFT JOIN messages m ON s.id = m.session_id 
      WHERE s.project_id = ? AND (s.title LIKE ? OR m.content LIKE ?)
      ORDER BY s.updated_at DESC
    `, [projectId, `%${query}%`, `%${query}%`]),
  searchAll: (query: string) =>
    queryAll<Session & { project_name: string }>(`
      SELECT DISTINCT s.*, p.name as project_name FROM sessions s 
      LEFT JOIN messages m ON s.id = m.session_id 
      LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.title LIKE ? OR m.content LIKE ?
      ORDER BY s.updated_at DESC
    `, [`%${query}%`, `%${query}%`]),
  setAutoAcceptAll: (id: string, autoAcceptAll: boolean) =>
    run("UPDATE sessions SET auto_accept_all = ?, updated_at = ? WHERE id = ?", [autoAcceptAll ? 1 : 0, Date.now(), id]),
  resetTokenCounts: (sessionId: string, inputTokens: number, outputTokens: number) =>
    run("UPDATE sessions SET input_tokens = ?, output_tokens = ? WHERE id = ?",
        [inputTokens, outputTokens, sessionId]),
  setArchivedByProject: (projectId: string, archived: boolean) =>
    run("UPDATE sessions SET archived = ?, updated_at = ? WHERE project_id = ?", [archived ? 1 : 0, Date.now(), projectId]),
  archiveAllNonStarred: (projectId: string) =>
    run("UPDATE sessions SET archived = 1, updated_at = ? WHERE project_id = ? AND favorite = 0 AND archived = 0", [Date.now(), projectId]),
  setArchived: (id: string, archived: boolean) =>
    run("UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?", [archived ? 1 : 0, Date.now(), id]),
  setMarkedForReview: (id: string, markedForReview: boolean) =>
    run("UPDATE sessions SET marked_for_review = ?, updated_at = ? WHERE id = ?", [markedForReview ? 1 : 0, Date.now(), id]),

  // Until Done (Ralph loop) mode methods
  setUntilDoneMode: (id: string, enabled: boolean, maxIterations: number = 10) =>
    run("UPDATE sessions SET until_done_mode = ?, until_done_iteration = ?, until_done_max_iterations = ?, until_done_total_cost = 0, updated_at = ? WHERE id = ?",
        [enabled ? 1 : 0, enabled ? 1 : 0, maxIterations, Date.now(), id]),
  incrementUntilDoneIteration: (id: string, iterationCost: number = 0) =>
    run("UPDATE sessions SET until_done_iteration = until_done_iteration + 1, until_done_total_cost = until_done_total_cost + ?, updated_at = ? WHERE id = ?",
        [iterationCost, Date.now(), id]),
  clearUntilDoneMode: (id: string) =>
    run("UPDATE sessions SET until_done_mode = 0, updated_at = ? WHERE id = ?", [Date.now(), id]),

  // Worktree mode methods
  setWorktree: (id: string, worktreePath: string, worktreeBranch: string, baseBranch: string) =>
    run(
      "UPDATE sessions SET worktree_path = ?, worktree_branch = ?, worktree_base_branch = ?, updated_at = ? WHERE id = ?",
      [worktreePath, worktreeBranch, baseBranch, Date.now(), id]
    ),
  clearWorktree: (id: string) =>
    run(
      "UPDATE sessions SET worktree_path = NULL, worktree_branch = NULL, worktree_base_branch = NULL, claude_session_id = NULL, updated_at = ? WHERE id = ?",
      [Date.now(), id]
    ),
  listWithWorktrees: (projectId: string) =>
    queryAll<Session>(
      "SELECT * FROM sessions WHERE project_id = ? AND worktree_path IS NOT NULL ORDER BY updated_at DESC",
      [projectId]
    ),
  createWithWorktree: (
    id: string,
    project_id: string,
    title: string,
    worktree_path: string,
    worktree_branch: string,
    worktree_base_branch: string,
    created_at: number,
    updated_at: number
  ) =>
    run(
      "INSERT INTO sessions (id, project_id, title, worktree_path, worktree_branch, worktree_base_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, project_id, title, worktree_path, worktree_branch, worktree_base_branch, created_at, updated_at]
    ),

  // Cloud execution mode methods
  setExecutionMode: (id: string, mode: "local" | "cloud", repoUrl?: string, branch?: string) =>
    run(
      "UPDATE sessions SET execution_mode = ?, cloud_repo_url = ?, cloud_branch = ?, updated_at = ? WHERE id = ?",
      [mode, repoUrl || null, branch || null, Date.now(), id]
    ),
  setE2bSandboxId: (id: string, sandboxId: string | null) =>
    run("UPDATE sessions SET e2b_sandbox_id = ?, updated_at = ? WHERE id = ?", [sandboxId, Date.now(), id]),
  createWithCloudMode: (
    id: string,
    project_id: string,
    title: string,
    execution_mode: "local" | "cloud",
    cloud_repo_url: string | null,
    cloud_branch: string | null,
    created_at: number,
    updated_at: number
  ) =>
    run(
      "INSERT INTO sessions (id, project_id, title, execution_mode, cloud_repo_url, cloud_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, project_id, title, execution_mode, cloud_repo_url, cloud_branch, created_at, updated_at]
    ),
};

// Cloud execution tracking
export interface CloudExecution {
  id: string;
  session_id: string;
  e2b_sandbox_id: string | null;
  status: "pending" | "cloning" | "checkout" | "executing" | "syncing" | "completed" | "failed" | "cancelled";
  stage: string | null;
  repo_url: string | null;
  branch: string | null;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  exit_code: number | null;
  error_message: string | null;
  modified_files: string | null; // JSON array of file paths
  synced_files: string | null;   // JSON array of synced file paths
  e2b_cost_usd: number | null;   // Estimated E2B compute cost
}

export const cloudExecutions = {
  list: (sessionId: string) =>
    queryAll<CloudExecution>(
      "SELECT * FROM cloud_executions WHERE session_id = ? ORDER BY started_at DESC",
      [sessionId]
    ),
  get: (id: string) => queryOne<CloudExecution>("SELECT * FROM cloud_executions WHERE id = ?", [id]),
  getLatest: (sessionId: string) =>
    queryOne<CloudExecution>(
      "SELECT * FROM cloud_executions WHERE session_id = ? ORDER BY started_at DESC LIMIT 1",
      [sessionId]
    ),
  create: (
    id: string,
    sessionId: string,
    repoUrl: string | null,
    branch: string | null
  ) => {
    const now = Date.now();
    run(
      "INSERT INTO cloud_executions (id, session_id, status, repo_url, branch, started_at) VALUES (?, ?, 'pending', ?, ?, ?)",
      [id, sessionId, repoUrl, branch, now]
    );
  },
  updateStatus: (id: string, status: CloudExecution["status"], stage?: string) =>
    run(
      "UPDATE cloud_executions SET status = ?, stage = ? WHERE id = ?",
      [status, stage || null, id]
    ),
  setSandboxId: (id: string, sandboxId: string) =>
    run("UPDATE cloud_executions SET e2b_sandbox_id = ? WHERE id = ?", [sandboxId, id]),
  complete: (
    id: string,
    exitCode: number,
    modifiedFiles: string[],
    syncedFiles: string[],
    durationMs: number,
    e2bCostUsd: number
  ) => {
    const now = Date.now();
    run(
      "UPDATE cloud_executions SET status = 'completed', exit_code = ?, modified_files = ?, synced_files = ?, duration_ms = ?, e2b_cost_usd = ?, completed_at = ? WHERE id = ?",
      [exitCode, JSON.stringify(modifiedFiles), JSON.stringify(syncedFiles), durationMs, e2bCostUsd, now, id]
    );
  },
  fail: (id: string, errorMessage: string, durationMs: number, e2bCostUsd: number) => {
    const now = Date.now();
    run(
      "UPDATE cloud_executions SET status = 'failed', error_message = ?, duration_ms = ?, e2b_cost_usd = ?, completed_at = ? WHERE id = ?",
      [errorMessage, durationMs, e2bCostUsd, now, id]
    );
  },
  // Get total E2B cost for a session
  getTotalCost: (sessionId: string): number => {
    const result = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(e2b_cost_usd), 0) as total FROM cloud_executions WHERE session_id = ?",
      [sessionId]
    );
    return result?.total || 0;
  },
  // Get total E2B cost for all sessions
  getTotalCostAll: (): number => {
    const result = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(e2b_cost_usd), 0) as total FROM cloud_executions"
    );
    return result?.total || 0;
  },
  cancel: (id: string) =>
    run(
      "UPDATE cloud_executions SET status = 'cancelled', completed_at = ? WHERE id = ?",
      [Date.now(), id]
    ),
};

export const messages = {
  listBySession: (sessionId: string) =>
    queryAll<Message>("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", [sessionId]),
  listBySessionPaginated: (sessionId: string, limit: number, offset: number) =>
    queryAll<Message>(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
      [sessionId, limit, offset]
    ),
  countBySession: (sessionId: string): number => {
    const result = queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
      [sessionId]
    );
    return result?.count ?? 0;
  },
  get: (id: string) => queryOne<Message>("SELECT * FROM messages WHERE id = ?", [id]),
  create: (
    id: string,
    session_id: string,
    role: string,
    content: string,
    timestamp: number,
    parent_tool_use_id: string | null = null,
    is_synthetic: number = 0,
    is_final: number = 0
  ) =>
    run(
      "INSERT INTO messages (id, session_id, role, content, timestamp, parent_tool_use_id, is_synthetic, is_final) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, session_id, role, content, timestamp, parent_tool_use_id, is_synthetic, is_final]
    ),
  upsert: (
    id: string,
    session_id: string,
    role: string,
    content: string,
    timestamp: number,
    parent_tool_use_id: string | null = null,
    is_synthetic: number = 0,
    is_final: number = 0
  ) =>
    run(
      `INSERT INTO messages (id, session_id, role, content, timestamp, parent_tool_use_id, is_synthetic, is_final)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         role = excluded.role,
         content = excluded.content,
         timestamp = excluded.timestamp,
         parent_tool_use_id = excluded.parent_tool_use_id,
         is_synthetic = excluded.is_synthetic,
         is_final = excluded.is_final`,
      [id, session_id, role, content, timestamp, parent_tool_use_id, is_synthetic, is_final]
    ),
  markFinal: (id: string) =>
    run("UPDATE messages SET is_final = 1 WHERE id = ?", [id]),
  update: (id: string, content: string) =>
    run("UPDATE messages SET content = ? WHERE id = ?", [content, id]),
  delete: (id: string) => run("DELETE FROM messages WHERE id = ?", [id]),
  deleteBySession: (sessionId: string) => run("DELETE FROM messages WHERE session_id = ?", [sessionId]),
  deleteAfter: (sessionId: string, timestamp: number) =>
    run("DELETE FROM messages WHERE session_id = ? AND timestamp > ?", [sessionId, timestamp]),
  // Get latest message preview for a session (for child session cards)
  getLatestPreview: (sessionId: string): { role: string; preview: string; timestamp: number } | null => {
    const msg = queryOne<Message>(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1",
      [sessionId]
    );
    if (!msg) return null;

    try {
      const content = JSON.parse(msg.content);
      let preview = "";

      if (typeof content === "string") {
        preview = content;
      } else if (Array.isArray(content)) {
        // Look for text blocks first
        for (const block of content) {
          if (block.type === "text" && block.text) {
            preview = block.text;
            break;
          }
          // Show tool use info
          if (block.type === "tool_use" && block.name) {
            preview = `Using ${block.name}...`;
            break;
          }
          // Show tool result summary
          if (block.type === "tool_result") {
            const resultContent = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content);
            preview = resultContent.slice(0, 100);
            break;
          }
        }
      }

      // Truncate and clean up preview
      preview = preview.replace(/\n/g, " ").trim();
      if (preview.length > 150) {
        preview = preview.slice(0, 147) + "...";
      }

      return {
        role: msg.role,
        preview,
        timestamp: msg.timestamp,
      };
    } catch {
      return null;
    }
  },
};

// Pending Questions for ask_user_question tool
export interface PendingQuestion {
  id: string;
  session_id: string;
  request_id: string;
  questions: string; // JSON string of QuestionItem[]
  created_at: number;
}

export const pendingQuestions = {
  create: (id: string, sessionId: string, requestId: string, questions: string) =>
    run(
      "INSERT INTO pending_questions (id, session_id, request_id, questions, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, sessionId, requestId, questions, Date.now()]
    ),
  getBySession: (sessionId: string): PendingQuestion | null => {
    const results = queryAll<PendingQuestion>(
      "SELECT * FROM pending_questions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
      [sessionId]
    );
    return results[0] || null;
  },
  getByRequestId: (requestId: string): PendingQuestion | null => {
    const results = queryAll<PendingQuestion>(
      "SELECT * FROM pending_questions WHERE request_id = ?",
      [requestId]
    );
    return results[0] || null;
  },
  delete: (id: string) => run("DELETE FROM pending_questions WHERE id = ?", [id]),
  deleteByRequestId: (requestId: string) => run("DELETE FROM pending_questions WHERE request_id = ?", [requestId]),
  deleteBySession: (sessionId: string) => run("DELETE FROM pending_questions WHERE session_id = ?", [sessionId]),
};

export interface SearchIndexEntry {
  id: string;
  entity_type: 'project' | 'session' | 'message';
  entity_id: string;
  project_id: string | null;
  session_id: string | null;
  session_title: string | null;
  searchable_text: string;
  preview: string | null;
  updated_at: number;
}

export interface SearchResult extends SearchIndexEntry {
  project_name?: string;
  rank?: number;
}

function extractSearchableText(content: string): { text: string; preview: string } {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'string') {
      return { text: parsed, preview: parsed.slice(0, 200) };
    }
    if (Array.isArray(parsed)) {
      const texts: string[] = [];
      for (const block of parsed) {
        if (block.type === 'text' && block.text) {
          texts.push(block.text);
        } else if (block.type === 'tool_use' && block.name) {
          texts.push(`[Tool: ${block.name}]`);
          if (block.input) {
            if (typeof block.input === 'string') texts.push(block.input);
            else if (block.input.command) texts.push(block.input.command);
            else if (block.input.content) texts.push(block.input.content);
            else if (block.input.file_path) texts.push(block.input.file_path);
            else if (block.input.pattern) texts.push(block.input.pattern);
          }
        } else if (block.type === 'tool_result' && block.content) {
          if (typeof block.content === 'string') {
            texts.push(block.content.slice(0, 500));
          }
        }
      }
      const fullText = texts.join(' ');
      return { text: fullText, preview: texts[0]?.slice(0, 200) || '' };
    }
    return { text: content, preview: content.slice(0, 200) };
  } catch {
    return { text: content, preview: content.slice(0, 200) };
  }
}

export const searchIndex = {
  indexMessage: (messageId: string, sessionId: string, content: string, timestamp: number) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    const { text, preview } = extractSearchableText(content);
    if (!text.trim()) return;
    
    run(`INSERT OR REPLACE INTO search_index 
         (id, entity_type, entity_id, project_id, session_id, session_title, searchable_text, preview, updated_at)
         VALUES (?, 'message', ?, ?, ?, ?, ?, ?, ?)`,
        [`msg_${messageId}`, messageId, session.project_id, sessionId, session.title, text.toLowerCase(), preview, timestamp]);
  },

  indexSession: (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    run(`INSERT OR REPLACE INTO search_index 
         (id, entity_type, entity_id, project_id, session_id, session_title, searchable_text, preview, updated_at)
         VALUES (?, 'session', ?, ?, ?, ?, ?, ?, ?)`,
        [`session_${sessionId}`, sessionId, session.project_id, sessionId, session.title, session.title.toLowerCase(), session.title, Date.now()]);
  },

  indexProject: (projectId: string) => {
    const project = projects.get(projectId);
    if (!project) return;
    
    const searchText = [project.name, project.description, project.path].filter(Boolean).join(' ');
    run(`INSERT OR REPLACE INTO search_index 
         (id, entity_type, entity_id, project_id, session_id, session_title, searchable_text, preview, updated_at)
         VALUES (?, 'project', ?, ?, NULL, NULL, ?, ?, ?)`,
        [`project_${projectId}`, projectId, projectId, searchText.toLowerCase(), project.name, Date.now()]);
  },

  removeMessage: (messageId: string) => {
    run("DELETE FROM search_index WHERE id = ?", [`msg_${messageId}`]);
  },

  removeSession: (sessionId: string) => {
    run("DELETE FROM search_index WHERE session_id = ?", [sessionId]);
  },

  removeProject: (projectId: string) => {
    run("DELETE FROM search_index WHERE project_id = ?", [projectId]);
  },

  search: (query: string, options?: { projectId?: string; sessionId?: string; limit?: number }): SearchResult[] => {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return [];

    const limit = options?.limit || 50;
    const queryLower = query.toLowerCase();

    // Build relevance scoring:
    // - Exact phrase match in title/session_title: +100
    // - Session title contains any term: +50
    // - Exact phrase match anywhere: +30
    // - More recent = higher score (log scale of days ago, inverted)
    let sql = `
      SELECT si.*, p.name as project_name,
        (
          -- Exact phrase match in session title (highest priority)
          CASE WHEN LOWER(si.session_title) LIKE ? THEN 100 ELSE 0 END +
          -- Any term in session title
          CASE WHEN si.entity_type = 'session' THEN 50 ELSE 0 END +
          -- Exact phrase match anywhere in content
          CASE WHEN si.searchable_text LIKE ? THEN 30 ELSE 0 END +
          -- Recency boost (max 20 points, decays over ~30 days)
          MAX(0, 20 - (CAST((strftime('%s', 'now') - si.updated_at / 1000) AS REAL) / 86400 / 1.5))
        ) as relevance_score
      FROM search_index si
      LEFT JOIN projects p ON si.project_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [`%${queryLower}%`, `%${queryLower}%`];

    if (options?.projectId) {
      sql += " AND si.project_id = ?";
      params.push(options.projectId);
    }
    if (options?.sessionId) {
      sql += " AND si.session_id = ?";
      params.push(options.sessionId);
    }

    for (const term of terms) {
      sql += " AND (si.searchable_text LIKE ? OR LOWER(p.name) LIKE ?)";
      params.push(`%${term}%`, `%${term}%`);
    }

    // Order by relevance score, then by entity type, then by recency
    sql += ` ORDER BY
      relevance_score DESC,
      CASE si.entity_type
        WHEN 'project' THEN 1
        WHEN 'session' THEN 2
        WHEN 'message' THEN 3
      END,
      si.updated_at DESC
      LIMIT ?`;
    params.push(limit);

    return queryAll<SearchResult>(sql, params);
  },

  reindexAll: () => {
    run("DELETE FROM search_index");
    
    const allProjects = projects.list();
    for (const project of allProjects) {
      searchIndex.indexProject(project.id);
    }
    
    for (const project of allProjects) {
      const projectSessions = sessions.listByProject(project.id);
      for (const session of projectSessions) {
        searchIndex.indexSession(session.id);
        const sessionMessages = messages.listBySession(session.id);
        for (const msg of sessionMessages) {
          searchIndex.indexMessage(msg.id, session.id, msg.content, msg.timestamp);
        }
      }
    }
  },

  getStats: () => {
    const total = queryOne<{ count: number }>("SELECT COUNT(*) as count FROM search_index");
    const byType = queryAll<{ entity_type: string; count: number }>(
      "SELECT entity_type, COUNT(*) as count FROM search_index GROUP BY entity_type"
    );
    return { total: total?.count || 0, byType };
  },

  debugList: (entityType?: string) => {
    if (entityType) {
      return queryAll<SearchIndexEntry>(
        "SELECT * FROM search_index WHERE entity_type = ? ORDER BY updated_at DESC LIMIT 20",
        [entityType]
      );
    }
    return queryAll<SearchIndexEntry>(
      "SELECT * FROM search_index ORDER BY entity_type, updated_at DESC LIMIT 50"
    );
  },
};

export function getDb() {
  return db;
}

export interface PermissionSettings {
  autoAcceptAll: boolean;
  allowedTools: string[];
  requireConfirmation: string[];
}

export const DEFAULT_TOOLS = [
  "Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "TodoWrite", "Task", "TaskOutput"
];

export const DANGEROUS_TOOLS = ["Bash", "Write", "Edit"];

export const globalSettings = {
  get: (key: string): string | null => {
    const result = queryOne<{ value: string }>("SELECT value FROM global_settings WHERE key = ?", [key]);
    return result?.value ?? null;
  },
  set: (key: string, value: string) => {
    run("INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)", [key, value]);
  },
  getPermissions: (): PermissionSettings => {
    const raw = globalSettings.get("permissions");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return {
      autoAcceptAll: false,
      allowedTools: DEFAULT_TOOLS,
      requireConfirmation: DANGEROUS_TOOLS,
    };
  },
  setPermissions: (settings: PermissionSettings) => {
    globalSettings.set("permissions", JSON.stringify(settings));
  },
};

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  allowed_tools: string | null;
  license: string | null;
  category: string | null;
  tags: string | null;
  content_hash: string;
  source_type: string;
  source_url: string | null;
  source_version: string | null;
  default_enabled: number; // 0 or 1 - auto-enable for new projects
  created_at: number;
  updated_at: number;
}

// Predefined skill categories
export const SKILL_CATEGORIES = [
  { id: "browser", label: "Browser & Web", icon: "🌐" },
  { id: "coding", label: "Coding & Development", icon: "💻" },
  { id: "integration", label: "Integrations", icon: "🔌" },
  { id: "ai", label: "AI & LLM", icon: "🤖" },
  { id: "devops", label: "DevOps & Deploy", icon: "🚀" },
  { id: "testing", label: "Testing & QA", icon: "🧪" },
  { id: "docs", label: "Documentation", icon: "📝" },
  { id: "media", label: "Media & Design", icon: "🎨" },
  { id: "data", label: "Data & Analysis", icon: "📊" },
  { id: "utility", label: "Utilities", icon: "🔧" },
] as const;

export type SkillCategory = typeof SKILL_CATEGORIES[number]["id"];

export interface EnabledSkill {
  id: string;
  skill_id: string;
  scope: string;
  project_id: string | null;
  library_version: string;
  local_hash: string;
  has_local_changes: number;
  enabled_at: number;
  updated_at: number;
}

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  content_hash: string;
  changelog: string | null;
  created_at: number;
}

export const skills = {
  list: () => queryAll<Skill>("SELECT * FROM skills ORDER BY updated_at DESC"),
  get: (id: string) => queryOne<Skill>("SELECT * FROM skills WHERE id = ?", [id]),
  getBySlug: (slug: string) => queryOne<Skill>("SELECT * FROM skills WHERE slug = ?", [slug]),
  create: (skill: Skill) => {
    run(
      `INSERT INTO skills (id, slug, name, description, version, allowed_tools, license, category, tags, content_hash, source_type, source_url, source_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        skill.id,
        skill.slug,
        skill.name,
        skill.description,
        skill.version,
        skill.allowed_tools,
        skill.license,
        skill.category,
        skill.tags,
        skill.content_hash,
        skill.source_type,
        skill.source_url,
        skill.source_version,
        skill.created_at,
        skill.updated_at,
      ]
    );
  },
  update: (id: string, updates: Partial<Skill>) => {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== "id") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    run(`UPDATE skills SET ${fields.join(", ")} WHERE id = ?`, values);
  },
  delete: (id: string) => run("DELETE FROM skills WHERE id = ?", [id]),
  listDefaultEnabled: () => queryAll<Skill>("SELECT * FROM skills WHERE default_enabled = 1"),
  setDefaultEnabled: (id: string, enabled: boolean) =>
    run("UPDATE skills SET default_enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]),
};

export const enabledSkills = {
  list: () => queryAll<EnabledSkill>("SELECT * FROM enabled_skills"),
  listGlobal: () => queryAll<EnabledSkill>("SELECT * FROM enabled_skills WHERE scope = 'global'"),
  listByProject: (projectId: string) =>
    queryAll<EnabledSkill>("SELECT * FROM enabled_skills WHERE scope = 'project' AND project_id = ?", [projectId]),
  get: (skillId: string, scope: string, projectId?: string | null) => {
    if (scope === "global") {
      return queryOne<EnabledSkill>(
        "SELECT * FROM enabled_skills WHERE skill_id = ? AND scope = 'global'",
        [skillId]
      );
    }
    return queryOne<EnabledSkill>(
      "SELECT * FROM enabled_skills WHERE skill_id = ? AND scope = 'project' AND project_id = ?",
      [skillId, projectId]
    );
  },
  create: (enabled: EnabledSkill) => {
    run(
      `INSERT INTO enabled_skills (id, skill_id, scope, project_id, library_version, local_hash, has_local_changes, enabled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        enabled.id,
        enabled.skill_id,
        enabled.scope,
        enabled.project_id,
        enabled.library_version,
        enabled.local_hash,
        enabled.has_local_changes,
        enabled.enabled_at,
        enabled.updated_at,
      ]
    );
  },
  update: (id: string, updates: Partial<EnabledSkill>) => {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== "id") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    run(`UPDATE enabled_skills SET ${fields.join(", ")} WHERE id = ?`, values);
  },
  delete: (skillId: string, scope: string, projectId?: string | null) => {
    if (scope === "global") {
      run("DELETE FROM enabled_skills WHERE skill_id = ? AND scope = 'global'", [skillId]);
    } else {
      run("DELETE FROM enabled_skills WHERE skill_id = ? AND scope = 'project' AND project_id = ?", [
        skillId,
        projectId,
      ]);
    }
  },
  deleteById: (id: string) => run("DELETE FROM enabled_skills WHERE id = ?", [id]),
};

export const skillVersions = {
  list: (skillId: string) =>
    queryAll<SkillVersion>("SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY created_at DESC", [skillId]),
  create: (version: SkillVersion) => {
    run(
      `INSERT INTO skill_versions (id, skill_id, version, content_hash, changelog, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [version.id, version.skill_id, version.version, version.content_hash, version.changelog, version.created_at]
    );
  },
};

export interface CostEntry {
  id: string;
  session_id: string;
  project_id: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  timestamp: number;
}

export interface HourlyCost {
  hour: string;
  total_cost: number;
  entry_count: number;
}

function getStartOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export const costEntries = {
  create: (entry: CostEntry) => {
    run(
      `INSERT INTO cost_entries (id, session_id, project_id, cost_usd, input_tokens, output_tokens, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.session_id, entry.project_id, entry.cost_usd, entry.input_tokens, entry.output_tokens, entry.timestamp]
    );
  },

  getTotalEver: (): number => {
    const result = queryOne<{ total: number }>("SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries");
    return result?.total || 0;
  },

  getTotalToday: (): number => {
    const startOfDay = getStartOfToday();
    const result = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries WHERE timestamp >= ?",
      [startOfDay]
    );
    return result?.total || 0;
  },

  getProjectTotalEver: (projectId: string): number => {
    const result = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries WHERE project_id = ?",
      [projectId]
    );
    return result?.total || 0;
  },

  getProjectTotalToday: (projectId: string): number => {
    const startOfDay = getStartOfToday();
    const result = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries WHERE project_id = ? AND timestamp >= ?",
      [projectId, startOfDay]
    );
    return result?.total || 0;
  },

  getSessionTotal: (sessionId: string): number => {
    const result = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries WHERE session_id = ?",
      [sessionId]
    );
    return result?.total || 0;
  },

  getHourlyCosts: (days: number = 7, projectIds?: string[]): HourlyCost[] => {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const params: any[] = [startTime];
    let whereClause = "WHERE timestamp >= ?";
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      whereClause += ` AND project_id IN (${placeholders})`;
      params.push(...projectIds);
    }
    return queryAll<HourlyCost>(
      `SELECT
        strftime('%Y-%m-%d %H:00', timestamp / 1000, 'unixepoch', 'localtime') as hour,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(*) as entry_count
      FROM cost_entries
      ${whereClause}
      GROUP BY hour
      ORDER BY hour DESC`,
      params
    );
  },

  getDailyCosts: (days: number = 30, projectIds?: string[]): { date: string; total_cost: number; entry_count: number; input_tokens: number; output_tokens: number }[] => {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const params: any[] = [startTime];
    let whereClause = "WHERE timestamp >= ?";
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      whereClause += ` AND project_id IN (${placeholders})`;
      params.push(...projectIds);
    }
    return queryAll(
      `SELECT
        strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch', 'localtime') as date,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(*) as entry_count,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens
      FROM cost_entries
      ${whereClause}
      GROUP BY date
      ORDER BY date ASC`,
      params
    );
  },

  getTotalTokens: (projectIds?: string[]): { input_tokens: number; output_tokens: number } => {
    const params: any[] = [];
    let whereClause = "";
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      whereClause = `WHERE project_id IN (${placeholders})`;
      params.push(...projectIds);
    }
    const result = queryOne<{ input_tokens: number; output_tokens: number }>(
      `SELECT COALESCE(SUM(input_tokens), 0) as input_tokens, COALESCE(SUM(output_tokens), 0) as output_tokens FROM cost_entries ${whereClause}`,
      params
    );
    return result || { input_tokens: 0, output_tokens: 0 };
  },

  getTotalMessages: (projectIds?: string[]): number => {
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      const result = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM messages m JOIN sessions s ON m.session_id = s.id WHERE s.project_id IN (${placeholders})`,
        projectIds
      );
      return result?.count || 0;
    }
    const result = queryOne<{ count: number }>("SELECT COUNT(*) as count FROM messages");
    return result?.count || 0;
  },

  getTotalSessions: (projectIds?: string[]): number => {
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      const result = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM sessions WHERE project_id IN (${placeholders})`,
        projectIds
      );
      return result?.count || 0;
    }
    const result = queryOne<{ count: number }>("SELECT COUNT(*) as count FROM sessions");
    return result?.count || 0;
  },

  getTotalCalls: (projectIds?: string[]): number => {
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      const result = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM cost_entries WHERE project_id IN (${placeholders})`,
        projectIds
      );
      return result?.count || 0;
    }
    const result = queryOne<{ count: number }>("SELECT COUNT(*) as count FROM cost_entries");
    return result?.count || 0;
  },

  getTotalCostForProjects: (projectIds: string[]): number => {
    if (projectIds.length === 0) return 0;
    const placeholders = projectIds.map(() => '?').join(',');
    const result = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries WHERE project_id IN (${placeholders})`,
      projectIds
    );
    return result?.total || 0;
  },

  getTodayCostForProjects: (projectIds: string[]): number => {
    if (projectIds.length === 0) return 0;
    const startOfDay = getStartOfToday();
    const placeholders = projectIds.map(() => '?').join(',');
    const result = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_entries WHERE project_id IN (${placeholders}) AND timestamp >= ?`,
      [...projectIds, startOfDay]
    );
    return result?.total || 0;
  },

  getAnalytics: (projectIds?: string[]) => {
    const hasFilter = projectIds && projectIds.length > 0;
    const totalEver = hasFilter ? costEntries.getTotalCostForProjects(projectIds!) : costEntries.getTotalEver();
    const totalToday = hasFilter ? costEntries.getTodayCostForProjects(projectIds!) : costEntries.getTotalToday();
    const hourlyCosts = costEntries.getHourlyCosts(7, projectIds);
    const dailyCosts = costEntries.getDailyCosts(30, projectIds);
    const tokens = costEntries.getTotalTokens(projectIds);
    const totalMessages = costEntries.getTotalMessages(projectIds);
    const totalSessions = costEntries.getTotalSessions(projectIds);
    const totalCalls = costEntries.getTotalCalls(projectIds);
    return {
      totalEver,
      totalToday,
      hourlyCosts,
      dailyCosts,
      totalInputTokens: tokens.input_tokens,
      totalOutputTokens: tokens.output_tokens,
      totalMessages,
      totalSessions,
      totalCalls,
    };
  },
};

// Extension Settings
export interface ExtensionSetting {
  id: string;
  project_id: string;
  extension_id: string;
  enabled: number;
  config: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export const extensionSettings = {
  listByProject: (projectId: string) =>
    queryAll<ExtensionSetting>(
      "SELECT * FROM extension_settings WHERE project_id = ? ORDER BY sort_order ASC",
      [projectId]
    ),

  get: (projectId: string, extensionId: string) =>
    queryOne<ExtensionSetting>(
      "SELECT * FROM extension_settings WHERE project_id = ? AND extension_id = ?",
      [projectId, extensionId]
    ),

  upsert: (projectId: string, extensionId: string, enabled: boolean, config?: string | null, sortOrder?: number) => {
    const now = Date.now();
    const existing = extensionSettings.get(projectId, extensionId);
    if (existing) {
      run(
        "UPDATE extension_settings SET enabled = ?, config = COALESCE(?, config), sort_order = COALESCE(?, sort_order), updated_at = ? WHERE project_id = ? AND extension_id = ?",
        [enabled ? 1 : 0, config, sortOrder, now, projectId, extensionId]
      );
    } else {
      const id = crypto.randomUUID();
      run(
        "INSERT INTO extension_settings (id, project_id, extension_id, enabled, config, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, projectId, extensionId, enabled ? 1 : 0, config || null, sortOrder ?? 0, now, now]
      );
    }
  },

  updateConfig: (projectId: string, extensionId: string, config: string) => {
    run(
      "UPDATE extension_settings SET config = ?, updated_at = ? WHERE project_id = ? AND extension_id = ?",
      [config, Date.now(), projectId, extensionId]
    );
  },

  updateOrder: (projectId: string, extensionId: string, sortOrder: number) => {
    run(
      "UPDATE extension_settings SET sort_order = ?, updated_at = ? WHERE project_id = ? AND extension_id = ?",
      [sortOrder, Date.now(), projectId, extensionId]
    );
  },

  updateOrders: (projectId: string, orders: { extensionId: string; sortOrder: number }[]) => {
    const now = Date.now();
    for (const { extensionId, sortOrder } of orders) {
      const existing = extensionSettings.get(projectId, extensionId);
      if (existing) {
        run(
          "UPDATE extension_settings SET sort_order = ?, updated_at = ? WHERE project_id = ? AND extension_id = ?",
          [sortOrder, now, projectId, extensionId]
        );
      } else {
        // Create entry with default enabled=true for ordering
        const id = crypto.randomUUID();
        run(
          "INSERT INTO extension_settings (id, project_id, extension_id, enabled, config, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [id, projectId, extensionId, 1, null, sortOrder, now, now]
        );
      }
    }
  },

  delete: (projectId: string, extensionId: string) =>
    run(
      "DELETE FROM extension_settings WHERE project_id = ? AND extension_id = ?",
      [projectId, extensionId]
    ),

  deleteByProject: (projectId: string) =>
    run("DELETE FROM extension_settings WHERE project_id = ?", [projectId]),
};

// Kanban Cards
export type KanbanStatus = "backlog" | "spec" | "execute" | "review" | "done" | "archived";

export interface KanbanCard {
  id: string;
  project_id: string;
  session_id: string | null;
  title: string;
  spec: string | null;
  status: KanbanStatus;
  status_message: string | null;
  blocked: number; // 0 or 1 - card-level blocked state
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface KanbanCardWithSession extends KanbanCard {
  session_title?: string;
}

export const kanbanCards = {
  listByProject: (projectId: string, includeArchived = false) =>
    queryAll<KanbanCardWithSession>(
      `SELECT k.*, s.title as session_title
       FROM kanban_cards k
       LEFT JOIN sessions s ON k.session_id = s.id
       WHERE k.project_id = ? ${includeArchived ? "" : "AND k.status != 'archived'"}
       ORDER BY k.sort_order ASC, k.created_at DESC`,
      [projectId]
    ),

  listByStatus: (projectId: string, status: KanbanStatus) =>
    queryAll<KanbanCardWithSession>(
      `SELECT k.*, s.title as session_title
       FROM kanban_cards k
       LEFT JOIN sessions s ON k.session_id = s.id
       WHERE k.project_id = ? AND k.status = ?
       ORDER BY k.sort_order ASC`,
      [projectId, status]
    ),

  get: (id: string) =>
    queryOne<KanbanCard>("SELECT * FROM kanban_cards WHERE id = ?", [id]),

  getBySession: (sessionId: string) =>
    queryOne<KanbanCard>("SELECT * FROM kanban_cards WHERE session_id = ?", [sessionId]),

  create: (card: Omit<KanbanCard, "created_at" | "updated_at">) => {
    const now = Date.now();
    run(
      `INSERT INTO kanban_cards (id, project_id, session_id, title, spec, status, status_message, blocked, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.project_id,
        card.session_id,
        card.title,
        card.spec,
        card.status,
        card.status_message,
        card.blocked ?? 0,
        card.sort_order,
        now,
        now,
      ]
    );
  },

  update: (id: string, updates: Partial<Omit<KanbanCard, "id" | "project_id" | "created_at">>) => {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      // Skip undefined values and protected fields
      if (value === undefined) continue;
      if (key !== "id" && key !== "project_id" && key !== "created_at") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    fields.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);
    if (fields.length > 1) {
      run(`UPDATE kanban_cards SET ${fields.join(", ")} WHERE id = ?`, values);
    }
  },

  updateStatus: (id: string, status: KanbanStatus, statusMessage?: string | null) => {
    run(
      "UPDATE kanban_cards SET status = ?, status_message = ?, updated_at = ? WHERE id = ?",
      [status, statusMessage ?? null, Date.now(), id]
    );
  },

  setBlocked: (id: string, blocked: boolean, statusMessage?: string | null) => {
    run(
      "UPDATE kanban_cards SET blocked = ?, status_message = ?, updated_at = ? WHERE id = ?",
      [blocked ? 1 : 0, statusMessage ?? null, Date.now(), id]
    );
  },

  linkSession: (id: string, sessionId: string) => {
    run(
      "UPDATE kanban_cards SET session_id = ?, updated_at = ? WHERE id = ?",
      [sessionId, Date.now(), id]
    );
  },

  unlinkSession: (sessionId: string) => {
    run(
      "UPDATE kanban_cards SET session_id = NULL, updated_at = ? WHERE session_id = ?",
      [Date.now(), sessionId]
    );
  },

  reorder: (cardIds: string[]) => {
    const now = Date.now();
    for (let i = 0; i < cardIds.length; i++) {
      run(
        "UPDATE kanban_cards SET sort_order = ?, updated_at = ? WHERE id = ?",
        [i, now, cardIds[i]]
      );
    }
  },

  delete: (id: string) => run("DELETE FROM kanban_cards WHERE id = ?", [id]),

  deleteByProject: (projectId: string) =>
    run("DELETE FROM kanban_cards WHERE project_id = ?", [projectId]),

  archive: (id: string) =>
    run(
      "UPDATE kanban_cards SET status = 'archived', updated_at = ? WHERE id = ?",
      [Date.now(), id]
    ),
};

// ============================================================================
// Multi-Session Hierarchy (Fractal Agents)
// ============================================================================

export const MAX_SESSION_DEPTH = 3;
export const MAX_CONCURRENT_SESSIONS = 20;

export interface SessionDecision {
  id: string;
  root_session_id: string;
  session_id: string;
  category: string | null;
  decision: string;
  rationale: string | null;
  created_at: number;
}

export interface SessionArtifact {
  id: string;
  session_id: string;
  root_session_id: string;
  path: string;
  content: string | null;
  description: string | null;
  artifact_type: string | null;
  created_at: number;
}

export interface SessionTreeNode extends Session {
  children: SessionTreeNode[];
}

export interface SessionWithParent extends Session {
  parent_title?: string;
  parent_role?: string;
}

// Session hierarchy methods
export const sessionHierarchy = {
  // Get a session's full tree (root and all descendants)
  getTree: (rootSessionId: string): SessionTreeNode | null => {
    const root = sessions.get(rootSessionId);
    if (!root) return null;

    const buildTree = (session: Session): SessionTreeNode => {
      const children = queryAll<Session>(
        "SELECT * FROM sessions WHERE parent_session_id = ? ORDER BY created_at ASC",
        [session.id]
      );
      return {
        ...session,
        children: children.map(buildTree),
      };
    };

    return buildTree(root);
  },

  // Get direct children of a session
  getChildren: (sessionId: string): Session[] =>
    queryAll<Session>(
      "SELECT * FROM sessions WHERE parent_session_id = ? ORDER BY created_at ASC",
      [sessionId]
    ),

  // Get all descendants (children, grandchildren, etc.)
  getDescendants: (sessionId: string): Session[] => {
    const descendants: Session[] = [];
    const collectDescendants = (parentId: string) => {
      const children = queryAll<Session>(
        "SELECT * FROM sessions WHERE parent_session_id = ?",
        [parentId]
      );
      for (const child of children) {
        descendants.push(child);
        collectDescendants(child.id);
      }
    };
    collectDescendants(sessionId);
    return descendants;
  },

  // Get siblings (other children of same parent)
  getSiblings: (sessionId: string): Session[] => {
    const session = sessions.get(sessionId);
    if (!session || !session.parent_session_id) return [];
    return queryAll<Session>(
      "SELECT * FROM sessions WHERE parent_session_id = ? AND id != ? ORDER BY created_at ASC",
      [session.parent_session_id, sessionId]
    );
  },

  // Get ancestor chain (parent, grandparent, etc.)
  getAncestors: (sessionId: string): Session[] => {
    const ancestors: Session[] = [];
    let current = sessions.get(sessionId);
    while (current?.parent_session_id) {
      const parent = sessions.get(current.parent_session_id);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    return ancestors;
  },

  // Spawn a child session
  spawnChild: (
    parentSessionId: string,
    config: {
      id: string;
      title: string;
      role: string;
      task: string;
      model?: string;
      backend?: string;   // 'claude' | 'codex' | 'gemini' for multi-backend dispatch
      agentType?: string;  // 'browser' | 'coding' | 'research' | etc. for native UI
    }
  ): Session | null => {
    const parent = sessions.get(parentSessionId);
    if (!parent) return null;

    // Check depth limit (handle null/undefined depth for older sessions)
    const parentDepth = parent.depth ?? 0;
    if (parentDepth >= MAX_SESSION_DEPTH - 1) {
      console.error(`Cannot spawn child: max depth (${MAX_SESSION_DEPTH}) reached`);
      return null;
    }

    // Check concurrent session limit
    const rootId = parent.root_session_id || parent.id;
    const activeCount = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM sessions
       WHERE (root_session_id = ? OR id = ?)
       AND agent_status IN ('working', 'waiting', 'blocked')`,
      [rootId, rootId]
    );
    if (activeCount && activeCount.count >= MAX_CONCURRENT_SESSIONS) {
      console.error(`Cannot spawn child: max concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached`);
      return null;
    }

    const now = Date.now();
    const newDepth = parentDepth + 1;
    const rootSessionId = parent.root_session_id || parent.id;

    run(
      `INSERT INTO sessions (
        id, project_id, title, model, backend,
        parent_session_id, root_session_id, depth, role, task, agent_status, agent_type,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'working', ?, ?, ?)`,
      [
        config.id,
        parent.project_id,
        config.title,
        config.model || parent.model,
        config.backend || parent.backend || 'claude',  // Inherit backend from parent
        parentSessionId,
        rootSessionId,
        newDepth,
        config.role,
        config.task,
        config.agentType || null,
        now,
        now,
      ]
    );

    // Update parent to waiting status
    run(
      "UPDATE sessions SET agent_status = 'waiting', updated_at = ? WHERE id = ?",
      [now, parentSessionId]
    );

    return sessions.get(config.id) || null;
  },

  // Update agent status
  updateAgentStatus: (sessionId: string, status: AgentStatus) => {
    const now = Date.now();
    const updates: any[] = [status, now];
    let sql = "UPDATE sessions SET agent_status = ?, updated_at = ?";

    if (status === 'delivered') {
      sql += ", delivered_at = ?";
      updates.push(now);
    } else if (status === 'archived') {
      sql += ", archived_at = ?";
      updates.push(now);
    }

    sql += " WHERE id = ?";
    updates.push(sessionId);
    run(sql, updates);
  },

  // Set escalation
  setEscalation: (sessionId: string, escalation: Escalation) => {
    run(
      "UPDATE sessions SET agent_status = 'blocked', escalation = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(escalation), Date.now(), sessionId]
    );
  },

  // Clear escalation (when resolved)
  clearEscalation: (sessionId: string) => {
    run(
      "UPDATE sessions SET agent_status = 'working', escalation = NULL, updated_at = ? WHERE id = ?",
      [Date.now(), sessionId]
    );
  },

  // Set deliverable
  setDeliverable: (sessionId: string, deliverable: Deliverable) => {
    const now = Date.now();
    run(
      "UPDATE sessions SET agent_status = 'delivered', deliverable = ?, delivered_at = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(deliverable), now, now, sessionId]
    );

    // Check if parent should resume (all children delivered)
    const session = sessions.get(sessionId);
    if (session?.parent_session_id) {
      const pendingChildren = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM sessions
         WHERE parent_session_id = ? AND agent_status NOT IN ('delivered', 'failed', 'archived')`,
        [session.parent_session_id]
      );
      if (pendingChildren && pendingChildren.count === 0) {
        run(
          "UPDATE sessions SET agent_status = 'working', updated_at = ? WHERE id = ?",
          [now, session.parent_session_id]
        );
      }
    }
  },

  // Archive a session (and optionally its descendants)
  archiveSession: (sessionId: string, archiveDescendants: boolean = true) => {
    const now = Date.now();
    run(
      "UPDATE sessions SET agent_status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?",
      [now, now, sessionId]
    );

    if (archiveDescendants) {
      const descendants = sessionHierarchy.getDescendants(sessionId);
      for (const desc of descendants) {
        run(
          "UPDATE sessions SET agent_status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?",
          [now, now, desc.id]
        );
      }
    }
  },

  // Get all active sessions in a tree
  getActiveSessions: (rootSessionId: string): Session[] =>
    queryAll<Session>(
      `SELECT * FROM sessions
       WHERE (root_session_id = ? OR id = ?)
       AND agent_status IN ('working', 'waiting', 'blocked')
       ORDER BY depth ASC, created_at ASC`,
      [rootSessionId, rootSessionId]
    ),

  // Get blocked sessions that need attention
  getBlockedSessions: (rootSessionId: string): Session[] =>
    queryAll<Session>(
      `SELECT * FROM sessions
       WHERE (root_session_id = ? OR id = ?)
       AND agent_status = 'blocked'
       ORDER BY depth ASC, created_at ASC`,
      [rootSessionId, rootSessionId]
    ),

  // Count active sessions in tree
  countActiveSessions: (rootSessionId: string): number => {
    const result = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM sessions
       WHERE (root_session_id = ? OR id = ?)
       AND agent_status IN ('working', 'waiting', 'blocked')`,
      [rootSessionId, rootSessionId]
    );
    return result?.count || 0;
  },
};

// Session decisions CRUD
export const sessionDecisions = {
  listByRoot: (rootSessionId: string): SessionDecision[] =>
    queryAll<SessionDecision>(
      "SELECT * FROM session_decisions WHERE root_session_id = ? ORDER BY created_at DESC",
      [rootSessionId]
    ),

  listBySession: (sessionId: string): SessionDecision[] =>
    queryAll<SessionDecision>(
      "SELECT * FROM session_decisions WHERE session_id = ? ORDER BY created_at DESC",
      [sessionId]
    ),

  listByCategory: (rootSessionId: string, category: string): SessionDecision[] =>
    queryAll<SessionDecision>(
      "SELECT * FROM session_decisions WHERE root_session_id = ? AND category = ? ORDER BY created_at DESC",
      [rootSessionId, category]
    ),

  get: (id: string): SessionDecision | undefined =>
    queryOne<SessionDecision>("SELECT * FROM session_decisions WHERE id = ?", [id]),

  create: (decision: SessionDecision) => {
    run(
      `INSERT INTO session_decisions (id, root_session_id, session_id, category, decision, rationale, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        decision.id,
        decision.root_session_id,
        decision.session_id,
        decision.category,
        decision.decision,
        decision.rationale,
        decision.created_at,
      ]
    );
  },

  delete: (id: string) => run("DELETE FROM session_decisions WHERE id = ?", [id]),

  deleteBySession: (sessionId: string) =>
    run("DELETE FROM session_decisions WHERE session_id = ?", [sessionId]),

  deleteByRoot: (rootSessionId: string) =>
    run("DELETE FROM session_decisions WHERE root_session_id = ?", [rootSessionId]),
};

// Session artifacts CRUD
export const sessionArtifacts = {
  listByRoot: (rootSessionId: string): SessionArtifact[] =>
    queryAll<SessionArtifact>(
      "SELECT * FROM session_artifacts WHERE root_session_id = ? ORDER BY created_at DESC",
      [rootSessionId]
    ),

  listBySession: (sessionId: string): SessionArtifact[] =>
    queryAll<SessionArtifact>(
      "SELECT * FROM session_artifacts WHERE session_id = ? ORDER BY created_at DESC",
      [sessionId]
    ),

  listByType: (rootSessionId: string, artifactType: string): SessionArtifact[] =>
    queryAll<SessionArtifact>(
      "SELECT * FROM session_artifacts WHERE root_session_id = ? AND artifact_type = ? ORDER BY created_at DESC",
      [rootSessionId, artifactType]
    ),

  get: (id: string): SessionArtifact | undefined =>
    queryOne<SessionArtifact>("SELECT * FROM session_artifacts WHERE id = ?", [id]),

  getByPath: (rootSessionId: string, path: string): SessionArtifact | undefined =>
    queryOne<SessionArtifact>(
      "SELECT * FROM session_artifacts WHERE root_session_id = ? AND path = ?",
      [rootSessionId, path]
    ),

  create: (artifact: SessionArtifact) => {
    run(
      `INSERT INTO session_artifacts (id, session_id, root_session_id, path, content, description, artifact_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifact.id,
        artifact.session_id,
        artifact.root_session_id,
        artifact.path,
        artifact.content,
        artifact.description,
        artifact.artifact_type,
        artifact.created_at,
      ]
    );
  },

  update: (id: string, updates: Partial<Omit<SessionArtifact, "id" | "session_id" | "root_session_id" | "created_at">>) => {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (fields.length === 0) return;
    values.push(id);
    run(`UPDATE session_artifacts SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  delete: (id: string) => run("DELETE FROM session_artifacts WHERE id = ?", [id]),

  deleteBySession: (sessionId: string) =>
    run("DELETE FROM session_artifacts WHERE session_id = ?", [sessionId]),

  deleteByRoot: (rootSessionId: string) =>
    run("DELETE FROM session_artifacts WHERE root_session_id = ?", [rootSessionId]),
};

// ============================================================================
// Command Settings (Workspace/Global Command Management)
// ============================================================================

export type CommandScope = "global" | "workspace";

export interface CommandSetting {
  id: string;
  command_name: string;
  scope: CommandScope;
  project_id: string | null;
  enabled: number;
  sort_order: number;
  config: string | null;
  created_at: number;
  updated_at: number;
}

export const commandSettings = {
  // List all global command settings
  listGlobal: (): CommandSetting[] =>
    queryAll<CommandSetting>(
      "SELECT * FROM command_settings WHERE scope = 'global' ORDER BY sort_order ASC",
      []
    ),

  // List command settings for a specific workspace/project
  listByProject: (projectId: string): CommandSetting[] =>
    queryAll<CommandSetting>(
      "SELECT * FROM command_settings WHERE scope = 'workspace' AND project_id = ? ORDER BY sort_order ASC",
      [projectId]
    ),

  // Get a specific command setting
  get: (commandName: string, scope: CommandScope, projectId?: string | null): CommandSetting | undefined => {
    if (scope === "global") {
      return queryOne<CommandSetting>(
        "SELECT * FROM command_settings WHERE command_name = ? AND scope = 'global'",
        [commandName]
      );
    }
    return queryOne<CommandSetting>(
      "SELECT * FROM command_settings WHERE command_name = ? AND scope = 'workspace' AND project_id = ?",
      [commandName, projectId]
    );
  },

  // Create or update a command setting
  upsert: (
    commandName: string,
    scope: CommandScope,
    projectId: string | null,
    enabled: boolean,
    sortOrder?: number,
    config?: string | null
  ) => {
    const now = Date.now();
    const existing = commandSettings.get(commandName, scope, projectId);

    if (existing) {
      run(
        `UPDATE command_settings
         SET enabled = ?, sort_order = COALESCE(?, sort_order), config = COALESCE(?, config), updated_at = ?
         WHERE id = ?`,
        [enabled ? 1 : 0, sortOrder, config, now, existing.id]
      );
    } else {
      const id = crypto.randomUUID();
      run(
        `INSERT INTO command_settings (id, command_name, scope, project_id, enabled, sort_order, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, commandName, scope, projectId, enabled ? 1 : 0, sortOrder ?? 0, config || null, now, now]
      );
    }
  },

  // Toggle enabled status for a command
  toggleEnabled: (commandName: string, scope: CommandScope, projectId: string | null, enabled: boolean) => {
    const existing = commandSettings.get(commandName, scope, projectId);
    if (existing) {
      run(
        "UPDATE command_settings SET enabled = ?, updated_at = ? WHERE id = ?",
        [enabled ? 1 : 0, Date.now(), existing.id]
      );
    } else {
      commandSettings.upsert(commandName, scope, projectId, enabled);
    }
  },

  // Update config for a command
  updateConfig: (commandName: string, scope: CommandScope, projectId: string | null, config: string) => {
    const existing = commandSettings.get(commandName, scope, projectId);
    if (existing) {
      run(
        "UPDATE command_settings SET config = ?, updated_at = ? WHERE id = ?",
        [config, Date.now(), existing.id]
      );
    }
  },

  // Update sort order for a single command
  updateOrder: (commandName: string, scope: CommandScope, projectId: string | null, sortOrder: number) => {
    const existing = commandSettings.get(commandName, scope, projectId);
    if (existing) {
      run(
        "UPDATE command_settings SET sort_order = ?, updated_at = ? WHERE id = ?",
        [sortOrder, Date.now(), existing.id]
      );
    } else {
      commandSettings.upsert(commandName, scope, projectId, true, sortOrder);
    }
  },

  // Batch update sort orders
  updateOrders: (scope: CommandScope, projectId: string | null, orders: { commandName: string; sortOrder: number }[]) => {
    const now = Date.now();
    for (const { commandName, sortOrder } of orders) {
      const existing = commandSettings.get(commandName, scope, projectId);
      if (existing) {
        run(
          "UPDATE command_settings SET sort_order = ?, updated_at = ? WHERE id = ?",
          [sortOrder, now, existing.id]
        );
      } else {
        const id = crypto.randomUUID();
        run(
          `INSERT INTO command_settings (id, command_name, scope, project_id, enabled, sort_order, config, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, NULL, ?, ?)`,
          [id, commandName, scope, projectId, sortOrder, now, now]
        );
      }
    }
  },

  // Delete a specific command setting
  delete: (commandName: string, scope: CommandScope, projectId: string | null) => {
    if (scope === "global") {
      run(
        "DELETE FROM command_settings WHERE command_name = ? AND scope = 'global'",
        [commandName]
      );
    } else {
      run(
        "DELETE FROM command_settings WHERE command_name = ? AND scope = 'workspace' AND project_id = ?",
        [commandName, projectId]
      );
    }
  },

  // Delete all command settings for a project
  deleteByProject: (projectId: string) =>
    run("DELETE FROM command_settings WHERE project_id = ?", [projectId]),

  // Check if a command is enabled (respects scope hierarchy: workspace overrides global)
  isEnabled: (commandName: string, projectId?: string | null): boolean => {
    // First check workspace-level setting
    if (projectId) {
      const workspaceSetting = commandSettings.get(commandName, "workspace", projectId);
      if (workspaceSetting) {
        return workspaceSetting.enabled === 1;
      }
    }

    // Fall back to global setting
    const globalSetting = commandSettings.get(commandName, "global", null);
    if (globalSetting) {
      return globalSetting.enabled === 1;
    }

    // Default: enabled
    return true;
  },

  // Get merged settings for a project (global + workspace overrides)
  getMergedSettings: (projectId: string | null): Map<string, CommandSetting> => {
    const merged = new Map<string, CommandSetting>();

    // Start with global settings
    const globalSettings = commandSettings.listGlobal();
    for (const setting of globalSettings) {
      merged.set(setting.command_name, setting);
    }

    // Override with workspace settings if projectId provided
    if (projectId) {
      const workspaceSettings = commandSettings.listByProject(projectId);
      for (const setting of workspaceSettings) {
        merged.set(setting.command_name, setting);
      }
    }

    return merged;
  },
};

// ============================================================================
// Channels - Cross-workspace agent collaboration
// ============================================================================

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  workspace_access: 'selected' | 'all';
  settings: string; // JSON
  created_at: number;
  updated_at: number;
  // Joined fields
  workspace_ids?: string[];
}

export interface ChannelThread {
  id: string;
  channel_id: string;
  title: string | null;
  status: 'active' | 'resolved' | 'archived';
  workspace_id: string | null;
  branch_name: string | null;
  created_at: number;
  updated_at: number;
  // Joined fields
  message_count?: number;
  last_message_at?: number;
}

export interface ChannelMessage {
  id: string;
  thread_id: string;
  sender_type: 'user' | 'agent';
  sender_id: string;
  sender_name: string;
  content: string;
  mentions: string; // JSON array
  agent_action: string | null; // JSON
  created_at: number;
}

export const channels = {
  list: (): Channel[] => {
    const stmt = db.prepare(`
      SELECT c.*, GROUP_CONCAT(cw.workspace_id) as workspace_ids
      FROM channels c
      LEFT JOIN channel_workspaces cw ON c.id = cw.channel_id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `);
    const results: Channel[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push({
        ...row,
        workspace_ids: row.workspace_ids ? row.workspace_ids.split(',') : [],
      });
    }
    stmt.free();
    return results;
  },

  get: (id: string): Channel | null => {
    const stmt = db.prepare(`
      SELECT c.*, GROUP_CONCAT(cw.workspace_id) as workspace_ids
      FROM channels c
      LEFT JOIN channel_workspaces cw ON c.id = cw.channel_id
      WHERE c.id = ?
      GROUP BY c.id
    `);
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as any;
      stmt.free();
      return {
        ...row,
        workspace_ids: row.workspace_ids ? row.workspace_ids.split(',') : [],
      };
    }
    stmt.free();
    return null;
  },

  create: (id: string, name: string, description: string | null, workspaceAccess: 'selected' | 'all', workspaceIds: string[], now: number): void => {
    db.run(
      "INSERT INTO channels (id, name, description, workspace_access, settings, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)",
      [id, name, description, workspaceAccess, now, now]
    );
    // Add workspace mappings
    for (const wsId of workspaceIds) {
      db.run("INSERT INTO channel_workspaces (channel_id, workspace_id) VALUES (?, ?)", [id, wsId]);
    }
    saveDb();
  },

  update: (id: string, name: string, description: string | null, workspaceAccess: 'selected' | 'all', workspaceIds: string[], now: number): void => {
    db.run(
      "UPDATE channels SET name = ?, description = ?, workspace_access = ?, updated_at = ? WHERE id = ?",
      [name, description, workspaceAccess, now, id]
    );
    // Update workspace mappings
    db.run("DELETE FROM channel_workspaces WHERE channel_id = ?", [id]);
    for (const wsId of workspaceIds) {
      db.run("INSERT INTO channel_workspaces (channel_id, workspace_id) VALUES (?, ?)", [id, wsId]);
    }
    saveDb();
  },

  delete: (id: string): void => {
    db.run("DELETE FROM channels WHERE id = ?", [id]);
    saveDb();
  },

  touch: (id: string, now: number): void => {
    db.run("UPDATE channels SET updated_at = ? WHERE id = ?", [now, id]);
    saveDb();
  },
};

export const channelThreads = {
  listByChannel: (channelId: string): ChannelThread[] => {
    const stmt = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM channel_messages WHERE thread_id = t.id) as message_count,
        (SELECT MAX(created_at) FROM channel_messages WHERE thread_id = t.id) as last_message_at
      FROM channel_threads t
      WHERE t.channel_id = ?
      ORDER BY t.updated_at DESC
    `);
    stmt.bind([channelId]);
    const results: ChannelThread[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as ChannelThread);
    }
    stmt.free();
    return results;
  },

  get: (id: string): ChannelThread | null => {
    const stmt = db.prepare("SELECT * FROM channel_threads WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const result = stmt.getAsObject() as ChannelThread;
      stmt.free();
      return result;
    }
    stmt.free();
    return null;
  },

  create: (id: string, channelId: string, title: string | null, workspaceId: string | null, now: number): void => {
    db.run(
      "INSERT INTO channel_threads (id, channel_id, title, status, workspace_id, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)",
      [id, channelId, title, workspaceId, now, now]
    );
    channels.touch(channelId, now);
    saveDb();
  },

  update: (id: string, title: string | null, status: string, now: number): void => {
    db.run("UPDATE channel_threads SET title = ?, status = ?, updated_at = ? WHERE id = ?", [title, status, now, id]);
    saveDb();
  },

  setBranch: (id: string, branchName: string | null, now: number): void => {
    db.run("UPDATE channel_threads SET branch_name = ?, updated_at = ? WHERE id = ?", [branchName, now, id]);
    saveDb();
  },

  delete: (id: string): void => {
    db.run("DELETE FROM channel_threads WHERE id = ?", [id]);
    saveDb();
  },

  touch: (id: string, now: number): void => {
    db.run("UPDATE channel_threads SET updated_at = ? WHERE id = ?", [now, id]);
    // Also touch the channel
    const thread = channelThreads.get(id);
    if (thread) {
      channels.touch(thread.channel_id, now);
    }
    saveDb();
  },
};

export const channelMessages = {
  listByThread: (threadId: string, limit = 100, offset = 0): ChannelMessage[] => {
    const stmt = db.prepare(`
      SELECT * FROM channel_messages
      WHERE thread_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `);
    stmt.bind([threadId, limit, offset]);
    const results: ChannelMessage[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as ChannelMessage);
    }
    stmt.free();
    return results;
  },

  get: (id: string): ChannelMessage | null => {
    const stmt = db.prepare("SELECT * FROM channel_messages WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const result = stmt.getAsObject() as ChannelMessage;
      stmt.free();
      return result;
    }
    stmt.free();
    return null;
  },

  create: (
    id: string,
    threadId: string,
    senderType: 'user' | 'agent',
    senderId: string,
    senderName: string,
    content: string,
    mentions: string[],
    agentAction: any | null,
    now: number
  ): void => {
    db.run(
      "INSERT INTO channel_messages (id, thread_id, sender_type, sender_id, sender_name, content, mentions, agent_action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, threadId, senderType, senderId, senderName, content, JSON.stringify(mentions), agentAction ? JSON.stringify(agentAction) : null, now]
    );
    channelThreads.touch(threadId, now);
    saveDb();
  },

  delete: (id: string): void => {
    db.run("DELETE FROM channel_messages WHERE id = ?", [id]);
    saveDb();
  },

  countByThread: (threadId: string): number => {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM channel_messages WHERE thread_id = ?");
    stmt.bind([threadId]);
    if (stmt.step()) {
      const result = stmt.getAsObject() as { count: number };
      stmt.free();
      return result.count;
    }
    stmt.free();
    return 0;
  },
};
