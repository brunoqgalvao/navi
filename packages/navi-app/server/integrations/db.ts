/**
 * Integrations Database Operations
 *
 * Handles CRUD operations for OAuth integrations in SQLite.
 */

import { getDb, saveDb } from "../db";
import type { Integration, IntegrationProvider, IntegrationService } from "./types";
import { initCredentialsTable } from "./credentials";

// Initialize integrations table
export function initIntegrationsTable() {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_label TEXT NOT NULL,
      services TEXT NOT NULL,
      scopes TEXT NOT NULL,
      access_token_encrypted TEXT NOT NULL,
      refresh_token_encrypted TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER,
      UNIQUE(provider, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
  `);

  saveDb();

  // Also initialize credentials table for API keys
  initCredentialsTable();
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

// Raw database row type (JSON fields are strings)
interface IntegrationRow {
  id: string;
  provider: string;
  account_id: string;
  account_label: string;
  services: string; // JSON array
  scopes: string; // JSON array
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
}

// Convert row to Integration
function rowToIntegration(row: IntegrationRow): Integration {
  return {
    ...row,
    provider: row.provider as IntegrationProvider,
    services: JSON.parse(row.services) as IntegrationService[],
    scopes: JSON.parse(row.scopes) as string[],
    refresh_token_encrypted: row.refresh_token_encrypted ?? undefined,
    expires_at: row.expires_at ?? undefined,
    last_used_at: row.last_used_at ?? undefined,
  };
}

export const integrations = {
  /**
   * List all integrations
   */
  list: (): Integration[] => {
    const rows = queryAll<IntegrationRow>("SELECT * FROM integrations ORDER BY updated_at DESC");
    return rows.map(rowToIntegration);
  },

  /**
   * List integrations by provider
   */
  listByProvider: (provider: IntegrationProvider): Integration[] => {
    const rows = queryAll<IntegrationRow>(
      "SELECT * FROM integrations WHERE provider = ? ORDER BY updated_at DESC",
      [provider]
    );
    return rows.map(rowToIntegration);
  },

  /**
   * Get integration by ID
   */
  get: (id: string): Integration | undefined => {
    const row = queryOne<IntegrationRow>("SELECT * FROM integrations WHERE id = ?", [id]);
    return row ? rowToIntegration(row) : undefined;
  },

  /**
   * Get integration by provider and account
   */
  getByAccount: (provider: IntegrationProvider, accountId: string): Integration | undefined => {
    const row = queryOne<IntegrationRow>(
      "SELECT * FROM integrations WHERE provider = ? AND account_id = ?",
      [provider, accountId]
    );
    return row ? rowToIntegration(row) : undefined;
  },

  /**
   * Find integration that has a specific service enabled
   */
  findByService: (provider: IntegrationProvider, service: IntegrationService): Integration | undefined => {
    const allForProvider = integrations.listByProvider(provider);
    return allForProvider.find((i) => i.services.includes(service));
  },

  /**
   * Create a new integration
   */
  create: (integration: Integration): void => {
    run(
      `INSERT INTO integrations (
        id, provider, account_id, account_label, services, scopes,
        access_token_encrypted, refresh_token_encrypted, expires_at,
        created_at, updated_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        integration.id,
        integration.provider,
        integration.account_id,
        integration.account_label,
        JSON.stringify(integration.services),
        JSON.stringify(integration.scopes),
        integration.access_token_encrypted,
        integration.refresh_token_encrypted ?? null,
        integration.expires_at ?? null,
        integration.created_at,
        integration.updated_at,
        integration.last_used_at ?? null,
      ]
    );
  },

  /**
   * Update tokens (after refresh)
   */
  updateTokens: (
    id: string,
    accessTokenEncrypted: string,
    refreshTokenEncrypted?: string,
    expiresAt?: number
  ): void => {
    run(
      `UPDATE integrations SET
        access_token_encrypted = ?,
        refresh_token_encrypted = COALESCE(?, refresh_token_encrypted),
        expires_at = ?,
        updated_at = ?
      WHERE id = ?`,
      [accessTokenEncrypted, refreshTokenEncrypted ?? null, expiresAt ?? null, Date.now(), id]
    );
  },

  /**
   * Update services list
   */
  updateServices: (id: string, services: IntegrationService[], scopes: string[]): void => {
    run(
      `UPDATE integrations SET services = ?, scopes = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(services), JSON.stringify(scopes), Date.now(), id]
    );
  },

  /**
   * Mark integration as recently used
   */
  touch: (id: string): void => {
    run(`UPDATE integrations SET last_used_at = ?, updated_at = ? WHERE id = ?`, [
      Date.now(),
      Date.now(),
      id,
    ]);
  },

  /**
   * Delete an integration
   */
  delete: (id: string): void => {
    run("DELETE FROM integrations WHERE id = ?", [id]);
  },

  /**
   * Delete all integrations for a provider
   */
  deleteByProvider: (provider: IntegrationProvider): void => {
    run("DELETE FROM integrations WHERE provider = ?", [provider]);
  },

  /**
   * Check if token is expired (or will expire soon)
   */
  isExpired: (integration: Integration, bufferSeconds: number = 300): boolean => {
    if (!integration.expires_at) return false;
    const now = Math.floor(Date.now() / 1000);
    return integration.expires_at <= now + bufferSeconds;
  },
};
