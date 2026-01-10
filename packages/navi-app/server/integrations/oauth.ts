/**
 * OAuth Flow Handler
 *
 * Manages OAuth authorization flows for all providers.
 * Handles state generation, token exchange, and refresh.
 */

import { randomBytes } from "crypto";
import { globalSettings } from "../db";
import { encrypt, decrypt } from "./crypto";
import { integrations } from "./db";
import type {
  IntegrationProvider,
  IntegrationService,
  OAuthState,
  OAuthTokens,
  Integration,
  TokenResponse,
  PROVIDERS,
} from "./types";
import { PROVIDERS as ProviderConfigs, GOOGLE_SCOPES } from "./types";

// In-memory state storage (expires after 10 minutes)
const pendingStates = new Map<string, OAuthState>();

// Clean up old states periodically
setInterval(() => {
  const now = Date.now();
  pendingStates.forEach((state, nonce) => {
    if (now - state.timestamp > 10 * 60 * 1000) {
      pendingStates.delete(nonce);
    }
  });
}, 60 * 1000);

/**
 * Get OAuth client credentials from settings
 */
export function getClientCredentials(provider: IntegrationProvider): { clientId: string; clientSecret: string } | null {
  const clientId = globalSettings.get(`oauth_${provider}_client_id`);
  const clientSecret = globalSettings.get(`oauth_${provider}_client_secret`);

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

/**
 * Set OAuth client credentials
 */
export function setClientCredentials(
  provider: IntegrationProvider,
  clientId: string,
  clientSecret: string
): void {
  globalSettings.set(`oauth_${provider}_client_id`, clientId);
  globalSettings.set(`oauth_${provider}_client_secret`, clientSecret);
}

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(
  provider: IntegrationProvider,
  services: IntegrationService[],
  redirectUri: string
): { url: string; state: string } | null {
  const credentials = getClientCredentials(provider);
  if (!credentials) {
    console.error(`No OAuth credentials configured for ${provider}`);
    return null;
  }

  const config = ProviderConfigs[provider];
  const nonce = randomBytes(32).toString("hex");

  // Store state for validation
  const state: OAuthState = {
    provider,
    services,
    redirectUri,
    timestamp: Date.now(),
    nonce,
  };
  pendingStates.set(nonce, state);

  // Collect scopes for requested services
  const scopes = new Set<string>(config.defaultScopes);
  for (const serviceId of services) {
    const service = config.services.find((s) => s.id === serviceId);
    if (service) {
      service.scopes.forEach((scope) => scopes.add(scope));
    }
  }

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: Array.from(scopes).join(" "),
    state: nonce,
    access_type: "offline", // For refresh tokens (Google)
    prompt: "consent", // Force consent to get refresh token
  });

  return {
    url: `${config.authUrl}?${params.toString()}`,
    state: nonce,
  };
}

/**
 * Validate OAuth state from callback
 */
export function validateState(state: string): OAuthState | null {
  const stored = pendingStates.get(state);
  if (!stored) return null;

  // Remove used state
  pendingStates.delete(state);

  // Check expiration (10 minutes)
  if (Date.now() - stored.timestamp > 10 * 60 * 1000) {
    return null;
  }

  return stored;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(
  provider: IntegrationProvider,
  code: string,
  redirectUri: string
): Promise<OAuthTokens | null> {
  const credentials = getClientCredentials(provider);
  if (!credentials) return null;

  const config = ProviderConfigs[provider];

  try {
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Token exchange failed for ${provider}:`, error);
      return null;
    }

    const data = await response.json();

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
      token_type: data.token_type || "Bearer",
      scope: data.scope || "",
    };
  } catch (e) {
    console.error(`Token exchange error for ${provider}:`, e);
    return null;
  }
}

/**
 * Refresh an access token
 */
export async function refreshToken(integration: Integration): Promise<OAuthTokens | null> {
  if (!integration.refresh_token_encrypted) {
    console.error(`No refresh token for integration ${integration.id}`);
    return null;
  }

  const credentials = getClientCredentials(integration.provider);
  if (!credentials) return null;

  const config = ProviderConfigs[integration.provider];
  const refreshToken = decrypt(integration.refresh_token_encrypted);

  try {
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Token refresh failed for ${integration.provider}:`, error);
      return null;
    }

    const data = await response.json();

    const tokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // May or may not be returned
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
      token_type: data.token_type || "Bearer",
      scope: data.scope || integration.scopes.join(" "),
    };

    // Update stored tokens
    integrations.updateTokens(
      integration.id,
      encrypt(tokens.access_token),
      tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokens.expires_at
    );

    return tokens;
  } catch (e) {
    console.error(`Token refresh error for ${integration.provider}:`, e);
    return null;
  }
}

/**
 * Get a valid access token for an integration
 * Automatically refreshes if expired
 */
export async function getValidToken(integration: Integration): Promise<TokenResponse | null> {
  // Check if token is expired
  if (integrations.isExpired(integration)) {
    const newTokens = await refreshToken(integration);
    if (!newTokens) {
      return null;
    }

    // Return the new token
    return {
      access_token: newTokens.access_token,
      expires_at: newTokens.expires_at,
      account_id: integration.account_id,
      scopes: integration.scopes,
    };
  }

  // Token is still valid, decrypt and return
  try {
    const accessToken = decrypt(integration.access_token_encrypted);
    integrations.touch(integration.id);

    return {
      access_token: accessToken,
      expires_at: integration.expires_at,
      account_id: integration.account_id,
      scopes: integration.scopes,
    };
  } catch (e) {
    console.error(`Failed to decrypt token for integration ${integration.id}:`, e);
    return null;
  }
}

/**
 * Revoke integration (if provider supports it)
 */
export async function revokeIntegration(integration: Integration): Promise<boolean> {
  const config = ProviderConfigs[integration.provider];

  if (config.revokeUrl) {
    try {
      const accessToken = decrypt(integration.access_token_encrypted);
      const response = await fetch(`${config.revokeUrl}?token=${accessToken}`, {
        method: "POST",
      });

      if (!response.ok) {
        console.error(`Failed to revoke token for ${integration.provider}`);
      }
    } catch (e) {
      console.error(`Error revoking token:`, e);
    }
  }

  // Delete from database regardless
  integrations.delete(integration.id);
  return true;
}

/**
 * Fetch user info after OAuth (to get account ID)
 */
export async function fetchUserInfo(
  provider: IntegrationProvider,
  accessToken: string
): Promise<{ id: string; label: string } | null> {
  try {
    switch (provider) {
      case "google": {
        const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;
        const data = await response.json();
        return {
          id: data.email,
          label: data.name || data.email,
        };
      }

      case "github": {
        const response = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (!response.ok) return null;
        const data = await response.json();
        return {
          id: data.login,
          label: data.name || data.login,
        };
      }

      case "notion": {
        // Notion returns workspace info in the token response
        // We'd need to handle this differently
        return { id: "notion-workspace", label: "Notion Workspace" };
      }

      case "slack": {
        const response = await fetch("https://slack.com/api/auth.test", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data.ok) return null;
        return {
          id: data.user_id,
          label: data.user || data.user_id,
        };
      }

      default:
        return null;
    }
  } catch (e) {
    console.error(`Failed to fetch user info for ${provider}:`, e);
    return null;
  }
}
