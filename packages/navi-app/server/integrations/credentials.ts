/**
 * Credential Storage System
 *
 * Handles encrypted storage of API keys and other simple credentials.
 * Complements the OAuth integration system for services that use API keys.
 *
 * Supports both user-level (global) and project-scoped credentials:
 * - User-level: project_id is NULL, applies to all projects
 * - Project-scoped: project_id is set, overrides user-level for that project
 *
 * Lookup order: Project-specific → User-level fallback
 */

import { getDb, saveDb } from "../db";
import { encrypt, decrypt } from "./crypto";

// Scope options for credentials
export interface CredentialScope {
  projectId?: string | null;  // null or undefined = user-level (global)
}

// Initialize credentials table
export function initCredentialsTable() {
  const db = getDb();

  // Check if table exists and has project_id column
  const tableInfo = db.exec("PRAGMA table_info(credentials)");
  const hasProjectId = tableInfo.length > 0 &&
    tableInfo[0].values.some((col: any) => col[1] === "project_id");

  if (!hasProjectId) {
    // Create or migrate table with project_id support
    db.run(`
      CREATE TABLE IF NOT EXISTS credentials_new (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        key TEXT NOT NULL,
        value_encrypted TEXT NOT NULL,
        project_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(provider, key, project_id)
      );
    `);

    // Migrate existing data if old table exists
    try {
      db.run(`
        INSERT OR IGNORE INTO credentials_new (id, provider, key, value_encrypted, project_id, created_at, updated_at)
        SELECT id, provider, key, value_encrypted, NULL, created_at, updated_at FROM credentials;
      `);
      db.run("DROP TABLE IF EXISTS credentials;");
    } catch (e) {
      // Old table doesn't exist, that's fine
    }

    db.run("ALTER TABLE credentials_new RENAME TO credentials;");
    db.run("CREATE INDEX IF NOT EXISTS idx_credentials_provider ON credentials(provider);");
    db.run("CREATE INDEX IF NOT EXISTS idx_credentials_project ON credentials(project_id);");
  }

  saveDb();
}

// Helper functions
function queryAll<T>(sql: string, params: any[] = []): T[] {
  const db = getDb();
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
  const db = getDb();
  db.run(sql, params);
  saveDb();
}

// Database row type
interface CredentialRow {
  id: string;
  provider: string;
  key: string;
  value_encrypted: string;
  project_id: string | null;
  created_at: number;
  updated_at: number;
}

// Generate unique ID for credential
function makeCredentialId(provider: string, key: string, projectId?: string | null): string {
  return projectId ? `${provider}:${key}:${projectId}` : `${provider}:${key}`;
}

/**
 * Set or update a credential for a provider
 * @param provider - Provider identifier (e.g., "slack", "discord", "openai")
 * @param key - Credential key (e.g., "apiKey", "botToken", "webhookUrl")
 * @param value - Plain text value to encrypt and store
 * @param scope - Optional scope (projectId for project-specific, omit for user-level)
 */
export function setCredential(
  provider: string,
  key: string,
  value: string,
  scope?: CredentialScope
): void {
  const encrypted = encrypt(value);
  const now = Date.now();
  const projectId = scope?.projectId || null;
  const id = makeCredentialId(provider, key, projectId);

  // Check for existing credential at this scope
  const existing = queryOne<CredentialRow>(
    projectId
      ? "SELECT id FROM credentials WHERE provider = ? AND key = ? AND project_id = ?"
      : "SELECT id FROM credentials WHERE provider = ? AND key = ? AND project_id IS NULL",
    projectId ? [provider, key, projectId] : [provider, key]
  );

  if (existing) {
    // Update existing credential
    run(
      projectId
        ? "UPDATE credentials SET value_encrypted = ?, updated_at = ? WHERE provider = ? AND key = ? AND project_id = ?"
        : "UPDATE credentials SET value_encrypted = ?, updated_at = ? WHERE provider = ? AND key = ? AND project_id IS NULL",
      projectId ? [encrypted, now, provider, key, projectId] : [encrypted, now, provider, key]
    );
  } else {
    // Insert new credential
    run(
      `INSERT INTO credentials (id, provider, key, value_encrypted, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, provider, key, encrypted, projectId, now, now]
    );
  }
}

/**
 * Get a single credential value for a provider
 * Lookup order: Project-specific → User-level fallback
 *
 * @param provider - Provider identifier
 * @param key - Credential key
 * @param scope - Optional scope (projectId to check project-specific first)
 * @returns Decrypted value or null if not found
 */
export function getCredential(
  provider: string,
  key: string,
  scope?: CredentialScope
): string | null {
  const projectId = scope?.projectId;

  // If project scope, first try project-specific
  if (projectId) {
    const projectRow = queryOne<CredentialRow>(
      "SELECT value_encrypted FROM credentials WHERE provider = ? AND key = ? AND project_id = ?",
      [provider, key, projectId]
    );

    if (projectRow) {
      try {
        return decrypt(projectRow.value_encrypted);
      } catch (e) {
        console.error(`Failed to decrypt project credential ${provider}:${key}:${projectId}:`, e);
      }
    }
  }

  // Fall back to user-level (global)
  const userRow = queryOne<CredentialRow>(
    "SELECT value_encrypted FROM credentials WHERE provider = ? AND key = ? AND project_id IS NULL",
    [provider, key]
  );

  if (!userRow) return null;

  try {
    return decrypt(userRow.value_encrypted);
  } catch (e) {
    console.error(`Failed to decrypt credential ${provider}:${key}:`, e);
    return null;
  }
}

/**
 * Get all credentials for a provider as a key-value map
 * Merges user-level with project-specific (project overrides user)
 *
 * @param provider - Provider identifier
 * @param scope - Optional scope (projectId to include project-specific)
 * @returns Object with credential keys mapped to decrypted values
 */
export function getCredentials(
  provider: string,
  scope?: CredentialScope
): Record<string, string> {
  const projectId = scope?.projectId;
  const result: Record<string, string> = {};

  // First, get user-level credentials
  const userRows = queryAll<CredentialRow>(
    "SELECT key, value_encrypted FROM credentials WHERE provider = ? AND project_id IS NULL",
    [provider]
  );

  for (const row of userRows) {
    try {
      result[row.key] = decrypt(row.value_encrypted);
    } catch (e) {
      console.error(`Failed to decrypt credential ${provider}:${row.key}:`, e);
    }
  }

  // Then, overlay project-specific credentials (these override user-level)
  if (projectId) {
    const projectRows = queryAll<CredentialRow>(
      "SELECT key, value_encrypted FROM credentials WHERE provider = ? AND project_id = ?",
      [provider, projectId]
    );

    for (const row of projectRows) {
      try {
        result[row.key] = decrypt(row.value_encrypted);
      } catch (e) {
        console.error(`Failed to decrypt project credential ${provider}:${row.key}:${projectId}:`, e);
      }
    }
  }

  return result;
}

/**
 * Delete a specific credential
 * @param provider - Provider identifier
 * @param key - Credential key
 * @param scope - Optional scope (projectId to delete project-specific only)
 */
export function deleteCredential(
  provider: string,
  key: string,
  scope?: CredentialScope
): void {
  const projectId = scope?.projectId;

  if (projectId) {
    run(
      "DELETE FROM credentials WHERE provider = ? AND key = ? AND project_id = ?",
      [provider, key, projectId]
    );
  } else {
    run(
      "DELETE FROM credentials WHERE provider = ? AND key = ? AND project_id IS NULL",
      [provider, key]
    );
  }
}

/**
 * Delete all credentials for a provider
 * @param provider - Provider identifier
 * @param scope - Optional scope (projectId to delete project-specific only, omit to delete user-level)
 */
export function deleteAllCredentials(
  provider: string,
  scope?: CredentialScope
): void {
  const projectId = scope?.projectId;

  if (projectId) {
    run("DELETE FROM credentials WHERE provider = ? AND project_id = ?", [provider, projectId]);
  } else {
    run("DELETE FROM credentials WHERE provider = ? AND project_id IS NULL", [provider]);
  }
}

/**
 * Delete ALL credentials for a provider (both user and project-level)
 * Use with caution!
 */
export function deleteAllCredentialsCompletely(provider: string): void {
  run("DELETE FROM credentials WHERE provider = ?", [provider]);
}

/**
 * Check if a provider has all required credentials
 * Checks both project-specific and user-level (merged)
 *
 * @param provider - Provider identifier
 * @param requiredKeys - Array of required credential keys
 * @param scope - Optional scope (projectId to include project-specific)
 * @returns true if all required credentials exist and can be decrypted
 */
export function hasRequiredCredentials(
  provider: string,
  requiredKeys: string[],
  scope?: CredentialScope
): boolean {
  if (requiredKeys.length === 0) return true;

  // Use getCredentials which handles merging
  const creds = getCredentials(provider, scope);
  const foundKeys = Object.keys(creds);

  // Check if all required keys are present
  return requiredKeys.every((key) => foundKeys.includes(key));
}

/**
 * List all providers that have credentials stored
 * @param scope - Optional scope (projectId to filter by project)
 * @returns Array of unique provider identifiers
 */
export function listProviders(scope?: CredentialScope): string[] {
  const projectId = scope?.projectId;

  if (projectId) {
    // List providers that have either user-level or project-specific creds
    const rows = queryAll<{ provider: string }>(
      "SELECT DISTINCT provider FROM credentials WHERE project_id IS NULL OR project_id = ? ORDER BY provider",
      [projectId]
    );
    return rows.map((r) => r.provider);
  }

  // Just user-level providers
  const rows = queryAll<{ provider: string }>(
    "SELECT DISTINCT provider FROM credentials WHERE project_id IS NULL ORDER BY provider"
  );
  return rows.map((r) => r.provider);
}

/**
 * Credential key info with scope information
 */
export interface CredentialKeyInfo {
  key: string;
  created_at: number;
  updated_at: number;
  scope: "user" | "project";
  project_id?: string;
}

/**
 * List all credential keys for a provider (metadata only, no values)
 * Shows both user-level and project-specific credentials
 *
 * @param provider - Provider identifier
 * @param scope - Optional scope (projectId to include project-specific)
 * @returns Array of credential keys with timestamps and scope info
 */
export function listCredentialKeys(
  provider: string,
  scope?: CredentialScope
): CredentialKeyInfo[] {
  const projectId = scope?.projectId;
  const result: CredentialKeyInfo[] = [];

  // Get user-level credentials
  const userRows = queryAll<{ key: string; created_at: number; updated_at: number }>(
    "SELECT key, created_at, updated_at FROM credentials WHERE provider = ? AND project_id IS NULL ORDER BY key",
    [provider]
  );

  for (const row of userRows) {
    result.push({
      key: row.key,
      created_at: row.created_at,
      updated_at: row.updated_at,
      scope: "user",
    });
  }

  // Get project-specific credentials
  if (projectId) {
    const projectRows = queryAll<{ key: string; created_at: number; updated_at: number }>(
      "SELECT key, created_at, updated_at FROM credentials WHERE provider = ? AND project_id = ? ORDER BY key",
      [provider, projectId]
    );

    for (const row of projectRows) {
      result.push({
        key: row.key,
        created_at: row.created_at,
        updated_at: row.updated_at,
        scope: "project",
        project_id: projectId,
      });
    }
  }

  return result;
}

/**
 * Check if a provider has project-specific credentials
 */
export function hasProjectCredentials(provider: string, projectId: string): boolean {
  const row = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM credentials WHERE provider = ? AND project_id = ?",
    [provider, projectId]
  );
  return (row?.count || 0) > 0;
}

/**
 * Check if a provider has user-level credentials
 */
export function hasUserCredentials(provider: string): boolean {
  const row = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM credentials WHERE provider = ? AND project_id IS NULL",
    [provider]
  );
  return (row?.count || 0) > 0;
}

/**
 * Export all credentials for backup (still encrypted)
 * WARNING: The encryption key is machine-specific, so these can only be restored on the same machine
 * @returns Array of encrypted credential records
 */
export function exportCredentials(): CredentialRow[] {
  return queryAll<CredentialRow>("SELECT * FROM credentials ORDER BY provider, key");
}

/**
 * Import credentials from backup (must be pre-encrypted)
 * @param credentials - Array of credential records to import
 */
export function importCredentials(credentials: CredentialRow[]): void {
  for (const cred of credentials) {
    run(
      `INSERT OR REPLACE INTO credentials (id, provider, key, value_encrypted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cred.id, cred.provider, cred.key, cred.value_encrypted, cred.created_at, cred.updated_at]
    );
  }
}
