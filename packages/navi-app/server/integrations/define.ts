/**
 * Composable Integration Definition System
 *
 * Define integrations in ONE place with all their:
 * - OAuth config (scopes, endpoints)
 * - Tools (as SDK MCP tools)
 * - UI metadata (icon, name, description)
 *
 * The system automatically:
 * - Registers OAuth providers
 * - Creates MCP servers from tools
 * - Exposes integration status
 *
 * Usage:
 * ```ts
 * const google = defineIntegration({
 *   id: "google",
 *   name: "Google Workspace",
 *   icon: "🔷",
 *   oauth: { ... },
 *   tools: [
 *     defineTool("gmail_list", { ... }, async (args, ctx) => { ... }),
 *   ],
 * });
 * ```
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z, ZodRawShape } from "zod";
import { integrations, getValidToken, type Integration, type IntegrationProvider } from "./index";

// =============================================================================
// Types
// =============================================================================

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  /** Additional scopes organized by service (e.g., gmail, calendar) */
  serviceScopes?: Record<string, string[]>;
  /** How to fetch user info after OAuth (for account_id/label) */
  userInfoUrl?: string;
  userInfoParser?: (data: any) => { id: string; label: string };
}

export interface IntegrationToolContext {
  /** Get a valid access token (auto-refreshes if needed) */
  getToken: () => Promise<string | null>;
  /** Make an authenticated fetch to the provider's API */
  fetch: (url: string, options?: RequestInit) => Promise<{ data?: any; error?: string }>;
  /** The integration record (if connected) */
  integration: Integration | null;
}

export type IntegrationTool = {
  name: string;
  description: string;
  schema: ZodRawShape;
  handler: (args: any, ctx: IntegrationToolContext) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
};

export interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  oauth: OAuthConfig;
  /** Base URL for API calls (used by ctx.fetch) */
  apiBase: string;
  tools: IntegrationTool[];
}

export interface RegisteredIntegration extends IntegrationDefinition {
  /** The MCP server instance (created from tools) */
  mcpServer: ReturnType<typeof createSdkMcpServer>;
  /** Check if user has connected this integration */
  isConnected: () => boolean;
  /** Get context for tool execution */
  getContext: () => Promise<IntegrationToolContext>;
}

// =============================================================================
// Registry
// =============================================================================

const registeredIntegrations = new Map<string, RegisteredIntegration>();

// =============================================================================
// Helper: Define a tool with typed schema
// =============================================================================

export function defineTool<T extends ZodRawShape>(
  name: string,
  description: string,
  schema: T,
  handler: (args: z.infer<z.ZodObject<T>>, ctx: IntegrationToolContext) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>
): IntegrationTool {
  return {
    name,
    description,
    schema,
    handler: handler as any,
  };
}

// =============================================================================
// Main: Define an integration
// =============================================================================

export function defineIntegration(def: IntegrationDefinition): RegisteredIntegration {
  // Create context getter
  const getContext = async (): Promise<IntegrationToolContext> => {
    const list = integrations.listByProvider(def.id as IntegrationProvider);
    const integration = list[0] || null;

    const getToken = async (): Promise<string | null> => {
      if (!integration) return null;
      const tokenResponse = await getValidToken(integration);
      return tokenResponse?.access_token || null;
    };

    const apiFetch = async (
      url: string,
      options: RequestInit = {}
    ): Promise<{ data?: any; error?: string }> => {
      const token = await getToken();
      if (!token) {
        return {
          error: `Not authenticated with ${def.name}. Please connect your account in Settings → Integrations.`,
        };
      }

      const fullUrl = url.startsWith("http") ? url : `${def.apiBase}${url}`;

      try {
        const res = await fetch(fullUrl, {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        if (!res.ok) {
          const errorText = await res.text();
          let errorMessage = `${def.name} API error (${res.status})`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          return { error: errorMessage };
        }

        // Handle non-JSON responses
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          return { data };
        } else {
          const data = await res.text();
          return { data };
        }
      } catch (e: any) {
        return { error: `Request failed: ${e.message}` };
      }
    };

    return {
      getToken,
      fetch: apiFetch,
      integration,
    };
  };

  // Convert tools to SDK format and create MCP server
  const sdkTools = def.tools.map((t) =>
    tool(t.name, t.description, z.object(t.schema) as any, async (args) => {
      const ctx = await getContext();
      return t.handler(args, ctx);
    })
  );

  const mcpServer = createSdkMcpServer({
    name: def.id,
    version: "1.0.0",
    tools: sdkTools,
  });

  const registered: RegisteredIntegration = {
    ...def,
    mcpServer,
    isConnected: () => integrations.listByProvider(def.id as IntegrationProvider).length > 0,
    getContext,
  };

  registeredIntegrations.set(def.id, registered);
  return registered;
}

// =============================================================================
// Public API
// =============================================================================

/** Get all registered integrations */
export function getIntegrations(): RegisteredIntegration[] {
  return Array.from(registeredIntegrations.values());
}

/** Get a specific integration by ID */
export function getIntegration(id: string): RegisteredIntegration | undefined {
  return registeredIntegrations.get(id);
}

/** Get all connected integrations (user has OAuth'd) */
export function getConnectedIntegrations(): RegisteredIntegration[] {
  return getIntegrations().filter((i) => i.isConnected());
}

/** Get MCP servers for all connected integrations */
export function getIntegrationMcpServers(): Record<string, ReturnType<typeof createSdkMcpServer>> {
  const servers: Record<string, ReturnType<typeof createSdkMcpServer>> = {};
  for (const integration of getConnectedIntegrations()) {
    servers[integration.id] = integration.mcpServer;
  }
  return servers;
}

/** Get OAuth config for provider registration */
export function getIntegrationOAuthConfigs(): Record<string, OAuthConfig & { id: string; name: string; icon: string }> {
  const configs: Record<string, OAuthConfig & { id: string; name: string; icon: string }> = {};
  for (const integration of getIntegrations()) {
    configs[integration.id] = {
      ...integration.oauth,
      id: integration.id,
      name: integration.name,
      icon: integration.icon,
    };
  }
  return configs;
}
