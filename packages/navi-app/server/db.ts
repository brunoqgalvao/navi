import initSqlJs, { type Database } from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DATA_DIR = join(homedir(), ".claude-code-ui");
const DB_PATH = join(DATA_DIR, "data.db");

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database;

export async function initDb() {
  const SQL = await initSqlJs();
  
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
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

  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      collapsed INTEGER DEFAULT 0,
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
  
  saveDb()
  return db;
}

export function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
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
  created_at: number;
  updated_at: number;
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

function run(sql: string, params: any[] = []) {
  db.run(sql, params);
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

export const sessions = {
  listByProject: (projectId: string, includeArchived: boolean = false) =>
    queryAll<Session>(`SELECT * FROM sessions WHERE project_id = ? ${includeArchived ? '' : 'AND (archived = 0 OR archived IS NULL)'} ORDER BY pinned DESC, favorite DESC, sort_order ASC, updated_at DESC`, [projectId]),
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
  create: (id: string, project_id: string, title: string, created_at: number, updated_at: number) =>
    run("INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, project_id, title, created_at, updated_at]),
  updateTitle: (title: string, updated_at: number, id: string) =>
    run("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?", [title, updated_at, id]),
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
  setArchived: (id: string, archived: boolean) =>
    run("UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?", [archived ? 1 : 0, Date.now(), id]),
};

export const messages = {
  listBySession: (sessionId: string) =>
    queryAll<Message>("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", [sessionId]),
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
    let sql = `
      SELECT si.*, p.name as project_name
      FROM search_index si
      LEFT JOIN projects p ON si.project_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
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
    
    sql += ` ORDER BY 
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
  "Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "TodoWrite"
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
  created_at: number;
  updated_at: number;
}

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
        SUM(cost_usd) as total_cost,
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
        SUM(cost_usd) as total_cost,
        COUNT(*) as entry_count,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens
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
