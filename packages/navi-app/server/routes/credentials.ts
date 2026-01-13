/**
 * Credentials API Routes
 *
 * Handles encrypted storage and management of API keys and credentials.
 * Works alongside OAuth integrations for services that use API keys.
 *
 * Supports both user-level and project-scoped credentials:
 * - User-level: Apply to all projects (default)
 * - Project-scoped: Override user-level for specific projects
 *
 * Routes:
 * - GET    /api/credentials/providers          - List all providers with credential status
 * - GET    /api/credentials/:provider          - Get credential status for a provider
 * - POST   /api/credentials/:provider          - Set credentials for a provider
 * - DELETE /api/credentials/:provider          - Delete all credentials for a provider
 * - POST   /api/credentials/:provider/test     - Test if credentials work
 *
 * Query params:
 * - projectId: Optional project ID for project-scoped operations
 */

import { json, error } from "../utils/response";
import {
  getCredentials,
  setCredential,
  deleteAllCredentials,
  listCredentialKeys,
  hasUserCredentials,
  hasProjectCredentials,
  type CredentialScope,
} from "../integrations/credentials";
import {
  PROVIDERS,
  getProvider,
  validateCredentials,
  isOAuthProvider,
  isCredentiallessProvider,
  type IntegrationProvider,
} from "../integrations/registry";
import {
  getUnifiedStatus,
  getAllUnifiedStatuses,
  getGroupedStatuses,
  enableIntegration,
  disableIntegration,
  updateIntegrationSettings,
  resetProjectSettings,
  getToken,
} from "../services/integration-status";

// Helper to extract scope from URL
function getScopeFromUrl(url: URL): CredentialScope {
  const projectId = url.searchParams.get("projectId");
  return projectId ? { projectId } : {};
}

export async function handleCredentialsRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // ==========================================================================
  // Unified Integration Status (NEW)
  // ==========================================================================

  // GET /api/integrations/status - Get unified status for all integrations
  if (pathname === "/api/integrations/status" && method === "GET") {
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const grouped = url.searchParams.get("grouped") === "true";
    const includeDisabled = url.searchParams.get("includeDisabled") === "true";

    if (grouped) {
      const statuses = getGroupedStatuses({ projectId, includeDisabled });
      return json(statuses);
    }

    const statuses = getAllUnifiedStatuses({ projectId, includeDisabled });
    return json({ integrations: statuses });
  }

  // GET /api/integrations/:provider/status - Get status for single provider
  if (pathname.match(/^\/api\/integrations\/([^/]+)\/status$/) && method === "GET") {
    const providerId = pathname.split("/")[3];
    const projectId = url.searchParams.get("projectId") ?? undefined;

    const status = getUnifiedStatus(providerId, { projectId });
    if (!status) {
      return error(`Unknown provider: ${providerId}`, 404);
    }

    return json(status);
  }

  // POST /api/integrations/:provider/enable - Enable integration
  if (pathname.match(/^\/api\/integrations\/([^/]+)\/enable$/) && method === "POST") {
    const providerId = pathname.split("/")[3];
    const projectId = url.searchParams.get("projectId") ?? undefined;

    const body = await req.json().catch(() => ({}));
    const { mcpEnabled, skillEnabled } = body;

    const success = enableIntegration(providerId, {
      projectId,
      mcpEnabled,
      skillEnabled,
    });

    if (!success) {
      return error(`Unknown provider: ${providerId}`, 404);
    }

    return json({
      success: true,
      provider: providerId,
      enabled: true,
      scope: projectId ? "project" : "global",
    });
  }

  // POST /api/integrations/:provider/disable - Disable integration
  if (pathname.match(/^\/api\/integrations\/([^/]+)\/disable$/) && method === "POST") {
    const providerId = pathname.split("/")[3];
    const projectId = url.searchParams.get("projectId") ?? undefined;

    const success = disableIntegration(providerId, { projectId });

    if (!success) {
      return error(`Unknown provider: ${providerId}`, 404);
    }

    return json({
      success: true,
      provider: providerId,
      enabled: false,
      scope: projectId ? "project" : "global",
    });
  }

  // POST /api/integrations/:provider/settings - Update MCP/skill settings
  if (pathname.match(/^\/api\/integrations\/([^/]+)\/settings$/) && method === "POST") {
    const providerId = pathname.split("/")[3];
    const projectId = url.searchParams.get("projectId") ?? undefined;

    const body = await req.json().catch(() => ({}));
    const { enabled, mcpEnabled, skillEnabled } = body;

    const success = updateIntegrationSettings(
      providerId,
      { enabled, mcpEnabled, skillEnabled },
      projectId
    );

    if (!success) {
      return error(`Unknown provider: ${providerId}`, 404);
    }

    return json({
      success: true,
      provider: providerId,
      scope: projectId ? "project" : "global",
      settings: { enabled, mcpEnabled, skillEnabled },
    });
  }

  // DELETE /api/integrations/:provider/settings - Reset project settings
  if (pathname.match(/^\/api\/integrations\/([^/]+)\/settings$/) && method === "DELETE") {
    const providerId = pathname.split("/")[3];
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return error("projectId is required to reset project-specific settings", 400);
    }

    const success = resetProjectSettings(providerId, projectId);

    if (!success) {
      return error(`Unknown provider: ${providerId}`, 404);
    }

    return json({
      success: true,
      provider: providerId,
      message: "Project settings reset to global defaults",
    });
  }

  // ==========================================================================
  // Token Endpoint (for skills/custom integrations)
  // ==========================================================================

  // GET /api/credentials/:provider/token - Get API key/token for use
  if (pathname.match(/^\/api\/credentials\/([^/]+)\/token$/) && method === "GET") {
    const providerId = pathname.split("/")[3];
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const service = url.searchParams.get("service") ?? undefined;

    const provider = getProvider(providerId);
    if (!provider) {
      return error(`Unknown provider: ${providerId}`, 404);
    }

    // OAuth providers need special handling via /api/integrations/token
    if (provider.authType === "oauth") {
      return error(
        "OAuth providers require /api/integrations/token endpoint",
        400
      );
    }

    const token = getToken(providerId, { projectId, service });

    if (!token) {
      return error(
        `No credentials found or integration disabled for ${providerId}`,
        404
      );
    }

    return json({
      provider: providerId,
      type: token.type,
      value: token.value,
      expiresAt: token.expiresAt ?? null,
    });
  }

  // ==========================================================================
  // List all providers with credential status (existing)
  // ==========================================================================
  if (pathname === "/api/credentials/providers" && method === "GET") {
    const scope = getScopeFromUrl(url);
    const projectId = scope.projectId;

    const providers = Object.values(PROVIDERS).map((provider) => {
      const credentialKeys = listCredentialKeys(provider.id, scope);

      // Check both user and project credentials
      const hasUserCreds = hasUserCredentials(provider.id);
      const hasProjectCreds = projectId ? hasProjectCredentials(provider.id, projectId) : false;
      const hasCredentials = credentialKeys.length > 0;

      // Determine which credentials are set and their scope
      const credentialStatus = provider.credentials.map((field) => {
        const keyInfo = credentialKeys.find((k) => k.key === field.key);
        // Prefer project-scoped over user-scoped
        const projectKey = credentialKeys.find((k) => k.key === field.key && k.scope === "project");
        const userKey = credentialKeys.find((k) => k.key === field.key && k.scope === "user");

        return {
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required || false,
          isSet: !!keyInfo,
          scope: projectKey ? "project" : userKey ? "user" : null,
          hasUserLevel: !!userKey,
          hasProjectLevel: !!projectKey,
        };
      });

      return {
        id: provider.id,
        name: provider.name,
        color: provider.color,
        icon: provider.icon,
        credentials: provider.credentials,
        credentialStatus,
        hasCredentials,
        hasUserCredentials: hasUserCreds,
        hasProjectCredentials: hasProjectCreds,
        isOAuth: isOAuthProvider(provider.id),
        isCredentialless: isCredentiallessProvider(provider.id),
        available: provider.available,
        setupGuide: provider.setupGuide,
      };
    });

    return json(providers);
  }

  // ==========================================================================
  // Provider-specific routes
  // ==========================================================================
  const providerMatch = pathname.match(/^\/api\/credentials\/([^/]+)(\/.*)?$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const subpath = providerMatch[2] || "";
    const provider = getProvider(providerId);

    if (!provider) {
      return error(`Unknown provider: ${providerId}`, 400);
    }

    // ----------------------------------------------------------------------
    // GET /api/credentials/:provider - Get credential status
    // ----------------------------------------------------------------------
    if (subpath === "" && method === "GET") {
      const scope = getScopeFromUrl(url);
      const projectId = scope.projectId;
      const credentialKeys = listCredentialKeys(providerId, scope);
      const hasCredentials = credentialKeys.length > 0;

      const credentialStatus = provider.credentials.map((field) => {
        const projectKey = credentialKeys.find((k) => k.key === field.key && k.scope === "project");
        const userKey = credentialKeys.find((k) => k.key === field.key && k.scope === "user");
        const keyData = projectKey || userKey;

        return {
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required || false,
          isSet: !!keyData,
          scope: projectKey ? "project" : userKey ? "user" : null,
          hasUserLevel: !!userKey,
          hasProjectLevel: !!projectKey,
          updatedAt: keyData?.updated_at,
        };
      });

      return json({
        provider: providerId,
        name: provider.name,
        hasCredentials,
        hasUserCredentials: hasUserCredentials(providerId),
        hasProjectCredentials: projectId ? hasProjectCredentials(providerId, projectId) : false,
        credentialStatus,
      });
    }

    // ----------------------------------------------------------------------
    // POST /api/credentials/:provider - Set credentials
    // Body: { credentials: {...}, scope?: "user" | "project" }
    // Query: ?projectId=xxx (required if scope is "project")
    // ----------------------------------------------------------------------
    if (subpath === "" && method === "POST") {
      const body = await req.json();
      const { credentials, scope: requestedScope } = body;
      const urlScope = getScopeFromUrl(url);

      if (!credentials || typeof credentials !== "object") {
        return error("credentials object is required", 400);
      }

      // Determine scope: body.scope or URL projectId
      const isProjectScoped = requestedScope === "project" || !!urlScope.projectId;
      const projectId = urlScope.projectId;

      if (isProjectScoped && !projectId) {
        return error("projectId query parameter required for project-scoped credentials", 400);
      }

      const credScope: CredentialScope = isProjectScoped ? { projectId } : {};

      // Validate credentials
      const validation = validateCredentials(providerId, credentials);
      if (!validation.valid) {
        return error(validation.errors.join(", "), 400);
      }

      // Store each credential with scope
      for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === "string" && value.trim()) {
          setCredential(providerId, key, value.trim(), credScope);
        }
      }

      return json({
        success: true,
        provider: providerId,
        scope: isProjectScoped ? "project" : "user",
        projectId: isProjectScoped ? projectId : null,
        message: `Credentials saved for ${provider.name}${isProjectScoped ? " (project-specific)" : ""}`,
      });
    }

    // ----------------------------------------------------------------------
    // DELETE /api/credentials/:provider - Delete credentials
    // Query: ?projectId=xxx for project-specific, omit for user-level
    // ----------------------------------------------------------------------
    if (subpath === "" && method === "DELETE") {
      const scope = getScopeFromUrl(url);
      deleteAllCredentials(providerId, scope);

      const scopeLabel = scope.projectId ? "project-specific" : "user-level";
      return json({
        success: true,
        provider: providerId,
        scope: scope.projectId ? "project" : "user",
        message: `${scopeLabel} credentials deleted for ${provider.name}`,
      });
    }

    // ----------------------------------------------------------------------
    // POST /api/credentials/:provider/test - Test credentials
    // Query: ?projectId=xxx to test with project context (includes fallback)
    // ----------------------------------------------------------------------
    if (subpath === "/test" && method === "POST") {
      const scope = getScopeFromUrl(url);
      const credentials = getCredentials(providerId, scope);

      // Check if we have credentials
      if (Object.keys(credentials).length === 0) {
        return error("No credentials found for this provider", 400);
      }

      try {
        let testResult: { success: boolean; message: string };

        switch (providerId) {
          case "linear":
            testResult = await testLinearCredentials(credentials);
            break;

          case "notion":
            testResult = await testNotionCredentials(credentials);
            break;

          case "slack":
            testResult = await testSlackCredentials(credentials);
            break;

          case "github":
            testResult = await testGitHubCredentials(credentials);
            break;

          case "google":
            // Google uses OAuth, skip API test
            testResult = {
              success: false,
              message: "Google uses OAuth - please use the OAuth flow to connect",
            };
            break;

          default:
            return error(`Testing not implemented for ${providerId}`, 501);
        }

        if (testResult.success) {
          return json({
            success: true,
            provider: providerId,
            message: testResult.message,
          });
        } else {
          return error(testResult.message, 401);
        }
      } catch (err) {
        return error(`Test failed: ${err instanceof Error ? err.message : String(err)}`, 500);
      }
    }
  }

  return null;
}

// ============================================================================
// Credential Testing Functions
// ============================================================================

/**
 * Test Linear API key by fetching user info
 */
async function testLinearCredentials(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = credentials.apiKey;
  if (!apiKey) {
    return { success: false, message: "API key not found" };
  }

  try {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey,
      },
      body: JSON.stringify({
        query: "{ viewer { id name email } }",
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Linear API returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.errors) {
      return {
        success: false,
        message: `Linear API error: ${data.errors[0]?.message || "Unknown error"}`,
      };
    }

    if (data.data?.viewer) {
      return {
        success: true,
        message: `Connected as ${data.data.viewer.name || data.data.viewer.email}`,
      };
    }

    return { success: false, message: "Unexpected response from Linear API" };
  } catch (err) {
    return {
      success: false,
      message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Test Notion integration token by fetching user info
 */
async function testNotionCredentials(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const token = credentials.integrationToken;
  if (!token) {
    return { success: false, message: "Integration token not found" };
  }

  try {
    const response = await fetch("https://api.notion.com/v1/users/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Notion API returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.object === "user") {
      const name = data.name || data.id;
      return {
        success: true,
        message: `Connected as ${name}`,
      };
    }

    return { success: false, message: "Unexpected response from Notion API" };
  } catch (err) {
    return {
      success: false,
      message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Test Slack bot token by calling auth.test
 */
async function testSlackCredentials(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const botToken = credentials.botToken;
  if (!botToken) {
    return { success: false, message: "Bot token not found" };
  }

  try {
    const response = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Slack API returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.ok) {
      return {
        success: true,
        message: `Connected as ${data.user} (${data.team})`,
      };
    }

    return {
      success: false,
      message: `Slack API error: ${data.error || "Unknown error"}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Test GitHub CLI authentication
 */
async function testGitHubCredentials(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
  try {
    const { spawn } = await import("child_process");

    return new Promise((resolve) => {
      const proc = spawn("gh", ["auth", "status"]);
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        // gh auth status returns 0 if authenticated
        if (code === 0) {
          // Extract username from output if possible
          const match = (stdout + stderr).match(/Logged in to github\.com as ([\w-]+)/);
          const username = match ? match[1] : "authenticated user";
          resolve({
            success: true,
            message: `Connected as ${username}`,
          });
        } else {
          resolve({
            success: false,
            message: "GitHub CLI is not authenticated. Run 'gh auth login' in your terminal.",
          });
        }
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          message: `Failed to run gh CLI: ${err.message}. Is the GitHub CLI installed?`,
        });
      });
    });
  } catch (err) {
    return {
      success: false,
      message: `Error testing GitHub credentials: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
