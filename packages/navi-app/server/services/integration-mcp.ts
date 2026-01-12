/**
 * Integration MCP Bridge
 *
 * Bridges the integration registry with MCP server launching by:
 * - Checking if integrations have the required credentials
 * - Converting integration MCP configs into SDK-compatible MCP server configs
 * - Injecting credentials into MCP configurations
 *
 * Supports project-scoped credentials with fallback to user-level.
 *
 * This service allows agents to automatically get access to integration MCPs
 * when the user has configured credentials for them.
 */

import {
  getProvider,
  getMCPConfig,
  substituteCredentials,
  type IntegrationProvider,
  type MCPConfig as RegistryMCPConfig,
} from "../integrations/registry";
import {
  getCredentials,
  hasRequiredCredentials,
  type CredentialScope,
} from "../integrations/credentials";
import type { MCPServerConfig } from "./agent-loader";

// Re-export scope type for convenience
export type { CredentialScope } from "../integrations/credentials";

// ============================================================================
// Type Extensions
// ============================================================================

/**
 * Extended MCP server config that includes SSE support
 * Matches the SDK's McpSSEServerConfig type
 */
export type MCPServerConfigWithSSE = MCPServerConfig | {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if an integration has the required credentials to launch its MCP
 * @param providerId - Integration provider ID (e.g., "linear", "notion")
 * @param scope - Optional project scope for project-specific credentials
 * @returns true if provider exists, has MCP config, and has required credentials
 */
export function canLaunchMCP(providerId: string, scope?: CredentialScope): boolean {
  const provider = getProvider(providerId);
  if (!provider?.mcp) return false;

  // Check if credentials are configured
  const requiredKeys = provider.credentials
    .filter((c) => c.required)
    .map((c) => c.key);

  // If no credentials required, MCP is launchable
  if (requiredKeys.length === 0) return true;

  return hasRequiredCredentials(providerId, requiredKeys, scope);
}

/**
 * Get the MCP server config with credentials injected
 * Returns null if provider doesn't exist, has no MCP, or missing credentials
 *
 * @param providerId - Integration provider ID
 * @param scope - Optional project scope for project-specific credentials
 * @returns SDK-compatible MCP server config with credentials injected
 */
export function getMCPServerWithCredentials(
  providerId: string,
  scope?: CredentialScope
): MCPServerConfigWithSSE | null {
  const provider = getProvider(providerId);
  if (!provider?.mcp) return null;

  // Check if we can launch this MCP
  if (!canLaunchMCP(providerId, scope)) return null;

  // Get credentials (with project fallback to user-level)
  const credentials = getCredentials(providerId, scope);

  // Get MCP config with credentials substituted
  const mcpConfig = getMCPConfig(providerId, credentials);
  if (!mcpConfig) return null;

  // Convert registry MCP config to SDK MCP server config
  return convertToMCPServerConfig(mcpConfig);
}

/**
 * Get all available integration MCPs (those with credentials configured)
 * Returns a map of provider ID -> MCPServerConfig ready to be added to mcpServers
 *
 * @param scope - Optional project scope for project-specific credentials
 * @returns Record of provider IDs to SDK-compatible MCP server configs
 */
export function getAvailableIntegrationMCPs(
  scope?: CredentialScope
): Record<string, MCPServerConfigWithSSE> {
  const result: Record<string, MCPServerConfigWithSSE> = {};

  // Import the providers list from the registry
  const { PROVIDERS } = require("../integrations/registry");

  for (const [providerId, provider] of Object.entries(PROVIDERS) as [
    string,
    IntegrationProvider
  ][]) {
    // Skip if no MCP config
    if (!provider.mcp) continue;

    // Try to get MCP server config with credentials (scope-aware)
    const config = getMCPServerWithCredentials(providerId, scope);
    if (config) {
      result[providerId] = config;
    }
  }

  return result;
}

/**
 * Inject integration credentials into an existing MCP config
 * Useful when an agent defines an MCP that needs integration credentials
 * Replaces {{integration:provider:key}} placeholders
 *
 * @param config - MCP server config (possibly with placeholders)
 * @param scope - Optional project scope for credential lookup
 * @param providerOverrides - Optional credential overrides (for testing)
 * @returns MCP server config with credentials injected
 */
export function injectCredentialsIntoMCPConfig(
  config: MCPServerConfig,
  scope?: CredentialScope,
  providerOverrides?: Record<string, Record<string, string>>
): MCPServerConfig {
  // Only process if there are env vars with integration placeholders
  if (!config.env) return config;

  const newEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(config.env)) {
    // Check for {{integration:provider:key}} pattern
    const match = value.match(/\{\{integration:([^:]+):([^}]+)\}\}/);
    if (match) {
      const [, providerId, credKey] = match;

      // Get credentials from override or database (with scope support)
      const credentials = providerOverrides?.[providerId] || getCredentials(providerId, scope);
      const credValue = credentials[credKey];

      if (credValue) {
        // Replace the placeholder with the actual credential
        newEnv[key] = value.replace(match[0], credValue);
      } else {
        console.warn(
          `[integration-mcp] Missing credential for ${providerId}:${credKey}, keeping placeholder`
        );
        newEnv[key] = value;
      }
    } else {
      // No placeholder, keep as-is
      newEnv[key] = value;
    }
  }

  return {
    ...config,
    env: newEnv,
  };
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Convert registry MCP config to SDK MCP server config
 */
function convertToMCPServerConfig(
  registryConfig: RegistryMCPConfig
): MCPServerConfigWithSSE {
  // Handle SSE type
  if (registryConfig.sse) {
    // Extract headers from env if they look like headers
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(registryConfig.env)) {
      // Common header patterns
      if (
        key === "Authorization" ||
        key.startsWith("X-") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("key")
      ) {
        headers[key] = value;
      }
    }

    return {
      type: "sse",
      url: registryConfig.sse,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
  }

  // Handle package type (npx package)
  if (registryConfig.package) {
    return {
      command: "npx",
      args: ["-y", registryConfig.package, ...(registryConfig.args || [])],
      env: registryConfig.env,
    };
  }

  // Handle direct command type
  if (registryConfig.command) {
    return {
      command: registryConfig.command,
      args: registryConfig.args,
      env: registryConfig.env,
    };
  }

  // Shouldn't reach here, but fallback to a basic config
  console.warn("[integration-mcp] Unknown MCP config format:", registryConfig);
  return {
    command: "echo",
    args: ["Unknown MCP config"],
    env: {},
  };
}
