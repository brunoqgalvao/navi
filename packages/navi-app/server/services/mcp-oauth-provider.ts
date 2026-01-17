/**
 * MCP OAuth Provider
 *
 * Implements the OAuthClientProvider interface for MCP servers that use OAuth 2.1.
 * Stores tokens and client info in ~/.mcp-auth/ to be compatible with Claude Code.
 *
 * This is used by SSE/HTTP MCP servers like Notion and Linear that use OAuth.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createHash, randomBytes } from "crypto";

// MCP Auth cache directory (same as Claude Code uses)
const MCP_AUTH_DIR = join(homedir(), ".mcp-auth");

// Ensure auth directory exists
function ensureAuthDir() {
  if (!existsSync(MCP_AUTH_DIR)) {
    mkdirSync(MCP_AUTH_DIR, { recursive: true });
  }
}

// Generate a safe filename from server URL
function getServerKey(serverUrl: string): string {
  const hash = createHash("sha256").update(serverUrl).digest("hex").slice(0, 16);
  const url = new URL(serverUrl);
  const safeName = url.hostname.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeName}_${hash}`;
}

// Token storage paths
function getTokenPath(serverUrl: string): string {
  return join(MCP_AUTH_DIR, `${getServerKey(serverUrl)}_tokens.json`);
}

function getClientInfoPath(serverUrl: string): string {
  return join(MCP_AUTH_DIR, `${getServerKey(serverUrl)}_client.json`);
}

function getCodeVerifierPath(serverUrl: string): string {
  return join(MCP_AUTH_DIR, `${getServerKey(serverUrl)}_pkce.json`);
}

// Token types (matching OAuth 2.1 spec)
export interface OAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  expires_at?: number; // We add this for tracking expiration
}

export interface OAuthClientInfo {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

// Callback URL for OAuth redirect
// In desktop apps, this is typically a localhost URL that the app listens on
// Claude Code uses http://127.0.0.1:PORT/oauth/callback
export const OAUTH_CALLBACK_PORT = 19192;
export const OAUTH_CALLBACK_URL = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}/oauth/callback`;

// Client metadata for dynamic registration
export interface OAuthClientMetadata {
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
}

// Pending OAuth state for in-progress flows
interface PendingOAuthState {
  codeVerifier: string;
  state: string;
  serverUrl: string;
  createdAt: number;
}

// In-memory store for pending OAuth flows (keyed by state)
const pendingOAuthFlows = new Map<string, PendingOAuthState>();

// Clean up old pending flows (>10 minutes old)
function cleanupOldFlows() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  pendingOAuthFlows.forEach((flow, state) => {
    if (now - flow.createdAt > maxAge) {
      pendingOAuthFlows.delete(state);
    }
  });
}

/**
 * Create an OAuth provider for an MCP server
 *
 * This implements the OAuthClientProvider interface expected by the MCP SDK.
 * The SDK uses this to:
 * 1. Get/save client info (from dynamic registration)
 * 2. Get/save tokens
 * 3. Get/save PKCE code verifier
 * 4. Trigger authorization redirect
 */
export function createMcpOAuthProvider(
  serverUrl: string,
  options: {
    clientName?: string;
    onAuthorizationUrl?: (url: URL) => void | Promise<void>;
  } = {}
) {
  const serverKey = getServerKey(serverUrl);

  // Default client metadata for dynamic registration
  const clientMetadata: OAuthClientMetadata = {
    redirect_uris: [OAUTH_CALLBACK_URL],
    token_endpoint_auth_method: "none", // Public client
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: options.clientName || "Navi",
    scope: "offline_access", // Request refresh tokens
  };

  return {
    // Required: OAuth client metadata for dynamic registration
    clientMetadata,

    // The redirect URL for OAuth callback
    redirectUrl: OAUTH_CALLBACK_URL,

    // Get stored client info (from dynamic registration)
    clientInformation: async (): Promise<OAuthClientInfo | undefined> => {
      const path = getClientInfoPath(serverUrl);
      try {
        if (existsSync(path)) {
          const data = JSON.parse(readFileSync(path, "utf-8"));
          return data;
        }
      } catch (e) {
        console.error(`[MCP OAuth] Failed to read client info for ${serverKey}:`, e);
      }
      return undefined;
    },

    // Save client info after dynamic registration
    saveClientInformation: async (info: OAuthClientInfo): Promise<void> => {
      ensureAuthDir();
      const path = getClientInfoPath(serverUrl);
      try {
        writeFileSync(path, JSON.stringify(info, null, 2));
        console.log(`[MCP OAuth] Saved client info for ${serverKey}`);
      } catch (e) {
        console.error(`[MCP OAuth] Failed to save client info for ${serverKey}:`, e);
        throw e;
      }
    },

    // Get stored tokens
    tokens: async (): Promise<OAuthTokens | undefined> => {
      const path = getTokenPath(serverUrl);
      try {
        if (existsSync(path)) {
          const data = JSON.parse(readFileSync(path, "utf-8"));

          // Check if token is expired
          if (data.expires_at && Date.now() > data.expires_at) {
            // Token expired, but we might have refresh_token
            if (data.refresh_token) {
              console.log(`[MCP OAuth] Access token expired for ${serverKey}, has refresh token`);
              return data; // Return anyway, SDK will use refresh_token
            }
            console.log(`[MCP OAuth] Token expired for ${serverKey}, no refresh token`);
            return undefined;
          }

          return data;
        }
      } catch (e) {
        console.error(`[MCP OAuth] Failed to read tokens for ${serverKey}:`, e);
      }
      return undefined;
    },

    // Save tokens after authorization
    saveTokens: async (tokens: OAuthTokens): Promise<void> => {
      ensureAuthDir();
      const path = getTokenPath(serverUrl);
      try {
        // Calculate expiration time
        const tokensWithExpiry = {
          ...tokens,
          expires_at: tokens.expires_in
            ? Date.now() + (tokens.expires_in * 1000)
            : undefined,
        };
        writeFileSync(path, JSON.stringify(tokensWithExpiry, null, 2));
        console.log(`[MCP OAuth] Saved tokens for ${serverKey}`);
      } catch (e) {
        console.error(`[MCP OAuth] Failed to save tokens for ${serverKey}:`, e);
        throw e;
      }
    },

    // Get PKCE code verifier
    codeVerifier: async (): Promise<string> => {
      const path = getCodeVerifierPath(serverUrl);
      try {
        if (existsSync(path)) {
          const data = JSON.parse(readFileSync(path, "utf-8"));
          return data.code_verifier;
        }
      } catch (e) {
        console.error(`[MCP OAuth] Failed to read code verifier for ${serverKey}:`, e);
      }
      throw new Error("No code verifier found");
    },

    // Save PKCE code verifier
    saveCodeVerifier: async (verifier: string): Promise<void> => {
      ensureAuthDir();
      const path = getCodeVerifierPath(serverUrl);
      try {
        writeFileSync(path, JSON.stringify({ code_verifier: verifier }));
        console.log(`[MCP OAuth] Saved code verifier for ${serverKey}`);
      } catch (e) {
        console.error(`[MCP OAuth] Failed to save code verifier for ${serverKey}:`, e);
        throw e;
      }
    },

    // Generate state for CSRF protection
    state: async (): Promise<string> => {
      return randomBytes(32).toString("hex");
    },

    // Called when authorization is needed - opens browser
    redirectToAuthorization: async (url: URL): Promise<void> => {
      console.log(`[MCP OAuth] Authorization required for ${serverKey}`);
      console.log(`[MCP OAuth] Authorization URL: ${url.toString()}`);

      // Call custom handler if provided
      if (options.onAuthorizationUrl) {
        await options.onAuthorizationUrl(url);
      } else {
        // Default: open in system browser
        const { exec } = await import("child_process");
        const openCommand = process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";

        exec(`${openCommand} "${url.toString()}"`, (err) => {
          if (err) {
            console.error(`[MCP OAuth] Failed to open browser:`, err);
          }
        });
      }
    },

    // Invalidate stored credentials
    invalidateCredentials: async (type: "all" | "tokens"): Promise<void> => {
      if (type === "all") {
        // Delete client info too
        const clientPath = getClientInfoPath(serverUrl);
        if (existsSync(clientPath)) {
          unlinkSync(clientPath);
        }
      }

      // Delete tokens
      const tokenPath = getTokenPath(serverUrl);
      if (existsSync(tokenPath)) {
        unlinkSync(tokenPath);
      }

      // Delete code verifier
      const verifierPath = getCodeVerifierPath(serverUrl);
      if (existsSync(verifierPath)) {
        unlinkSync(verifierPath);
      }

      console.log(`[MCP OAuth] Invalidated ${type} credentials for ${serverKey}`);
    },
  };
}

/**
 * Check if an MCP server has valid OAuth tokens
 */
export function hasValidTokens(serverUrl: string): boolean {
  const path = getTokenPath(serverUrl);
  try {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, "utf-8"));

      // Check expiration
      if (data.expires_at && Date.now() > data.expires_at) {
        // Expired, but check for refresh token
        return !!data.refresh_token;
      }

      return !!data.access_token;
    }
  } catch (e) {
    console.error(`[MCP OAuth] Error checking tokens:`, e);
  }
  return false;
}

/**
 * Check if an MCP server has registered client info
 */
export function hasClientInfo(serverUrl: string): boolean {
  const path = getClientInfoPath(serverUrl);
  try {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      return !!data.client_id;
    }
  } catch (e) {
    console.error(`[MCP OAuth] Error checking client info:`, e);
  }
  return false;
}

/**
 * Get authentication status for an MCP server
 */
export interface McpAuthStatus {
  hasTokens: boolean;
  hasClientInfo: boolean;
  isAuthenticated: boolean;
  needsAuth: boolean;
  tokensExpired: boolean;
  hasRefreshToken: boolean;
}

export function getMcpAuthStatus(serverUrl: string): McpAuthStatus {
  const tokenPath = getTokenPath(serverUrl);
  const clientPath = getClientInfoPath(serverUrl);

  let hasTokens = false;
  let tokensExpired = false;
  let hasRefreshToken = false;

  try {
    if (existsSync(tokenPath)) {
      const data = JSON.parse(readFileSync(tokenPath, "utf-8"));
      hasTokens = !!data.access_token;
      hasRefreshToken = !!data.refresh_token;

      if (data.expires_at && Date.now() > data.expires_at) {
        tokensExpired = true;
      }
    }
  } catch (e) {
    // Ignore
  }

  let hasClientInfoData = false;
  try {
    if (existsSync(clientPath)) {
      const data = JSON.parse(readFileSync(clientPath, "utf-8"));
      hasClientInfoData = !!data.client_id;
    }
  } catch (e) {
    // Ignore
  }

  const isAuthenticated = hasTokens && (!tokensExpired || hasRefreshToken);

  return {
    hasTokens,
    hasClientInfo: hasClientInfoData,
    isAuthenticated,
    needsAuth: !isAuthenticated,
    tokensExpired,
    hasRefreshToken,
  };
}

/**
 * Clear all stored OAuth data for an MCP server
 */
export function clearMcpAuth(serverUrl: string): void {
  const tokenPath = getTokenPath(serverUrl);
  const clientPath = getClientInfoPath(serverUrl);
  const verifierPath = getCodeVerifierPath(serverUrl);

  for (const path of [tokenPath, clientPath, verifierPath]) {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  console.log(`[MCP OAuth] Cleared auth for ${getServerKey(serverUrl)}`);
}

/**
 * Start OAuth callback server
 *
 * This starts a temporary HTTP server to receive the OAuth callback.
 * Returns a promise that resolves with the authorization code.
 */
export async function startOAuthCallbackServer(): Promise<{ code: string; state: string }> {
  const { createServer } = await import("http");

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`);

      if (url.pathname === "/oauth/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1 style="color: #ef4444;">Authorization Failed</h1>
                  <p>${errorDescription || error}</p>
                  <p>You can close this window.</p>
                </div>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(errorDescription || error));
          return;
        }

        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1 style="color: #10b981;">Authorization Successful!</h1>
                  <p>You can close this window and return to Navi.</p>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </div>
              </body>
            </html>
          `);
          server.close();
          resolve({ code, state });
          return;
        }

        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing code or state");
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });

    server.on("error", (err) => {
      reject(err);
    });

    // Set timeout
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timeout"));
    }, 5 * 60 * 1000); // 5 minutes

    server.listen(OAUTH_CALLBACK_PORT, "127.0.0.1", () => {
      console.log(`[MCP OAuth] Callback server listening on port ${OAUTH_CALLBACK_PORT}`);
    });
  });
}

/**
 * Trigger MCP OAuth flow for a server
 *
 * This is a high-level function that:
 * 1. Creates the OAuth provider
 * 2. Starts the callback server
 * 3. Opens the browser for authorization
 * 4. Waits for the callback
 * 5. Exchanges the code for tokens
 */
export async function triggerMcpOAuth(serverUrl: string): Promise<void> {
  console.log(`[MCP OAuth] Starting OAuth flow for ${serverUrl}`);

  // This is handled by the SDK when connecting to the MCP server
  // We just need to ensure the authProvider is passed to the transport
  // The flow is:
  // 1. SDK connects to MCP server
  // 2. Server returns 401
  // 3. SDK calls authProvider.redirectToAuthorization()
  // 4. User completes auth in browser
  // 5. Browser redirects to callback URL with code
  // 6. We need to handle the callback and call finishAuth()

  throw new Error("Use connectMcpWithOAuth() instead for full OAuth flow");
}
