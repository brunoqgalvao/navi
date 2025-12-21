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
  
  saveDb();
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
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
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
}

export const projects = {
  list: () => queryAll<ProjectWithStats>(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM sessions WHERE project_id = p.id) as session_count,
      (SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id) as last_activity
    FROM projects p 
    ORDER BY COALESCE((SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id), p.updated_at) DESC
  `),
  get: (id: string) => queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]),
  create: (id: string, name: string, path: string, description: string | null, created_at: number, updated_at: number) =>
    run("INSERT INTO projects (id, name, path, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", 
        [id, name, path, description, created_at, updated_at]),
  update: (name: string, path: string, description: string | null, updated_at: number, id: string) =>
    run("UPDATE projects SET name = ?, path = ?, description = ?, updated_at = ? WHERE id = ?",
        [name, path, description, updated_at, id]),
  delete: (id: string) => run("DELETE FROM projects WHERE id = ?", [id]),
};

export const sessions = {
  listByProject: (projectId: string) => 
    queryAll<Session>("SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC", [projectId]),
  get: (id: string) => queryOne<Session>("SELECT * FROM sessions WHERE id = ?", [id]),
  create: (id: string, project_id: string, title: string, created_at: number, updated_at: number) =>
    run("INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, project_id, title, created_at, updated_at]),
  updateTitle: (title: string, updated_at: number, id: string) =>
    run("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?", [title, updated_at, id]),
  updateClaudeSession: (claude_session_id: string | null, model: string | null, cost: number, turns: number, updated_at: number, id: string) =>
    run("UPDATE sessions SET claude_session_id = ?, model = ?, total_cost_usd = ?, total_turns = ?, updated_at = ? WHERE id = ?",
        [claude_session_id, model, cost, turns, updated_at, id]),
  delete: (id: string) => run("DELETE FROM sessions WHERE id = ?", [id]),
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
};

export const messages = {
  listBySession: (sessionId: string) =>
    queryAll<Message>("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", [sessionId]),
  create: (id: string, session_id: string, role: string, content: string, timestamp: number) =>
    run("INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)",
        [id, session_id, role, content, timestamp]),
  deleteBySession: (sessionId: string) => run("DELETE FROM messages WHERE session_id = ?", [sessionId]),
};

export function getDb() {
  return db;
}
