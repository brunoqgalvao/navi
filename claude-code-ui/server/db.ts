import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DATA_DIR = join(homedir(), ".claude-code-ui");
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(join(DATA_DIR, "data.db"));

db.exec(`
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
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
`);

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

export const projects = {
  list: db.prepare<[], Project>("SELECT * FROM projects ORDER BY updated_at DESC"),

  get: db.prepare<[string], Project>("SELECT * FROM projects WHERE id = ?"),

  create: db.prepare<[string, string, string, string | null, number, number], void>(
    "INSERT INTO projects (id, name, path, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ),

  update: db.prepare<[string, string, string | null, number, string], void>(
    "UPDATE projects SET name = ?, path = ?, description = ?, updated_at = ? WHERE id = ?"
  ),

  delete: db.prepare<[string], void>("DELETE FROM projects WHERE id = ?"),
};

export const sessions = {
  listByProject: db.prepare<[string], Session>(
    "SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC"
  ),

  get: db.prepare<[string], Session>("SELECT * FROM sessions WHERE id = ?"),

  create: db.prepare<[string, string, string, number, number], void>(
    "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ),

  update: db.prepare<[string, string | null, string | null, number, number, number, string], void>(
    "UPDATE sessions SET title = ?, claude_session_id = ?, model = ?, total_cost_usd = ?, total_turns = ?, updated_at = ? WHERE id = ?"
  ),

  updateClaudeSession: db.prepare<[string, string | null, number, number, number, string], void>(
    "UPDATE sessions SET claude_session_id = ?, model = ?, total_cost_usd = ?, total_turns = ?, updated_at = ? WHERE id = ?"
  ),

  delete: db.prepare<[string], void>("DELETE FROM sessions WHERE id = ?"),
};

export const messages = {
  listBySession: db.prepare<[string], Message>(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC"
  ),

  create: db.prepare<[string, string, string, string, number], void>(
    "INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)"
  ),

  deleteBySession: db.prepare<[string], void>("DELETE FROM messages WHERE session_id = ?"),
};

export default db;
