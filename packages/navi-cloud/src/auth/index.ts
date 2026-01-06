/**
 * Navi Auth - Simple session-based authentication
 *
 * No external dependencies. Uses D1 for storage.
 * Passwords hashed with Web Crypto API (PBKDF2).
 */

// Types
export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface NaviAuth {
  register(email: string, password: string): Promise<User>;
  login(email: string, password: string): Promise<{ session: Session; user: User }>;
  validateSession(sessionId: string): Promise<{ session: Session; user: User } | null>;
  logout(sessionId: string): Promise<void>;
  getUser(userId: string): Promise<User | null>;
}

// Session duration: 30 days
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Create auth instance for a D1 database
export function createNaviAuth(db: D1Database): NaviAuth {
  return {
    async register(email: string, password: string): Promise<User> {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if user exists
      const existing = await db
        .prepare('SELECT id FROM users WHERE email = ?')
        .bind(normalizedEmail)
        .first();

      if (existing) {
        throw new Error('Email already registered');
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const userId = generateId();
      const now = new Date().toISOString();

      await db
        .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, normalizedEmail, passwordHash, now)
        .run();

      return {
        id: userId,
        email: normalizedEmail,
        createdAt: now,
      };
    },

    async login(email: string, password: string): Promise<{ session: Session; user: User }> {
      const normalizedEmail = email.toLowerCase().trim();

      // Find user
      const user = await db
        .prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?')
        .bind(normalizedEmail)
        .first<{ id: string; email: string; password_hash: string; created_at: string }>();

      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        throw new Error('Invalid email or password');
      }

      // Create session
      const sessionId = generateId(32);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      const now = new Date().toISOString();

      await db
        .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .bind(sessionId, user.id, expiresAt, now)
        .run();

      return {
        session: {
          id: sessionId,
          userId: user.id,
          expiresAt,
        },
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
        },
      };
    },

    async validateSession(sessionId: string): Promise<{ session: Session; user: User } | null> {
      const result = await db
        .prepare(`
          SELECT s.id, s.user_id, s.expires_at, u.email, u.created_at
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.id = ?
        `)
        .bind(sessionId)
        .first<{
          id: string;
          user_id: string;
          expires_at: string;
          email: string;
          created_at: string;
        }>();

      if (!result) {
        return null;
      }

      // Check expiration
      if (new Date(result.expires_at) < new Date()) {
        // Session expired, clean it up
        await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
        return null;
      }

      return {
        session: {
          id: result.id,
          userId: result.user_id,
          expiresAt: result.expires_at,
        },
        user: {
          id: result.user_id,
          email: result.email,
          createdAt: result.created_at,
        },
      };
    },

    async logout(sessionId: string): Promise<void> {
      await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    },

    async getUser(userId: string): Promise<User | null> {
      const user = await db
        .prepare('SELECT id, email, created_at FROM users WHERE id = ?')
        .bind(userId)
        .first<{ id: string; email: string; created_at: string }>();

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      };
    },
  };
}

// --- Password Hashing (PBKDF2 via Web Crypto API) ---

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Format: base64(salt):base64(hash)
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));

  return `${saltB64}:${hashB64}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltB64, hashB64] = storedHash.split(':');

  if (!saltB64 || !hashB64) {
    return false;
  }

  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const expectedHash = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));

  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const actualHash = new Uint8Array(hash);

  // Constant-time comparison
  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }

  return diff === 0;
}

// --- Utilities ---

function generateId(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// --- Cookie Helpers ---

export function setSessionCookie(sessionId: string, expiresAt: Date): string {
  return `navi_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie(): string {
  return 'navi_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

export function getSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/navi_session=([^;]+)/);
  return match ? match[1] : null;
}

// --- Database Schema ---

export const AUTH_SCHEMA = `
-- Navi Auth Schema
-- Add this to your D1 database

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;
