# OAuth Integration Research: Building Seamless "Connect in One Click" for MCP Servers

**Research Date:** January 12, 2026
**Purpose:** Design a system where users can click "Connect Linear" in Navi Settings and it just works - abstracting OAuth complexity for MCP servers.

---

## Executive Summary

After analyzing how Zapier, Make, Composio, Pipedream, and Nango handle OAuth integrations, several clear patterns emerge for building a seamless connection experience:

**Key Insights:**
1. **Brokered Credentials Pattern** - The LLM/agent never sees tokens, only the platform does
2. **Localhost Server + Browser Flow** - Best practice for desktop apps (Tauri/Electron)
3. **Unified API Layer** - Abstract provider differences behind consistent interface
4. **Automatic Token Refresh** - Handle refresh transparently with proper locking
5. **Connection Registry** - Central database of available integrations with metadata

---

## 1. Industry Leaders: How They Solve OAuth

### 1.1 Zapier - The Gold Standard (8,000+ apps)

**Architecture:**
- Users see familiar OAuth consent screens from the provider (not Zapier's login)
- Authorization Code flow with PKCE enabled by default
- Zapier handles token refresh automatically in background
- **Key UX Decision:** Zapier branding stays visible - builds trust, users know flow

**Implementation Details:**
- Default params: `client_id`, `state`, `redirect_uri`, `response_type=code`
- Redirect URI: `https://zapier.com/oauth/callback`
- Token storage: Encrypted per-user, automatically refreshed
- Refresh strategy: Automatic refresh on 401 errors + proactive refresh before expiry

**Why It Works:**
> "Zapier removes the pain of authentication and maintenance. With 8,000 apps already connected, they handle OAuth apps, token refreshes, security reviews, and partner agreements."

**Sources:**
- [Add authentication with OAuth v2 - Zapier](https://docs.zapier.com/platform/build/oauth)
- [Solving for end-user authentication | Zapier](https://zapier.com/blog/solving-end-user-auth/)
- [Authentication for Great Apps - The Zapier Engineering Blog](https://zapier.com/engineering/api-authentication/)

---

### 1.2 Make (Integromat) - Connection Management Patterns

**Architecture:**
- Fixed redirect URI: `https://www.integromat.com/oauth/cb/oauth2`
- OAuth2 connection handles token exchange automatically
- Supports custom app OAuth clients for granular scope control

**Connection Structure:**
```typescript
{
  preauthorize: RequestSpec,    // Optional pre-auth step
  authorize: RequestSpec,        // User authorization
  token: RequestSpec,           // Token exchange
  info: RequestSpec,            // Get user info
  refresh: RequestSpec,         // Token refresh
  invalidate: RequestSpec       // Revoke/logout
}
```

**Token Management Challenge:**
- **Problem:** OAuth tokens timeout after ~2 weeks of inactivity
- **Solution:** Users run scheduled "keep-alive" requests (not ideal)
- **Better Solution:** Proactive token refresh before expiry

**Error Handling:**
- `RuntimeError` - Execution interrupted, rolled back
- `RateLimitError` - Applies delay to next execution
- `InvalidAccessTokenError` - Token-specific problem

**Sources:**
- [How to connect Make to any web service that uses OAuth2](https://www.make.com/en/help/tutorials/how-to-connect-make-to-any-web-service-that-uses-oauth2-authorization)
- [OAuth 2.0 Connection - Reference Documentation](https://integromat.github.io/apps/account.oauth2.html)
- [OAuth 2.0 | Custom Apps Documentation](https://developers.make.com/custom-apps-documentation/app-components/connections/oauth2)

---

### 1.3 Composio - AI Agent OAuth Specialist

**Key Innovation: Brokered Credentials Pattern**

> "The best way to prevent credential leakage is with a pattern called Brokered Credentials. In this pattern the LLM never actually sees the API key or token. Instead a secure service like Composio makes the API call on the agent's behalf. This completely removes the risk of a token leaking through a prompt."

**Architecture:**
```
User → AgentAuth → OAuth Flow → Composio Platform → API Request
                                        ↓
                                    (Token Storage)
                                        ↓
                                    Agent never sees token
```

**Features:**
- **AgentAuth:** OAuth, API keys, JWT - automatic token refresh
- **250+ Tools:** Pre-configured OAuth apps with scopes
- **MCP Gateway:** Centralized control plane for agent-tool interactions
- **Unified API:** `tasks.create` maps to Jira/Asana/Trello automatically
- **SOC 2 Compliant:** Enterprise-grade security

**Three Pillars of Production Infrastructure:**
1. **Secure Authentication** - Brokered credentials, PKCE, no token exposure
2. **Granular Control** - Scope management, rate limiting, audit trails
3. **Reliable Action** - Request proxying, retry logic, error handling

**Why This Matters for MCP Servers:**
- MCP servers can act as OAuth Resource Servers
- MCP Gateway discovers available tools dynamically
- Agent frameworks (LangChain, CrewAI) invoke tools without seeing credentials

**Sources:**
- [From Auth to Action: The Complete Guide to Secure & Scalable AI Agent Infrastructure](https://composio.dev/blog/secure-ai-agent-infrastructure-guide)
- [AgentAuth: Seamless Authentication for AI Agents with 250+ Tools](https://composio.dev/blog/agentauth-seamless-authentication-for-ai-agents-with-250-tools)
- [MCP Gateways: A Developer's Guide to AI Agent Architecture in 2026](https://composio.dev/blog/mcp-gateways-guide)

---

### 1.4 Pipedream - Developer-First OAuth

**Connect Platform Overview:**

**Three Parties:**
1. **Developer:** You (building Navi) - wants to integrate on behalf of users
2. **End User:** Bruno - whose data we access
3. **OAuth Provider:** Linear, GitHub, Google, etc.

**Key Features:**
- **Managed OAuth:** Flow and token refresh fully handled
- **Custom OAuth Clients:** Bring your own client ID/secret for custom scopes
- **MCP Server Support:** Expose integrations as tools to LLMs
- **SDK Options:** REST API, TypeScript, Python

**Authentication Flow:**
```typescript
// Pipedream abstracts away token management
const token = await pipedream.getConnection('linear', userId);
// Token refresh happens automatically under the hood
```

**Pricing:** Free in development mode, paid in production

**Why It's Great for Developers:**
> "Pipedream abstracts away the complexity of managing tokens, refresh flows, and user-level permissions, so agents can act on behalf of users across tools without custom auth plumbing."

**Sources:**
- [Overview - Pipedream](https://pipedream.com/docs/connect)
- [Pipedream Connect](https://pipedream.com/connect)
- [Bring your own OAuth clients](https://pipedream.com/blog/bring-your-own-oauth-clients/)

---

### 1.5 Nango - Open Source OAuth Provider

**Value Proposition:**
- **Open Source:** Self-host for free (limited features) or use cloud
- **500+ APIs:** Pre-configured OAuth apps
- **Unified API:** Single interface for all integrations
- **MCP Server Support:** AI tool calling built-in

**Architecture:**
```
Application → Nango SDK → Nango Server (Middleware) → OAuth Provider
                              ↓
                      (Token Storage + Refresh)
```

**How It Works:**
1. **providers.yaml:** All API metadata (auth_mode, authorization_url, token_url, proxy base_url)
2. **Nango Server:** Acts as middleman for authorization and data fetching
3. **Credential Management:** Retrieval, storage, and refreshing
4. **Request Proxying:** Injects credentials into API requests seamlessly

**Features:**
- Embedded, white-label auth UI
- Credential monitoring (webhooks on invalidation)
- Data syncing (continuous sync from APIs)
- Webhooks with universal interface
- Observability dashboard

**Licensing:** Elastic License - free self-host with limited features, paid for full access

**Why It Was Built:**
> "Despite OAuth being a standard protocol in theory, it remains a major burden to implement it, even with the help of a library."

**Sources:**
- [GitHub - NangoHQ/nango: A single API for all your integrations](https://github.com/NangoHQ/nango)
- [Nango: The open-source unified API](https://docs.nango.dev/)
- [Easy OAuth for 400+ APIs | Nango](https://nango.dev/auth)

---

## 2. MCP Server OAuth Integration Patterns

### 2.1 MCP Authorization Specification

**Key Concept:** MCP servers are now officially **OAuth 2.1 Resource Servers**

**Architecture Roles:**
- **Authorization Server:** The "token factory" - issues access tokens
- **Resource Server:** The MCP server - validates tokens and serves protected resources
- **Client:** MCP client (Navi) - makes requests on behalf of user

**OAuth Flow in MCP:**
```
1. Agent → GET /todos → MCP Server
2. MCP Server → 401 Unauthorized (WWW-Authenticate: Bearer)
3. Agent initiates OAuth flow
4. Authorization Server → User consent
5. User approves
6. Authorization Server → Access token
7. Agent → GET /todos (with token) → MCP Server
8. MCP Server → Validates token → Returns data
```

### 2.2 Discovery Mechanisms

MCP servers MUST implement one of:

**1. WWW-Authenticate Header:**
```http
WWW-Authenticate: Bearer resource_metadata="https://api.example.com/.well-known/oauth-authorization-server"
```

**2. OAuth 2.0 Authorization Server Metadata (RFC 8414):**
```json
GET /.well-known/oauth-authorization-server
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/token",
  "scopes_supported": ["read", "write"]
}
```

### 2.3 PKCE (Proof Key for Code Exchange)

**Why It's Critical for MCP:**
> "PKCE is especially critical in MCP contexts where many clients, such as agents, containers, or serverless functions, are deployed in environments where storing secrets securely is difficult or infeasible."

**How It Works:**
1. Client generates random `code_verifier`
2. Client computes `code_challenge = SHA256(code_verifier)`
3. Authorization request includes `code_challenge`
4. Token exchange includes `code_verifier`
5. Server validates: `SHA256(code_verifier) == code_challenge`

**Benefit:** Public clients (desktop apps) can use authorization code flow securely without client secret

### 2.4 Scope Selection (Principle of Least Privilege)

MCP clients SHOULD request only necessary scopes:

**Priority Order:**
1. Use `scope` parameter from WWW-Authenticate header (server-suggested)
2. Use scopes from MCP tool definitions
3. Request minimal required scopes

### 2.5 Integration Options for Navi

**Option 1: Direct OAuth Provider Integration**
- Navi acts as OAuth client
- Redirects to GitHub/Linear/Google for authorization
- Receives callback with authorization code
- Exchanges for access token
- Stores encrypted token

**Option 2: Third-Party OAuth Provider Integration**
- Use Stytch, Auth0, WorkOS as broker
- MCP Server generates its own token for MCP client
- Provider handles actual OAuth flow

**Option 3: Navi as OAuth Provider (Advanced)**
- Navi implements OAuth 2.1 authorization server
- MCP servers trust Navi as IdP
- Navi issues tokens on behalf of user

**Sources:**
- [Authorization - Model Context Protocol](https://modelcontextprotocol.io/specification/draft/basic/authorization/)
- [Example Securing AI Agent Access with OAuth in MCP](https://stytch.com/blog/oauth-for-mcp-explained-with-a-real-world-example/)
- [Let's fix OAuth in MCP • Aaron Parecki](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol)
- [MCP, OAuth 2.1, PKCE, and the Future of AI Authorization](https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/)

---

## 3. Token Refresh Best Practices

### 3.1 Automatic Retry on 401 Errors

**Pattern:**
```typescript
async function apiRequest(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    // Invalidate cached token
    const newToken = await refreshToken(token.refresh_token);
    // Retry with new token
    return apiRequest(url, newToken);
  }

  return response;
}
```

**Key Insight:**
> "When an API request fails with a 401 error, the best practice is to invalidate the cache and retry with a fresh token."

### 3.2 Proactive Token Refresh

**Strategy:** Refresh tokens a few minutes before they expire

**Why:**
- Account for clock drift between servers
- Prevent refresh token expiration
- Avoid user-facing auth errors

**Implementation:**
```typescript
const REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes

if (token.expires_at - Date.now() < REFRESH_BUFFER) {
  token = await refreshToken(token.refresh_token);
}
```

### 3.3 Token Rotation Security

**Best Practice:** Issue new refresh token each time one is used

**Benefits:**
- Detects stolen refresh tokens (if old token is used after rotation)
- Limits blast radius of compromised tokens
- OAuth 2.1 Security Best Current Practice

**Grace Period:**
- After rotation, previous token remains valid for short window (e.g., 1 minute)
- Allows clients to get the new token without race conditions

### 3.4 Concurrency Handling

**The Problem:**
Multiple concurrent API requests may all try to refresh the same expired token simultaneously

**Solution 1: In-Memory Lock (Single Instance)**
```typescript
const refreshLocks = new Map<string, Promise<Token>>();

async function getToken(userId: string): Promise<Token> {
  // Check if refresh already in progress
  const existingRefresh = refreshLocks.get(userId);
  if (existingRefresh) return existingRefresh;

  // Get current token
  const token = await db.getToken(userId);

  // Check if still valid
  if (token.expires_at > Date.now()) return token;

  // Start refresh (with lock)
  const refreshPromise = refreshToken(token.refresh_token)
    .finally(() => refreshLocks.delete(userId));

  refreshLocks.set(userId, refreshPromise);
  return refreshPromise;
}
```

**Solution 2: Database Advisory Locks (Multi-Instance)**
```python
# PostgreSQL example with double-check pattern
def get_token(user_id):
    # Acquire advisory lock
    cursor.execute("SELECT pg_advisory_lock(%s)", [user_id])

    try:
        # Double-check: another instance may have already refreshed
        token = db.get_token(user_id)
        if token.is_valid():
            return token

        # Refresh token
        new_token = refresh_token(token.refresh_token)
        db.save_token(user_id, new_token)
        return new_token
    finally:
        cursor.execute("SELECT pg_advisory_unlock(%s)", [user_id])
```

**Solution 3: Optimistic Locking**
```typescript
async function refreshToken(token: Token): Promise<Token> {
  const newToken = await fetchNewToken(token.refresh_token);

  // Try to save with version check
  const updated = await db.updateTokenIfVersion(
    token.userId,
    newToken,
    token.version
  );

  if (!updated) {
    // Another process already refreshed, fetch latest
    return db.getToken(token.userId);
  }

  return newToken;
}
```

**Recommendation for Navi:**
- Start with in-memory lock (single Navi server instance)
- Upgrade to Redis-based distributed lock if running multiple servers

**Sources:**
- [OAuth 2 Refresh Tokens: A Practical Guide | Frontegg](https://frontegg.com/blog/oauth-2-refresh-tokens)
- [OAuth 2.0 Refresh Token Best Practices • Stateful](https://stateful.com/blog/oauth-refresh-token-best-practices)
- [How to handle concurrency with OAuth token refreshes | Nango Blog](https://nango.dev/blog/concurrency-with-oauth-token-refreshes)
- [OAuth Token Refresh in Distributed Systems](https://neekey.net/2025/07/20/oauth-token-refresh-in-distributed-systems/)

---

## 4. Multi-Tenant Credential Storage & Encryption

### 4.1 Storage Best Practices

**OAuth Client Credentials (App-Level):**
- Store in secret manager (Google Cloud Secret Manager, AWS Secrets Manager)
- Never hardcode or commit to repository
- Rotate regularly

**User Tokens (User-Level):**
- Encrypt at rest with AES-256
- Store in secure database with TLS
- Never transmit in plain text
- Use platform-specific secure storage (Keychain on macOS, Keystore on Android)

### 4.2 Encryption Architecture

**Envelope Encryption Pattern:**
```
User Data → Encrypt with DEK (Data Encryption Key)
DEK → Encrypt with KEK (Key Encryption Key)
Store: {encrypted_data, encrypted_DEK}
```

**Keys-per-Tenant Model:**
- Each user/tenant has unique Data Encryption Key (DEK)
- All DEKs encrypted by master Key Encryption Key (KEK)
- KEK stored in KMS (AWS KMS, Google Cloud KMS)
- Best balance of cost, management, and security

**Selective Encryption:**
> "Apply encryption judiciously. Not all data is sensitive. Encrypt only those columns that contain personally identifiable information (PII), financial data, credentials, or other information that is subject to regulatory control."

### 4.3 AWS Implementation Example

**DynamoDB + KMS:**
```typescript
// Store token
async function storeToken(userId: string, token: string) {
  const encrypted = await kms.encrypt({
    KeyId: MASTER_KEY_ID,
    Plaintext: Buffer.from(token)
  });

  await dynamodb.put({
    TableName: 'user_tokens',
    Item: {
      userId,
      encryptedToken: encrypted.CiphertextBlob,
      expiresAt: Date.now() + 3600000
    }
  });
}

// Retrieve token
async function getToken(userId: string) {
  const item = await dynamodb.get({
    TableName: 'user_tokens',
    Key: { userId }
  });

  const decrypted = await kms.decrypt({
    CiphertextBlob: item.encryptedToken
  });

  return decrypted.Plaintext.toString();
}
```

**Cost:** $1/month per KMS key + $0.03 per 10,000 requests

**Security Benefit:** Use IAM Roles instead of storing access keys

### 4.4 Application-Level Encryption (ALE)

**Most Secure Approach:**
- Application encrypts/decrypts data before database interaction
- Database only stores ciphertext
- Database has no access to encryption keys
- Provides defense-in-depth

**Implementation:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encrypt(data: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('hex'),
    encrypted: encrypted.toString('hex'),
    authTag: authTag.toString('hex')
  });
}

function decrypt(encrypted: string, key: Buffer): string {
  const { iv, encrypted: data, authTag } = JSON.parse(encrypted);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final()
  ]).toString('utf8');
}
```

### 4.5 Lifecycle Management

**Token Lifecycle:**
1. **Issuance:** Store encrypted with timestamp
2. **Refresh:** Rotate and store new token, invalidate old
3. **Revocation:** Delete from storage immediately
4. **Audit:** Log all access with tenant context
5. **Cleanup:** Delete expired tokens periodically

**Regular Audits:**
- Delete unused OAuth clients
- Rotate encryption keys
- Review access logs
- Monitor for anomalies

**Sources:**
- [Best Practices | Authorization Resources | Google for Developers](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [How to Securely Store OAuth Tokens for Multiple Users and Apps? | AWS re:Post](https://repost.aws/questions/QU_u51s2nbQnOV9XDTBJa-7g/how-to-securely-store-oauth-tokens-for-multiple-users-and-apps)
- [Architecting Secure Multi-Tenant Data Isolation | Medium](https://medium.com/@justhamade/architecting-secure-multi-tenant-data-isolation-d8f36cb0d25e)

---

## 5. Desktop App OAuth Patterns (Tauri/Electron)

### 5.1 Redirect URI Patterns

**Option 1: Localhost Redirect (Recommended)**

**Approach:** Spawn temporary HTTP server on localhost

**Redirect URIs:**
- `http://127.0.0.1:[port]/callback`
- `http://localhost:[port]/callback`
- `http://[::1]:[port]/callback` (IPv6)

**Benefits:**
- OAuth 2.1 compliant
- Works with most providers
- No custom URL scheme registration needed
- HTTP (not HTTPS) acceptable since traffic never leaves device

**Implementation:**
```typescript
// 1. Start local server
const server = Bun.serve({
  port: 0, // Random available port
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      // Exchange code for token
      // Close server
      return new Response('Success! Close this window.');
    }
  }
});

// 2. Open browser to OAuth provider
const authUrl = `https://linear.app/oauth/authorize?client_id=${clientId}&redirect_uri=http://localhost:${server.port}/callback&response_type=code`;
open(authUrl);

// 3. Server receives callback, exchanges code, returns token
```

**Tauri Plugin:**
- [`tauri-plugin-oauth`](https://github.com/FabianLars/tauri-plugin-oauth) - Minimalistic Rust library that spawns temporary localhost server

### 5.2 Custom URL Scheme (Deep Links)

**Approach:** Register custom protocol (e.g., `navi://auth/callback`)

**macOS/Linux:** `tauri://localhost`
**Windows:** `https://tauri.localhost`

**Challenges:**
- Platform-specific implementations
- Linux doesn't support `http(s)://tauri.localhost`
- Not all OAuth providers support custom schemes
- Potential scheme collision with other apps

**Best Practice:**
> "Choose a URL scheme that is likely to be globally unique, and one which they can assert control over. Use reverse domain name pattern: `com.yourdomain.app://callback`"

### 5.3 Browser-Based Authentication (Best UX)

**Approach:** Open system browser for OAuth flow

**Benefits:**
- User sees familiar login page
- Can use existing session (already logged into Google/GitHub)
- No need to enter credentials again
- Better security (credentials never enter app)

**Pattern:**
```typescript
import { open } from '@tauri-apps/api/shell';

// Open browser for OAuth
await open(`https://linear.app/oauth/authorize?...`);

// App listens for deep link or localhost callback
```

### 5.4 Linear OAuth Example

**Step 1: Create OAuth App in Linear**
- Linear Settings → API → OAuth Applications
- Add redirect URL: `http://localhost:3001/oauth/callback`

**Step 2: Authorization URL**
```typescript
const authUrl = new URL('https://linear.app/oauth/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', 'http://localhost:3001/oauth/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'read,write');
authUrl.searchParams.set('state', generateRandomState());

// Open in browser
window.open(authUrl.toString());
```

**Step 3: Handle Callback**
```typescript
// Localhost server receives callback
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state (CSRF protection)
  if (state !== storedState) {
    return res.status(400).send('Invalid state');
  }

  // Exchange code for token
  const tokenResponse = await fetch('https://linear.app/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: 'http://localhost:3001/oauth/callback'
    })
  });

  const { access_token, refresh_token } = await tokenResponse.json();

  // Store encrypted tokens
  await storeToken(userId, { access_token, refresh_token });

  // Close browser window
  res.send('Success! You can close this window.');
});
```

**Step 4: Token Refresh (Linear-Specific)**
- Linear access tokens expire after 24 hours
- Use refresh token to get new access token
- Refresh tokens enabled by default for apps created after Oct 1, 2025

**Sources:**
- [Using Auth0 with Tauri - DEV Community](https://dev.to/randomengy/using-auth0-with-tauri-14nl)
- [Redirect URL for oauth flow · tauri-apps/tauri · Discussion #8554](https://github.com/tauri-apps/tauri/discussions/8554)
- [GitHub - FabianLars/tauri-plugin-oauth](https://github.com/FabianLars/tauri-plugin-oauth)
- [How to build a public Linear integration: Building the Auth Flow](https://rollout.com/integration-guides/linear/how-to-build-a-public-linear-integration-building-the-auth-flow)
- [Linear Developers - OAuth 2.0 authentication](https://developers.linear.app/docs/oauth/authentication)

---

## 6. Embedded OAuth UI Patterns

### 6.1 OAuth Popup Flow

**The Problem:** Full-page redirect loses application state

**The Solution:** Open OAuth flow in popup window

**Benefits:**
- Application state preserved
- No page reload
- Better UX (side-by-side)
- Can use existing sessions in popup

**Implementation:**
```typescript
// Parent window
function openOAuthPopup() {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open(
    authUrl,
    'oauth',
    `width=${width},height=${height},left=${left},top=${top}`
  );

  // Listen for message from popup
  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://yourapp.com') return;

    const { token } = event.data;
    // Use token in main app
    popup.close();
  });
}

// Callback page (in popup)
const code = new URL(location.href).searchParams.get('code');
// Exchange code for token
const token = await exchangeCodeForToken(code);
// Send to parent window
window.opener.postMessage({ token }, 'https://yourapp.com');
window.close();
```

### 6.2 Modal + Popup Pattern (Phyllo SDK)

**Architecture:**
```
Main App
  ↓ (embeds)
Iframe Modal (connection UI)
  ↓ (opens)
Popup Window (OAuth flow)
  ↓ (cross-window communication)
Iframe Modal (receives result)
  ↓ (closes)
Main App (connection complete)
```

**Why This Works:**
- Modal keeps user context in app
- Popup handles OAuth (no CSP issues)
- Cross-window messaging bridges the gap

**Results:**
> "Using Phyllo SDK inside an iframe and enabling the account connection process via popup flow has helped drastically improving the user experience. Overall, their connection success rates jumped by almost 37%."

### 6.3 Inline OAuth Option

**Approach:** OAuth flow within iframe/component (no popup)

**When to Use:**
- OAuth provider allows iframe embedding
- No Content-Security-Policy or X-Frame-Options restrictions

**When NOT to Use:**
- Most major providers (Google, GitHub) block iframe embedding for security
- Use popup flow instead

### 6.4 React OAuth Popup Libraries

**oauth2-popup-flow:**
- TypeScript support
- Handles window navigation
- Preserves app state
- npm: `oauth2-popup-flow`

**react-oauth-popup:**
- React-specific wrapper
- Declarative API
- Handles nasty window navigation
- npm: `react-oauth-popup`

**Okta Sign-In Widget:**
- Full authentication UI
- Embedded or redirect modes
- Enterprise features (MFA, etc.)

**Sources:**
- [GitHub - ricokahler/oauth2-popup-flow](https://github.com/ricokahler/oauth2-popup-flow)
- [react-oauth-popup - npm](https://www.npmjs.com/package/react-oauth-popup)
- [How we use a popup for Google and Outlook OAuth - DEV Community](https://dev.to/dinkydani21/how-we-use-a-popup-for-google-and-outlook-oauth-oci)
- [Embedding Modal in any web app and enable cross browser communication | Phyllo Engineering Blog](https://medium.com/phyllo-engineering-blog/embedding-modal-in-any-web-app-and-enable-cross-browser-communication-288ee7640331)

---

## 7. Recommended Architecture for Navi

### 7.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                        Navi Desktop App                     │
├─────────────────────────────────────────────────────────────┤
│  Settings > Integrations                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Connect Linear]  [Connect GitHub]  [Connect Gmail]│   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│                   Click "Connect"                            │
│                          ↓                                   │
│  1. Navi starts localhost OAuth callback server             │
│  2. Opens system browser to provider OAuth page             │
│  3. User authorizes                                          │
│  4. Provider redirects to http://localhost:PORT/callback     │
│  5. Navi exchanges code for token                            │
│  6. Navi encrypts and stores token in SQLite                 │
│  7. Browser shows "Success! Close this window"               │
│  8. Navi shows "✓ Connected" in UI                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Navi Backend (Bun)                       │
├─────────────────────────────────────────────────────────────┤
│  OAuth Service                                              │
│  ├─ Connection Registry (providers.ts)                      │
│  ├─ Token Manager (storage, refresh, encryption)            │
│  ├─ OAuth Flow Handler (authorize, callback, exchange)      │
│  └─ MCP Integration (provide tokens to MCP servers)         │
│                                                              │
│  API Endpoints                                              │
│  ├─ POST /api/oauth/authorize/:provider                     │
│  ├─ GET  /api/oauth/callback/:provider                      │
│  ├─ GET  /api/integrations (list connected)                 │
│  ├─ POST /api/integrations/token (get token for MCP)        │
│  └─ DELETE /api/integrations/:id (disconnect)               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Database (SQLite)                      │
├─────────────────────────────────────────────────────────────┤
│  oauth_connections                                          │
│  ├─ id (UUID)                                               │
│  ├─ user_id (FK to users - future multi-user support)      │
│  ├─ provider (linear, github, google, etc.)                 │
│  ├─ account_id (external user ID)                           │
│  ├─ account_label (email or username)                       │
│  ├─ encrypted_access_token                                  │
│  ├─ encrypted_refresh_token                                 │
│  ├─ expires_at (timestamp)                                  │
│  ├─ scopes (JSON array)                                     │
│  ├─ created_at                                              │
│  ├─ last_used_at                                            │
│  └─ metadata (JSON - provider-specific data)                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Integration                   │
├─────────────────────────────────────────────────────────────┤
│  MCP servers call:                                          │
│    POST /api/integrations/token                             │
│    Body: { provider: "linear", service: "issues" }          │
│                                                              │
│  Navi responds with:                                        │
│    { access_token: "...", expires_at: 123456789 }           │
│                                                              │
│  Benefits:                                                  │
│  ✓ MCP server never sees refresh token                      │
│  ✓ Navi handles token refresh automatically                 │
│  ✓ Brokered credentials pattern                             │
│  ✓ Token scoped to specific service                         │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Implementation Phases

**Phase 1: Core OAuth Infrastructure (Week 1)**
1. Create `packages/navi-app/server/oauth/` directory
2. Implement Provider Registry (`providers.ts`)
3. Build Token Manager (encryption, storage, refresh)
4. Add database schema for `oauth_connections` table
5. Create OAuth flow endpoints

**Phase 2: UI Components (Week 1)**
1. Create `OAuthConnectionCard.svelte` component
2. Add Integrations settings page
3. Implement connection status indicators
4. Add disconnect functionality

**Phase 3: Provider Implementations (Week 2)**
1. Implement Linear OAuth
2. Implement GitHub OAuth
3. Implement Google OAuth (Gmail, Sheets, Drive)
4. Test token refresh flows

**Phase 4: MCP Integration (Week 2)**
1. Expose token endpoint for MCP servers
2. Update existing integrations CLI to use new system
3. Create MCP server authentication middleware
4. Document MCP OAuth patterns

**Phase 5: Advanced Features (Future)**
1. Multi-account support (multiple Linear accounts)
2. Scope management UI
3. Token usage analytics
4. Connection health monitoring
5. Automatic reconnection prompts

### 7.3 Provider Registry Structure

```typescript
// packages/navi-app/server/oauth/providers.ts

export interface OAuthProvider {
  id: string;
  name: string;
  icon: string;
  color: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scopes: {
    default: string[];
    available: string[];
  };
  pkce: boolean;
  tokenRefresh: {
    enabled: boolean;
    beforeExpiry?: number; // seconds
  };
}

export const providers: Record<string, OAuthProvider> = {
  linear: {
    id: 'linear',
    name: 'Linear',
    icon: '🔷',
    color: 'blue',
    authorizationUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://linear.app/oauth/token',
    userInfoUrl: 'https://api.linear.app/graphql',
    scopes: {
      default: ['read', 'write'],
      available: ['read', 'write', 'admin']
    },
    pkce: true,
    tokenRefresh: {
      enabled: true,
      beforeExpiry: 300 // 5 minutes
    }
  },

  github: {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    color: 'gray',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: {
      default: ['repo', 'user'],
      available: ['repo', 'user', 'gist', 'notifications']
    },
    pkce: true,
    tokenRefresh: {
      enabled: false // GitHub tokens don't expire
    }
  },

  google: {
    id: 'google',
    name: 'Google',
    icon: '🔴',
    color: 'red',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: {
      default: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
      available: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/calendar'
      ]
    },
    pkce: true,
    tokenRefresh: {
      enabled: true,
      beforeExpiry: 300
    }
  }
};
```

### 7.4 Token Manager Implementation

```typescript
// packages/navi-app/server/oauth/token-manager.ts

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { db } from '../db';

const ENCRYPTION_KEY = getOrCreateEncryptionKey(); // From secure storage

class TokenManager {
  private refreshLocks = new Map<string, Promise<Token>>();

  async storeToken(connection: OAuthConnection): Promise<void> {
    const encrypted = this.encrypt({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token
    });

    await db.run(`
      INSERT OR REPLACE INTO oauth_connections (
        id, user_id, provider, account_id, account_label,
        encrypted_access_token, encrypted_refresh_token,
        expires_at, scopes, metadata, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      connection.id,
      connection.user_id,
      connection.provider,
      connection.account_id,
      connection.account_label,
      encrypted.access_token,
      encrypted.refresh_token,
      connection.expires_at,
      JSON.stringify(connection.scopes),
      JSON.stringify(connection.metadata),
      Date.now()
    ]);
  }

  async getToken(provider: string, userId: string = 'default'): Promise<Token | null> {
    // Check for existing refresh in progress
    const lockKey = `${userId}:${provider}`;
    const existingRefresh = this.refreshLocks.get(lockKey);
    if (existingRefresh) return existingRefresh;

    // Get token from database
    const row = await db.get(`
      SELECT * FROM oauth_connections
      WHERE provider = ? AND user_id = ?
    `, [provider, userId]);

    if (!row) return null;

    // Decrypt
    const decrypted = this.decrypt({
      access_token: row.encrypted_access_token,
      refresh_token: row.encrypted_refresh_token
    });

    const token = {
      access_token: decrypted.access_token,
      refresh_token: decrypted.refresh_token,
      expires_at: row.expires_at,
      provider: row.provider,
      user_id: row.user_id
    };

    // Check if token needs refresh
    const providerConfig = providers[provider];
    const bufferMs = (providerConfig.tokenRefresh.beforeExpiry || 300) * 1000;

    if (token.expires_at && token.expires_at - Date.now() < bufferMs) {
      // Start refresh with lock
      const refreshPromise = this.refreshToken(token)
        .finally(() => this.refreshLocks.delete(lockKey));

      this.refreshLocks.set(lockKey, refreshPromise);
      return refreshPromise;
    }

    // Update last used
    await db.run(
      'UPDATE oauth_connections SET last_used_at = ? WHERE provider = ? AND user_id = ?',
      [Date.now(), provider, userId]
    );

    return token;
  }

  async refreshToken(token: Token): Promise<Token> {
    const providerConfig = providers[token.provider];

    const response = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: process.env[`${token.provider.toUpperCase()}_CLIENT_ID`]!,
        client_secret: process.env[`${token.provider.toUpperCase()}_CLIENT_SECRET`]!
      })
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${await response.text()}`);
    }

    const data = await response.json();
    const newToken = {
      ...token,
      access_token: data.access_token,
      refresh_token: data.refresh_token || token.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };

    // Store new token
    await this.storeToken({
      id: `${token.user_id}:${token.provider}`,
      user_id: token.user_id,
      provider: token.provider,
      account_id: token.account_id,
      account_label: token.account_label,
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      expires_at: newToken.expires_at,
      scopes: token.scopes,
      metadata: token.metadata
    });

    return newToken;
  }

  private encrypt(data: any): any {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const encrypted = Buffer.concat([
          cipher.update(value, 'utf8'),
          cipher.final()
        ]);
        const authTag = cipher.getAuthTag();
        result[key] = JSON.stringify({
          iv: iv.toString('hex'),
          data: encrypted.toString('hex'),
          authTag: authTag.toString('hex')
        });
      }
    }
    return result;
  }

  private decrypt(data: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const { iv, data: encrypted, authTag } = JSON.parse(value);
        const decipher = createDecipheriv(
          'aes-256-gcm',
          ENCRYPTION_KEY,
          Buffer.from(iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        result[key] = Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'hex')),
          decipher.final()
        ]).toString('utf8');
      }
    }
    return result;
  }
}

export const tokenManager = new TokenManager();
```

### 7.5 OAuth Flow Handler

```typescript
// packages/navi-app/server/oauth/flow-handler.ts

import { generateRandomString } from './utils';
import { providers } from './providers';
import { tokenManager } from './token-manager';

class OAuthFlowHandler {
  private callbackServer: Server | null = null;
  private pendingStates = new Map<string, PendingAuth>();

  async startAuthFlow(provider: string, userId: string = 'default'): Promise<string> {
    const providerConfig = providers[provider];
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Start callback server if not running
    if (!this.callbackServer) {
      this.callbackServer = Bun.serve({
        port: 0,
        fetch: (req) => this.handleCallback(req)
      });
    }

    const port = this.callbackServer.port;
    const state = generateRandomString(32);
    const redirectUri = `http://localhost:${port}/callback/${provider}`;

    // Store pending auth
    this.pendingStates.set(state, {
      provider,
      userId,
      redirectUri,
      timestamp: Date.now()
    });

    // Build authorization URL
    const authUrl = new URL(providerConfig.authorizationUrl);
    authUrl.searchParams.set('client_id', process.env[`${provider.toUpperCase()}_CLIENT_ID`]!);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', providerConfig.scopes.default.join(' '));
    authUrl.searchParams.set('state', state);

    // Add PKCE if supported
    if (providerConfig.pkce) {
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      this.pendingStates.get(state)!.codeVerifier = codeVerifier;
    }

    return authUrl.toString();
  }

  private async handleCallback(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return new Response(`Authorization failed: ${error}`, { status: 400 });
    }

    if (!code || !state) {
      return new Response('Missing code or state', { status: 400 });
    }

    const pending = this.pendingStates.get(state);
    if (!pending) {
      return new Response('Invalid state', { status: 400 });
    }

    this.pendingStates.delete(state);

    try {
      // Exchange code for token
      const token = await this.exchangeCodeForToken(
        pending.provider,
        code,
        pending.redirectUri,
        pending.codeVerifier
      );

      // Get user info
      const userInfo = await this.getUserInfo(pending.provider, token.access_token);

      // Store connection
      await tokenManager.storeToken({
        id: `${pending.userId}:${pending.provider}`,
        user_id: pending.userId,
        provider: pending.provider,
        account_id: userInfo.id,
        account_label: userInfo.email || userInfo.name,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_at,
        scopes: token.scope?.split(' ') || providers[pending.provider].scopes.default,
        metadata: userInfo
      });

      return new Response(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>✓ Connected to ${providers[pending.provider].name}</h1>
            <p>You can close this window.</p>
            <script>window.close();</script>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (err) {
      console.error('Token exchange failed:', err);
      return new Response('Token exchange failed', { status: 500 });
    }
  }

  private async exchangeCodeForToken(
    provider: string,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse> {
    const providerConfig = providers[provider];

    const body: any = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`]!,
      client_secret: process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]!
    };

    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const response = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(body)
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${await response.text()}`);
    }

    const data = await response.json();

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
      scope: data.scope
    };
  }

  private async getUserInfo(provider: string, accessToken: string): Promise<any> {
    const providerConfig = providers[provider];
    if (!providerConfig.userInfoUrl) return {};

    // Provider-specific user info fetching
    if (provider === 'linear') {
      // Linear uses GraphQL
      const response = await fetch(providerConfig.userInfoUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: '{ viewer { id name email } }'
        })
      });
      const data = await response.json();
      return data.data.viewer;
    } else {
      // Standard REST API
      const response = await fetch(providerConfig.userInfoUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      return response.json();
    }
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

export const oauthFlowHandler = new OAuthFlowHandler();
```

### 7.6 API Endpoints

```typescript
// packages/navi-app/server/routes/oauth.ts

import { oauthFlowHandler } from '../oauth/flow-handler';
import { tokenManager } from '../oauth/token-manager';
import { providers } from '../oauth/providers';

export async function handleOAuthRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/oauth/authorize/:provider
  if (method === 'POST' && url.pathname.match(/^\/api\/oauth\/authorize\/(\w+)$/)) {
    const provider = url.pathname.split('/').pop()!;

    if (!providers[provider]) {
      return new Response('Unknown provider', { status: 404 });
    }

    try {
      const authUrl = await oauthFlowHandler.startAuthFlow(provider);

      // Open browser (Tauri-specific)
      await import('@tauri-apps/api/shell').then(({ open }) => open(authUrl));

      return Response.json({ authUrl });
    } catch (err) {
      return new Response(`Auth flow failed: ${err}`, { status: 500 });
    }
  }

  // GET /api/integrations - List connected integrations
  if (method === 'GET' && url.pathname === '/api/integrations') {
    const connections = await db.all(`
      SELECT id, provider, account_id, account_label, scopes, last_used_at, created_at
      FROM oauth_connections
      WHERE user_id = ?
    `, ['default']);

    return Response.json(connections.map(conn => ({
      id: conn.id,
      provider: conn.provider,
      providerName: providers[conn.provider]?.name || conn.provider,
      icon: providers[conn.provider]?.icon,
      account_id: conn.account_id,
      account_label: conn.account_label,
      scopes: JSON.parse(conn.scopes),
      last_used_at: conn.last_used_at,
      created_at: conn.created_at
    })));
  }

  // POST /api/integrations/token - Get token for MCP server
  if (method === 'POST' && url.pathname === '/api/integrations/token') {
    const { provider, service } = await req.json();

    if (!provider) {
      return new Response('Provider required', { status: 400 });
    }

    try {
      const token = await tokenManager.getToken(provider);

      if (!token) {
        return Response.json({
          error: 'not_connected',
          message: `${provider} not connected. Connect via Navi Settings > Integrations`
        }, { status: 401 });
      }

      return Response.json({
        access_token: token.access_token,
        expires_at: token.expires_at,
        scopes: token.scopes
      });
    } catch (err) {
      return new Response(`Token retrieval failed: ${err}`, { status: 500 });
    }
  }

  // DELETE /api/integrations/:id - Disconnect integration
  if (method === 'DELETE' && url.pathname.match(/^\/api\/integrations\/(.+)$/)) {
    const id = url.pathname.split('/').pop()!;

    await db.run('DELETE FROM oauth_connections WHERE id = ?', [id]);

    return Response.json({ success: true });
  }

  return null;
}
```

### 7.7 UI Component

```svelte
<!-- packages/navi-app/src/lib/features/integrations/components/IntegrationCard.svelte -->
<script lang="ts">
  import { providers } from '$lib/core/oauth-providers';
  import { integrationsApi } from '../api';

  interface Props {
    provider: keyof typeof providers;
    connection?: Connection;
  }

  let { provider, connection }: Props = $props();

  const providerConfig = providers[provider];

  async function connect() {
    try {
      await integrationsApi.connect(provider);
      // Refresh connections list
    } catch (err) {
      console.error('Connection failed:', err);
    }
  }

  async function disconnect() {
    if (!connection) return;

    if (confirm(`Disconnect ${providerConfig.name}?`)) {
      await integrationsApi.disconnect(connection.id);
      connection = undefined;
    }
  }
</script>

<div class="integration-card" style:border-left-color={providerConfig.color}>
  <div class="header">
    <span class="icon">{providerConfig.icon}</span>
    <h3>{providerConfig.name}</h3>
  </div>

  {#if connection}
    <div class="connected">
      <div class="status">
        <span class="indicator connected"></span>
        <span>Connected as {connection.account_label}</span>
      </div>
      {#if connection.last_used_at}
        <div class="last-used">
          Last used: {new Date(connection.last_used_at).toLocaleString()}
        </div>
      {/if}
      <button class="disconnect" onclick={disconnect}>Disconnect</button>
    </div>
  {:else}
    <div class="disconnected">
      <p>Not connected</p>
      <button class="connect" onclick={connect}>
        Connect {providerConfig.name}
      </button>
    </div>
  {/if}
</div>

<style>
  .integration-card {
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: 8px;
    padding: 1rem;
    background: var(--bg-secondary);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .icon {
    font-size: 2rem;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .indicator.connected {
    background: var(--success);
  }

  .connect {
    background: var(--primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .disconnect {
    background: var(--danger);
    color: white;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
</style>
```

---

## 8. Security Checklist

- [ ] **PKCE Implementation:** All OAuth flows use PKCE (code_challenge + code_verifier)
- [ ] **State Parameter:** CSRF protection via random state parameter
- [ ] **Token Encryption:** All tokens encrypted at rest with AES-256-GCM
- [ ] **Encryption Key Management:** Master encryption key stored securely (not in code)
- [ ] **HTTPS Enforcement:** All OAuth provider communication over HTTPS
- [ ] **Secure Token Storage:** Database file encrypted at rest or proper file permissions
- [ ] **Token Refresh Locking:** Prevent race conditions with proper locking
- [ ] **Scope Minimization:** Request only necessary scopes
- [ ] **Token Expiry Handling:** Automatic refresh before expiry
- [ ] **Error Handling:** Don't leak sensitive info in error messages
- [ ] **Audit Logging:** Log all OAuth events (connect, disconnect, token refresh)
- [ ] **Rate Limiting:** Prevent abuse of OAuth endpoints
- [ ] **Client Secret Security:** Never expose client secrets in frontend code
- [ ] **Redirect URI Validation:** Strictly validate OAuth callbacks
- [ ] **Connection Invalidation:** Properly revoke tokens on disconnect

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// Test token encryption/decryption
test('TokenManager encrypts and decrypts tokens', async () => {
  const token = { access_token: 'test123', refresh_token: 'refresh123' };
  const encrypted = tokenManager.encrypt(token);
  const decrypted = tokenManager.decrypt(encrypted);
  expect(decrypted).toEqual(token);
});

// Test token refresh logic
test('TokenManager refreshes expired tokens', async () => {
  const expiredToken = {
    access_token: 'old',
    refresh_token: 'refresh',
    expires_at: Date.now() - 1000,
    provider: 'linear'
  };

  const refreshed = await tokenManager.refreshToken(expiredToken);
  expect(refreshed.access_token).not.toBe('old');
  expect(refreshed.expires_at).toBeGreaterThan(Date.now());
});
```

### 9.2 Integration Tests

```typescript
// Test full OAuth flow
test('Complete OAuth flow for Linear', async () => {
  // 1. Start auth flow
  const authUrl = await oauthFlowHandler.startAuthFlow('linear');
  expect(authUrl).toContain('linear.app/oauth/authorize');

  // 2. Simulate callback
  const callbackUrl = new URL(authUrl);
  const state = callbackUrl.searchParams.get('state');
  const mockCode = 'mock_authorization_code';

  const response = await fetch(`http://localhost:3001/callback/linear?code=${mockCode}&state=${state}`);
  expect(response.ok).toBe(true);

  // 3. Verify token stored
  const token = await tokenManager.getToken('linear');
  expect(token).toBeTruthy();
  expect(token.access_token).toBeTruthy();
});
```

### 9.3 Manual Testing Checklist

- [ ] Linear connection flow end-to-end
- [ ] GitHub connection flow end-to-end
- [ ] Google connection flow end-to-end
- [ ] Token refresh after expiry
- [ ] Disconnect and reconnect
- [ ] Multiple concurrent token requests
- [ ] Browser popup closes after success
- [ ] Error handling (user denies access)
- [ ] MCP server token retrieval
- [ ] Connection survives app restart
- [ ] UI updates after connection

---

## 10. Migration Path (Existing Navi Integrations)

### Current State
- Navi has existing Google OAuth integrations
- CLI tool accesses tokens via `/api/integrations/token`
- Tokens stored (implementation unclear from code)

### Migration Steps

**Step 1: Keep Existing API Compatible**
```typescript
// Ensure new system responds to existing endpoint
POST /api/integrations/token
Body: { provider: "google", service: "gmail" }
Response: { access_token: "...", expires_at: 123456789 }
```

**Step 2: Migrate Existing Connections**
```typescript
// Migration script
async function migrateExistingConnections() {
  const oldConnections = await db.all('SELECT * FROM old_integrations_table');

  for (const conn of oldConnections) {
    await tokenManager.storeToken({
      id: `default:${conn.provider}`,
      user_id: 'default',
      provider: conn.provider,
      account_id: conn.account_id,
      account_label: conn.account_label,
      access_token: conn.access_token, // Will be encrypted
      refresh_token: conn.refresh_token,
      expires_at: conn.expires_at,
      scopes: conn.scopes,
      metadata: {}
    });
  }

  console.log(`Migrated ${oldConnections.length} connections`);
}
```

**Step 3: Update Skills**
- `integrations` skill already uses CLI - no changes needed
- CLI internally calls `/api/integrations/token` - works automatically

**Step 4: Add UI**
- New Settings > Integrations page
- Show existing connections
- Allow connecting new providers

---

## 11. Future Enhancements

### 11.1 Multi-Account Support
- Allow multiple Linear accounts
- Account switcher in UI
- Scope token requests by account

### 11.2 Connection Health Monitoring
- Periodic token validation checks
- Notify user if connection fails
- Auto-reconnect prompts

### 11.3 Scope Management UI
- Show requested vs. granted scopes
- Allow users to modify scopes
- Re-authorize with new scopes

### 11.4 Usage Analytics
- Track API calls per integration
- Show token refresh history
- Connection usage graphs

### 11.5 MCP Server Registry
- Discover MCP servers that need OAuth
- Auto-configure OAuth for MCP servers
- Show which MCP servers use which connections

### 11.6 OAuth Provider Templates
- Easy addition of new providers
- Template-based configuration
- Community provider registry

---

## 12. Key Takeaways

### What Makes OAuth "Just Work"

1. **Hide Complexity from Users**
   - Single "Connect" button
   - Browser handles OAuth, not the app
   - No manual token entry

2. **Handle Token Lifecycle Automatically**
   - Refresh before expiry
   - Retry on 401 errors
   - Proper concurrency handling

3. **Brokered Credentials Pattern**
   - Agents never see tokens
   - Platform acts as proxy
   - Reduces security risk

4. **Native Desktop OAuth**
   - Localhost callback server (best for Tauri)
   - PKCE for security
   - System browser for auth

5. **Unified Interface for MCP Servers**
   - Single API: `POST /api/integrations/token`
   - MCP servers request tokens
   - Navi handles refresh/encryption

### Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Localhost OAuth** | Works with all providers, no custom URL scheme hassles |
| **AES-256-GCM Encryption** | Industry standard, authenticated encryption |
| **In-Memory Refresh Locks** | Simple, works for single Navi instance |
| **SQLite Storage** | Consistent with existing Navi architecture |
| **Browser-Based Flow** | Better UX, can reuse existing sessions |
| **Brokered Credentials** | LLMs never see tokens, more secure |
| **Provider Registry** | Easy to add new providers |
| **PKCE Always** | Future-proof, works for all OAuth 2.1 |

---

## 13. Next Steps for Implementation

1. **Review this document** with team
2. **Create implementation plan** (phases, timeline)
3. **Set up Linear OAuth app** (get client ID/secret)
4. **Implement Phase 1** (core OAuth infrastructure)
5. **Test with Linear** (end-to-end flow)
6. **Build UI components** (connection cards, settings page)
7. **Migrate existing Google OAuth** (if needed)
8. **Add GitHub support** (test multi-provider)
9. **Document for MCP server developers** (how to integrate)
10. **Release and iterate** (gather user feedback)

---

## 14. References

All sources are hyperlinked throughout the document. Key resources:

- **Composio Blog:** [Secure AI Agent Infrastructure Guide](https://composio.dev/blog/secure-ai-agent-infrastructure-guide)
- **MCP Spec:** [Authorization - Model Context Protocol](https://modelcontextprotocol.io/specification/draft/basic/authorization/)
- **Nango Docs:** [Open-source unified API](https://docs.nango.dev/)
- **OAuth 2.1 Security:** [Best Practices | Google for Developers](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- **Tauri OAuth:** [tauri-plugin-oauth](https://github.com/FabianLars/tauri-plugin-oauth)
- **Token Refresh:** [OAuth 2.0 Refresh Token Best Practices](https://stateful.com/blog/oauth-refresh-token-best-practices)

---

**Research Compiled By:** Claude (Research Agent)
**Date:** January 12, 2026
**For:** Bruno @ Navi Project
