/**
 * Integration Status Service
 *
 * Provides a unified view of all integrations (OAuth + API keys) with:
 * - Credential status (connected/not connected)
 * - Enable/disable state (per scope)
 * - Health status (healthy/degraded/failed)
 * - MCP/Skill availability
 */

import {
  getCredentials,
  getProviderStatus,
  getAllProviderStatuses,
  isProviderEnabled,
  enableProvider,
  disableProvider,
  recordProviderUsed,
  recordProviderError,
  type CredentialScope,
  type ProviderStatus as CredentialProviderStatus,
} from "../integrations/credentials";

import {
  integrations as oauthIntegrations,
  integrationStatus as healthStatus,
  integrationDefaults,
  type IntegrationHealthStatus,
  type IntegrationStatus as HealthStatusRecord,
  type IntegrationDefaults,
} from "../integrations/db";

import {
  PROVIDERS,
  getProvider,
  listProviders as listRegistryProviders,
  isOAuthProvider,
  isCredentiallessProvider,
  type IntegrationProvider,
  type AuthType,
} from "../integrations/registry";

// ============================================================================
// Types
// ============================================================================

export interface UnifiedIntegrationStatus {
  // Provider info
  provider: string;
  name: string;
  description?: string;
  authType: AuthType;
  icon: string;
  color: string;

  // Connection status
  connected: boolean;
  connectionDetails?: {
    accountLabel?: string;
    scope: "user" | "project" | null;
    lastUsedAt: number | null;
  };

  // Enable/disable status
  enabled: boolean;
  enabledGlobal: boolean;
  enabledProject: boolean | null;

  // Feature flags
  mcpEnabled: boolean;
  mcpAvailable: boolean;
  skillEnabled: boolean;
  skillAvailable: boolean;

  // Health status
  health: IntegrationHealthStatus;
  lastError: string | null;
  errorCount: number;

  // Setup
  setupGuide?: {
    description: string;
    steps: string[];
    capabilities: string[];
    examplePrompts?: string[];
  };
}

export interface IntegrationStatusOptions {
  projectId?: string;
  includeDisabled?: boolean;
  includeUnavailable?: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get unified status for a single provider
 */
export function getUnifiedStatus(
  providerId: string,
  options?: IntegrationStatusOptions
): UnifiedIntegrationStatus | null {
  const provider = getProvider(providerId);
  if (!provider) return null;

  const scope: CredentialScope = options?.projectId ? { projectId: options.projectId } : {};

  // Get credential status
  const credStatus = getProviderStatus(providerId, scope);

  // Get OAuth status (if applicable)
  const isOAuth = isOAuthProvider(providerId);
  let oauthConnected = false;
  let accountLabel: string | undefined;

  if (isOAuth) {
    const oauthList = oauthIntegrations.listByProvider(providerId as any);
    oauthConnected = oauthList.length > 0;
    if (oauthList.length > 0) {
      accountLabel = oauthList[0].account_label;
    }
  }

  // Determine connection status
  const connected = isOAuth
    ? oauthConnected
    : isCredentiallessProvider(providerId)
      ? true
      : credStatus.hasCredentials;

  // Get defaults (with project override)
  const defaults = integrationDefaults.get(providerId, options?.projectId);
  const globalDefaults = integrationDefaults.get(providerId, null);

  // Get health status
  const health = healthStatus.get(providerId, options?.projectId);

  // Determine if enabled
  const enabledGlobal = globalDefaults.enabled;
  const enabledProject = options?.projectId
    ? integrationDefaults.get(providerId, options.projectId).enabled
    : null;
  const enabled = enabledProject ?? enabledGlobal;

  return {
    provider: providerId,
    name: provider.name,
    description: provider.description,
    authType: provider.authType,
    icon: provider.icon,
    color: provider.color,

    connected,
    connectionDetails: connected
      ? {
          accountLabel: isOAuth ? accountLabel : undefined,
          scope: credStatus.credentialScope,
          lastUsedAt: credStatus.lastUsedAt,
        }
      : undefined,

    enabled,
    enabledGlobal,
    enabledProject,

    mcpEnabled: defaults.mcpEnabled,
    mcpAvailable: !!provider.mcp,
    skillEnabled: defaults.skillEnabled,
    skillAvailable: !!provider.skill?.usage,

    health: health?.status ?? "unknown",
    lastError: credStatus.lastError ?? health?.errorMessage ?? null,
    errorCount: credStatus.errorCount,

    setupGuide: provider.setupGuide,
  };
}

/**
 * Get unified status for all providers
 */
export function getAllUnifiedStatuses(
  options?: IntegrationStatusOptions
): UnifiedIntegrationStatus[] {
  const providers = listRegistryProviders();
  const statuses: UnifiedIntegrationStatus[] = [];

  for (const provider of providers) {
    if (!options?.includeUnavailable && provider.available === false) {
      continue;
    }

    const status = getUnifiedStatus(provider.id, options);
    if (!status) continue;

    if (!options?.includeDisabled && !status.enabled) {
      continue;
    }

    statuses.push(status);
  }

  return statuses;
}

/**
 * Get status grouped by state
 */
export function getGroupedStatuses(options?: IntegrationStatusOptions): {
  connected: UnifiedIntegrationStatus[];
  available: UnifiedIntegrationStatus[];
  disabled: UnifiedIntegrationStatus[];
} {
  const all = getAllUnifiedStatuses({
    ...options,
    includeDisabled: true,
    includeUnavailable: false,
  });

  return {
    connected: all.filter((s) => s.connected && s.enabled),
    available: all.filter((s) => !s.connected && s.enabled),
    disabled: all.filter((s) => !s.enabled),
  };
}

// ============================================================================
// Enable/Disable Functions
// ============================================================================

export function enableIntegration(
  providerId: string,
  options?: { projectId?: string; mcpEnabled?: boolean; skillEnabled?: boolean }
): boolean {
  const provider = getProvider(providerId);
  if (!provider) return false;

  integrationDefaults.set(
    providerId,
    {
      enabled: true,
      mcpEnabled: options?.mcpEnabled,
      skillEnabled: options?.skillEnabled,
    },
    options?.projectId
  );

  const scope = options?.projectId ? { projectId: options.projectId } : undefined;
  enableProvider(providerId, scope);

  return true;
}

export function disableIntegration(
  providerId: string,
  options?: { projectId?: string }
): boolean {
  const provider = getProvider(providerId);
  if (!provider) return false;

  integrationDefaults.set(
    providerId,
    { enabled: false },
    options?.projectId
  );

  const scope = options?.projectId ? { projectId: options.projectId } : undefined;
  disableProvider(providerId, scope);

  return true;
}

export function updateIntegrationSettings(
  providerId: string,
  settings: {
    enabled?: boolean;
    mcpEnabled?: boolean;
    skillEnabled?: boolean;
  },
  projectId?: string
): boolean {
  const provider = getProvider(providerId);
  if (!provider) return false;

  integrationDefaults.set(providerId, settings, projectId);
  return true;
}

export function resetProjectSettings(providerId: string, projectId: string): boolean {
  const provider = getProvider(providerId);
  if (!provider) return false;

  integrationDefaults.delete(providerId, projectId);
  return true;
}

// ============================================================================
// Health Functions
// ============================================================================

export function recordSuccess(providerId: string, projectId?: string): void {
  const scope = projectId ? { projectId } : undefined;
  recordProviderUsed(providerId, scope);
  healthStatus.recordSuccess(providerId, projectId);
}

export function recordError(
  providerId: string,
  errorMessage: string,
  projectId?: string
): void {
  const scope = projectId ? { projectId } : undefined;
  recordProviderError(providerId, errorMessage, scope);
  healthStatus.recordFailure(providerId, errorMessage, projectId);
}

export function getHealthStatus(
  providerId: string,
  projectId?: string
): IntegrationHealthStatus {
  const health = healthStatus.get(providerId, projectId);
  return health?.status ?? "unknown";
}

// ============================================================================
// MCP Availability Check
// ============================================================================

export function shouldLoadMCP(
  providerId: string,
  projectId?: string
): boolean {
  const status = getUnifiedStatus(providerId, { projectId });
  if (!status) return false;

  return (
    status.mcpAvailable &&
    status.connected &&
    status.enabled &&
    status.mcpEnabled
  );
}

export function getProvidersForMCP(projectId?: string): string[] {
  const providers = listRegistryProviders();
  return providers
    .filter((p) => shouldLoadMCP(p.id, projectId))
    .map((p) => p.id);
}

// ============================================================================
// Token/Credential Access for Skills
// ============================================================================

export function getToken(
  providerId: string,
  options?: { projectId?: string; service?: string }
): { type: "api_key" | "oauth"; value: string; expiresAt?: number } | null {
  const status = getUnifiedStatus(providerId, { projectId: options?.projectId });
  if (!status || !status.connected || !status.enabled) return null;

  const provider = getProvider(providerId);
  if (!provider) return null;

  // OAuth providers need special handling
  if (provider.authType === "oauth") {
    return null; // OAuth tokens need /api/integrations/token endpoint
  }

  // For API key providers
  const scope = options?.projectId ? { projectId: options.projectId } : undefined;
  const credentials = getCredentials(providerId, scope);

  const primaryCred = provider.credentials.find((c) => c.required);
  if (!primaryCred) return null;

  const value = credentials[primaryCred.key];
  if (!value) return null;

  return {
    type: "api_key",
    value,
    expiresAt: undefined,
  };
}
