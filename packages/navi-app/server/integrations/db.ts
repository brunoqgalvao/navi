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

  // OAuth integrations table
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

  // Integration status table (tracks health for both OAuth and API key integrations)
  db.run(`
    CREATE TABLE IF NOT EXISTS integration_status (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_check_at INTEGER,
      last_success_at INTEGER,
      error_message TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_status_provider ON integration_status(provider);
    CREATE INDEX IF NOT EXISTS idx_integration_status_status ON integration_status(status);
  `);

  // Integration defaults table (per-scope enable/disable for MCP, skill)
  db.run(`
    CREATE TABLE IF NOT EXISTS integration_defaults (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      project_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      mcp_enabled INTEGER NOT NULL DEFAULT 1,
      skill_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_defaults_provider ON integration_defaults(provider);
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

// ============================================================================
// Integration Status (Health Tracking)
// ============================================================================

export type IntegrationHealthStatus = "unknown" | "healthy" | "degraded" | "failed" | "disabled";

interface IntegrationStatusRow {
  id: string;
  provider: string;
  project_id: string | null;
  status: IntegrationHealthStatus;
  last_check_at: number | null;
  last_success_at: number | null;
  error_message: string | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

export interface IntegrationStatus {
  provider: string;
  projectId: string | null;
  status: IntegrationHealthStatus;
  lastCheckAt: number | null;
  lastSuccessAt: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
}

function makeStatusId(provider: string, projectId?: string | null): string {
  return projectId ? `${provider}:${projectId}` : `${provider}:global`;
}

export const integrationStatus = {
  /**
   * Get status for a provider
   */
  get: (provider: string, projectId?: string | null): IntegrationStatus | null => {
    const id = makeStatusId(provider, projectId);
    const row = queryOne<IntegrationStatusRow>(
      "SELECT * FROM integration_status WHERE id = ?",
      [id]
    );
    if (!row) return null;

    return {
      provider: row.provider,
      projectId: row.project_id,
      status: row.status,
      lastCheckAt: row.last_check_at,
      lastSuccessAt: row.last_success_at,
      errorMessage: row.error_message,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  },

  /**
   * Set/update status for a provider
   */
  set: (
    provider: string,
    status: IntegrationHealthStatus,
    options?: {
      projectId?: string | null;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    }
  ): void => {
    const projectId = options?.projectId ?? null;
    const id = makeStatusId(provider, projectId);
    const now = Date.now();

    const existing = queryOne<{ id: string }>(
      "SELECT id FROM integration_status WHERE id = ?",
      [id]
    );

    if (existing) {
      run(
        `UPDATE integration_status SET
          status = ?,
          last_check_at = ?,
          last_success_at = CASE WHEN ? = 'healthy' THEN ? ELSE last_success_at END,
          error_message = ?,
          metadata = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          status,
          now,
          status,
          now,
          options?.errorMessage ?? null,
          options?.metadata ? JSON.stringify(options.metadata) : null,
          now,
          id,
        ]
      );
    } else {
      run(
        `INSERT INTO integration_status (id, provider, project_id, status, last_check_at, last_success_at, error_message, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          provider,
          projectId,
          status,
          now,
          status === "healthy" ? now : null,
          options?.errorMessage ?? null,
          options?.metadata ? JSON.stringify(options.metadata) : null,
          now,
          now,
        ]
      );
    }
  },

  /**
   * Record a successful health check
   */
  recordSuccess: (provider: string, projectId?: string | null): void => {
    integrationStatus.set(provider, "healthy", { projectId });
  },

  /**
   * Record a failed health check
   */
  recordFailure: (provider: string, errorMessage: string, projectId?: string | null): void => {
    const current = integrationStatus.get(provider, projectId);
    const status: IntegrationHealthStatus =
      current?.status === "degraded" || current?.status === "failed" ? "failed" : "degraded";

    integrationStatus.set(provider, status, { projectId, errorMessage });
  },

  /**
   * List all statuses
   */
  list: (projectId?: string | null): IntegrationStatus[] => {
    let rows: IntegrationStatusRow[];
    if (projectId) {
      rows = queryAll<IntegrationStatusRow>(
        "SELECT * FROM integration_status WHERE project_id IS NULL OR project_id = ? ORDER BY provider",
        [projectId]
      );
    } else {
      rows = queryAll<IntegrationStatusRow>(
        "SELECT * FROM integration_status WHERE project_id IS NULL ORDER BY provider"
      );
    }

    return rows.map((row) => ({
      provider: row.provider,
      projectId: row.project_id,
      status: row.status,
      lastCheckAt: row.last_check_at,
      lastSuccessAt: row.last_success_at,
      errorMessage: row.error_message,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  },

  /**
   * Delete status for a provider
   */
  delete: (provider: string, projectId?: string | null): void => {
    const id = makeStatusId(provider, projectId);
    run("DELETE FROM integration_status WHERE id = ?", [id]);
  },
};

// ============================================================================
// Integration Defaults (Per-scope settings)
// ============================================================================

interface IntegrationDefaultsRow {
  id: string;
  provider: string;
  project_id: string | null;
  enabled: number;
  mcp_enabled: number;
  skill_enabled: number;
  created_at: number;
  updated_at: number;
}

export interface IntegrationDefaults {
  provider: string;
  projectId: string | null;
  enabled: boolean;
  mcpEnabled: boolean;
  skillEnabled: boolean;
}

function makeDefaultsId(provider: string, projectId?: string | null): string {
  return projectId ? `${provider}:${projectId}` : `${provider}:global`;
}

export const integrationDefaults = {
  /**
   * Get defaults for a provider (with fallback to global)
   */
  get: (provider: string, projectId?: string | null): IntegrationDefaults => {
    // First try project-specific
    if (projectId) {
      const projectRow = queryOne<IntegrationDefaultsRow>(
        "SELECT * FROM integration_defaults WHERE provider = ? AND project_id = ?",
        [provider, projectId]
      );
      if (projectRow) {
        return {
          provider: projectRow.provider,
          projectId: projectRow.project_id,
          enabled: projectRow.enabled === 1,
          mcpEnabled: projectRow.mcp_enabled === 1,
          skillEnabled: projectRow.skill_enabled === 1,
        };
      }
    }

    // Fall back to global
    const globalRow = queryOne<IntegrationDefaultsRow>(
      "SELECT * FROM integration_defaults WHERE provider = ? AND project_id IS NULL",
      [provider]
    );

    if (globalRow) {
      return {
        provider: globalRow.provider,
        projectId: globalRow.project_id,
        enabled: globalRow.enabled === 1,
        mcpEnabled: globalRow.mcp_enabled === 1,
        skillEnabled: globalRow.skill_enabled === 1,
      };
    }

    // Default values (enabled by default)
    return {
      provider,
      projectId: null,
      enabled: true,
      mcpEnabled: true,
      skillEnabled: true,
    };
  },

  /**
   * Set defaults for a provider
   */
  set: (
    provider: string,
    settings: {
      enabled?: boolean;
      mcpEnabled?: boolean;
      skillEnabled?: boolean;
    },
    projectId?: string | null
  ): void => {
    const id = makeDefaultsId(provider, projectId ?? null);
    const now = Date.now();

    const existing = queryOne<IntegrationDefaultsRow>(
      "SELECT * FROM integration_defaults WHERE id = ?",
      [id]
    );

    if (existing) {
      run(
        `UPDATE integration_defaults SET
          enabled = ?,
          mcp_enabled = ?,
          skill_enabled = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : existing.enabled,
          settings.mcpEnabled !== undefined ? (settings.mcpEnabled ? 1 : 0) : existing.mcp_enabled,
          settings.skillEnabled !== undefined ? (settings.skillEnabled ? 1 : 0) : existing.skill_enabled,
          now,
          id,
        ]
      );
    } else {
      run(
        `INSERT INTO integration_defaults (id, provider, project_id, enabled, mcp_enabled, skill_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          provider,
          projectId ?? null,
          settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : 1,
          settings.mcpEnabled !== undefined ? (settings.mcpEnabled ? 1 : 0) : 1,
          settings.skillEnabled !== undefined ? (settings.skillEnabled ? 1 : 0) : 1,
          now,
          now,
        ]
      );
    }
  },

  /**
   * Delete defaults for a provider (reverts to global/default)
   */
  delete: (provider: string, projectId?: string | null): void => {
    const id = makeDefaultsId(provider, projectId);
    run("DELETE FROM integration_defaults WHERE id = ?", [id]);
  },

  /**
   * List all defaults
   */
  list: (projectId?: string | null): IntegrationDefaults[] => {
    let rows: IntegrationDefaultsRow[];
    if (projectId) {
      rows = queryAll<IntegrationDefaultsRow>(
        "SELECT * FROM integration_defaults WHERE project_id IS NULL OR project_id = ? ORDER BY provider",
        [projectId]
      );
    } else {
      rows = queryAll<IntegrationDefaultsRow>(
        "SELECT * FROM integration_defaults WHERE project_id IS NULL ORDER BY provider"
      );
    }

    return rows.map((row) => ({
      provider: row.provider,
      projectId: row.project_id,
      enabled: row.enabled === 1,
      mcpEnabled: row.mcp_enabled === 1,
      skillEnabled: row.skill_enabled === 1,
    }));
  },
};
