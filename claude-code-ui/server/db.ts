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
      timestamp INTEGER NOT NULL
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
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
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
}

export const projects = {
  list: () => queryAll<ProjectWithStats>(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM sessions WHERE project_id = p.id) as session_count,
      (SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id) as last_activity
    FROM projects p 
    ORDER BY p.pinned DESC, p.sort_order ASC, COALESCE((SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id), p.updated_at) DESC
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
};

export interface SessionWithProject extends Session {
  project_name: string;
}

export const sessions = {
  listByProject: (projectId: string) => 
    queryAll<Session>("SELECT * FROM sessions WHERE project_id = ? ORDER BY pinned DESC, sort_order ASC, updated_at DESC", [projectId]),
  listRecent: (limit: number = 10) =>
    queryAll<SessionWithProject>(`
      SELECT s.*, p.name as project_name 
      FROM sessions s 
      LEFT JOIN projects p ON s.project_id = p.id
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
    run("UPDATE sessions SET claude_session_id = ?, model = ?, total_cost_usd = total_cost_usd + ?, total_turns = total_turns + ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, updated_at = ? WHERE id = ?",
        [claude_session_id, model, cost, turns, inputTokens, outputTokens, updated_at, id]),
  delete: (id: string) => run("DELETE FROM sessions WHERE id = ?", [id]),
  togglePin: (id: string, pinned: boolean) =>
    run("UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ?", [pinned ? 1 : 0, Date.now(), id]),
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
};

export const messages = {
  listBySession: (sessionId: string) =>
    queryAll<Message>("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", [sessionId]),
  get: (id: string) => queryOne<Message>("SELECT * FROM messages WHERE id = ?", [id]),
  create: (id: string, session_id: string, role: string, content: string, timestamp: number) =>
    run("INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)",
        [id, session_id, role, content, timestamp]),
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
