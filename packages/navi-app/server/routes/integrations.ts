/**
 * Integrations API Routes
 *
 * Handles OAuth flows, token management, and integration CRUD.
 *
 * Routes:
 * - GET  /api/integrations                      - List all integrations
 * - GET  /api/integrations/:id                  - Get specific integration
 * - DELETE /api/integrations/:id                - Revoke and delete integration
 *
 * - GET  /api/integrations/providers            - List available providers
 * - GET  /api/integrations/credentials/:provider - Check if OAuth credentials configured
 * - POST /api/integrations/credentials/:provider - Set OAuth client credentials
 *
 * - GET  /api/integrations/oauth/start          - Start OAuth flow (returns auth URL)
 * - GET  /api/integrations/oauth/callback       - OAuth callback handler
 *
 * - POST /api/integrations/token                - Get valid token (for CLI/skills)
 */

import { json, error } from "../utils/response";
import {
  integrations,
  PROVIDERS,
  generateAuthUrl,
  validateState,
  exchangeCode,
  fetchUserInfo,
  getValidToken,
  revokeIntegration,
  getClientCredentials,
  setClientCredentials,
  encrypt,
  type IntegrationProvider,
  type IntegrationService,
  type Integration,
} from "../integrations";

export async function handleIntegrationsRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // ==========================================================================
  // List all integrations
  // ==========================================================================
  if (pathname === "/api/integrations" && method === "GET") {
    const all = integrations.list();

    // Return without encrypted tokens
    const safe = all.map((i) => ({
      id: i.id,
      provider: i.provider,
      account_id: i.account_id,
      account_label: i.account_label,
      services: i.services,
      scopes: i.scopes,
      expires_at: i.expires_at,
      has_refresh_token: !!i.refresh_token_encrypted,
      created_at: i.created_at,
      updated_at: i.updated_at,
      last_used_at: i.last_used_at,
    }));

    return json(safe);
  }

  // ==========================================================================
  // List available providers
  // ==========================================================================
  if (pathname === "/api/integrations/providers" && method === "GET") {
    const providers = Object.entries(PROVIDERS).map(([id, config]) => ({
      id,
      name: config.name,
      icon: config.icon,
      services: config.services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon,
      })),
      hasCredentials: !!getClientCredentials(id as IntegrationProvider),
    }));

    return json(providers);
  }

  // ==========================================================================
  // Check/Set OAuth credentials for a provider
  // ==========================================================================
  if (pathname.startsWith("/api/integrations/credentials/")) {
    const provider = pathname.split("/").pop() as IntegrationProvider;

    if (!PROVIDERS[provider]) {
      return error(`Unknown provider: ${provider}`, 400);
    }

    if (method === "GET") {
      const creds = getClientCredentials(provider);
      return json({
        provider,
        configured: !!creds,
        clientIdPreview: creds ? `${creds.clientId.slice(0, 8)}...` : null,
      });
    }

    if (method === "POST") {
      const body = await req.json();
      const { clientId, clientSecret } = body;

      if (!clientId || !clientSecret) {
        return error("clientId and clientSecret are required", 400);
      }

      setClientCredentials(provider, clientId, clientSecret);
      return json({ success: true, provider });
    }

    if (method === "DELETE") {
      // Remove credentials
      setClientCredentials(provider, "", "");
      return json({ success: true, provider });
    }
  }

  // ==========================================================================
  // Start OAuth flow
  // ==========================================================================
  if (pathname === "/api/integrations/oauth/start" && method === "GET") {
    const provider = url.searchParams.get("provider") as IntegrationProvider;
    const servicesParam = url.searchParams.get("services");

    if (!provider || !PROVIDERS[provider]) {
      return error("Invalid or missing provider", 400);
    }

    const services = servicesParam
      ? (servicesParam.split(",") as IntegrationService[])
      : PROVIDERS[provider].services.map((s) => s.id);

    // Build redirect URI (callback to our server)
    const baseUrl = url.origin || `http://localhost:${process.env.PORT || 3001}`;
    const redirectUri = `${baseUrl}/api/integrations/oauth/callback`;

    const result = generateAuthUrl(provider, services, redirectUri);
    if (!result) {
      return error(`OAuth not configured for ${provider}. Please set client credentials first.`, 400);
    }

    return json({
      authUrl: result.url,
      state: result.state,
    });
  }

  // ==========================================================================
  // OAuth callback
  // ==========================================================================
  if (pathname === "/api/integrations/oauth/callback" && method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      // User denied or error occurred
      const errorDesc = url.searchParams.get("error_description") || errorParam;
      return new Response(renderCallbackPage(false, errorDesc), {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (!code || !state) {
      return new Response(renderCallbackPage(false, "Missing code or state"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Validate state
    const storedState = validateState(state);
    if (!storedState) {
      return new Response(renderCallbackPage(false, "Invalid or expired state"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(storedState.provider, code, storedState.redirectUri);
    if (!tokens) {
      return new Response(renderCallbackPage(false, "Failed to exchange authorization code"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Fetch user info
    const userInfo = await fetchUserInfo(storedState.provider, tokens.access_token);
    if (!userInfo) {
      return new Response(renderCallbackPage(false, "Failed to fetch user info"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Check if integration already exists
    const existing = integrations.getByAccount(storedState.provider, userInfo.id);
    if (existing) {
      // Update existing integration
      integrations.updateTokens(
        existing.id,
        encrypt(tokens.access_token),
        tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        tokens.expires_at
      );

      // Merge services
      const allServices = new Set([...existing.services, ...storedState.services]);
      const allScopes = new Set([...existing.scopes, ...tokens.scope.split(" ")]);
      integrations.updateServices(existing.id, Array.from(allServices), Array.from(allScopes));

      return new Response(
        renderCallbackPage(true, `Updated ${storedState.provider} integration for ${userInfo.label}`),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Create new integration
    const now = Date.now();
    const integration: Integration = {
      id: crypto.randomUUID(),
      provider: storedState.provider,
      account_id: userInfo.id,
      account_label: userInfo.label,
      services: storedState.services,
      scopes: tokens.scope.split(" ").filter(Boolean),
      access_token_encrypted: encrypt(tokens.access_token),
      refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      expires_at: tokens.expires_at,
      created_at: now,
      updated_at: now,
    };

    integrations.create(integration);

    return new Response(
      renderCallbackPage(true, `Connected ${storedState.provider} for ${userInfo.label}`),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // ==========================================================================
  // Get specific integration
  // ==========================================================================
  const integrationMatch = pathname.match(/^\/api\/integrations\/([a-f0-9-]+)$/);
  if (integrationMatch && method === "GET") {
    const id = integrationMatch[1];
    const integration = integrations.get(id);

    if (!integration) {
      return error("Integration not found", 404);
    }

    return json({
      id: integration.id,
      provider: integration.provider,
      account_id: integration.account_id,
      account_label: integration.account_label,
      services: integration.services,
      scopes: integration.scopes,
      expires_at: integration.expires_at,
      has_refresh_token: !!integration.refresh_token_encrypted,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      last_used_at: integration.last_used_at,
    });
  }

  // ==========================================================================
  // Delete/revoke integration
  // ==========================================================================
  if (integrationMatch && method === "DELETE") {
    const id = integrationMatch[1];
    const integration = integrations.get(id);

    if (!integration) {
      return error("Integration not found", 404);
    }

    await revokeIntegration(integration);
    return json({ success: true });
  }

  // ==========================================================================
  // Get valid token (for CLI/skills) - POST for security
  // ==========================================================================
  if (pathname === "/api/integrations/token" && method === "POST") {
    const body = await req.json();
    const { provider, service, integrationId } = body;

    let integration: Integration | undefined;

    if (integrationId) {
      // Specific integration requested
      integration = integrations.get(integrationId);
    } else if (provider && service) {
      // Find by provider + service
      integration = integrations.findByService(provider, service);
    } else if (provider) {
      // Find any integration for provider
      const list = integrations.listByProvider(provider);
      integration = list[0];
    }

    if (!integration) {
      return error("No matching integration found", 404);
    }

    const token = await getValidToken(integration);
    if (!token) {
      return error("Failed to get valid token. Re-authentication may be required.", 401);
    }

    return json(token);
  }

  return null;
}

/**
 * Render a simple HTML page for OAuth callback
 * This is shown in the popup window after OAuth completes
 */
function renderCallbackPage(success: boolean, message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${success ? "Connected!" : "Error"}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0f0f0f;
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .message {
      font-size: 1.25rem;
      margin-bottom: 2rem;
      color: ${success ? "#22c55e" : "#ef4444"};
    }
    .hint {
      color: #888;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? "✓" : "✗"}</div>
    <div class="message">${message}</div>
    <div class="hint">You can close this window</div>
  </div>
  <script>
    // Notify parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'oauth-callback',
        success: ${success},
        message: ${JSON.stringify(message)}
      }, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`;
}
