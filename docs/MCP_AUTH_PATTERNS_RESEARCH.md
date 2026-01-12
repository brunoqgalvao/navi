# MCP Server Authentication Patterns Research

**Research Date:** January 12, 2026
**Purpose:** Understanding how MCP servers handle OAuth and authentication, identifying which servers manage their own auth vs requiring tokens.

---

## Executive Summary

MCP servers fall into three authentication categories:

1. **Self-Service OAuth** - Server handles OAuth flow internally (e.g., Linear, some Slack implementations)
2. **Token-Based** - Requires pre-generated API tokens via environment variables (e.g., GitHub PAT, Notion, most community servers)
3. **Hybrid** - Supports both OAuth and token-based authentication (e.g., GitHub remote server, Slack variants)

**Key Finding:** The MCP specification standardized OAuth 2.1 in March 2025, but most MCP servers still use simple token-based authentication via environment variables rather than implementing full OAuth flows.

---

## MCP Authentication Specification (2025)

### Standards-Based Approach

The MCP specification adopted **OAuth 2.1** as its authorization standard, building on:

- OAuth 2.1 IETF Draft (draft-ietf-oauth-v2-1-13)
- OAuth 2.0 Authorization Server Metadata (RFC8414)
- OAuth 2.0 Dynamic Client Registration Protocol (RFC7591)
- OAuth 2.0 Protected Resource Metadata (RFC9728)
- OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document-00)

### Key Architectural Principle

**Transport-Specific Authorization:**
- **HTTP-based transports SHOULD** conform to OAuth 2.1
- **STDIO transports SHOULD NOT** follow OAuth 2.1; retrieve credentials from environment instead
- This explains why most local MCP servers use environment variables

### Three-Role Model

1. **MCP Server** - Acts as OAuth 2.1 resource server
2. **MCP Client** - Acts as OAuth 2.1 client
3. **Authorization Server** - Issues access tokens (separate from MCP server)

### Client Registration Methods (Priority Order)

1. **Client ID Metadata Documents** (Recommended) - Client hosts metadata at HTTPS URL, auth server fetches dynamically
2. **Preregistration** - Static credentials provided in advance
3. **Dynamic Client Registration** - Runtime registration via RFC7591

### Security Requirements

- **PKCE Protection** - Clients MUST implement PKCE with S256 code challenge method
- **Token Audience Validation** - Servers MUST validate tokens intended for them
- **HTTPS Required** - All authorization endpoints MUST use HTTPS
- **No Token Passthrough** - MCP servers MUST NOT pass tokens to downstream APIs
- Access tokens MUST be in Authorization header (not query strings)

### OAuth Helpers in TypeScript SDK

The `@modelcontextprotocol/client` package includes OAuth helpers:

- **ClientCredentialsProvider**
- **PrivateKeyJwtProvider**
- **StaticPrivateKeyJwtProvider**

These helpers can:
1. Perform dynamic client registration if needed
2. Acquire access tokens
3. Attach OAuth credentials to Streamable HTTP requests

---

## Server-by-Server Analysis

### 1. Linear MCP Server

**URL:** `https://mcp.linear.app/mcp`
**Auth Pattern:** Self-Service OAuth (with token fallback)

#### OAuth Flow (Primary)
- Uses OAuth 2.1 with dynamic client registration
- Authentication happens through browser redirect
- Credentials cached at `~/.mcp-auth`
- No manual API key management required
- Supports both SSE and Streamable HTTP transports

#### Token-Based (Fallback)
For non-interactive scenarios (CI/CD):
```bash
Authorization: Bearer <your_token>
```

Can also use environment variables:
```bash
LINEAR_CLIENT_ID=xxx
LINEAR_CLIENT_SECRET=xxx
LINEAR_REDIRECT_URI=http://localhost:3000/callback
# OR
LINEAR_API_KEY=xxx  # Personal access token
```

#### Configuration
```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
    }
  }
}
```

Run `/mcp` command to initiate OAuth flow.

#### Troubleshooting
Clear cached auth: `rm -rf ~/.mcp-auth`

**Verdict:** Linear is the gold standard for self-service OAuth in MCP servers.

---

### 2. GitHub MCP Server

**Remote URL:** `https://api.githubcopilot.com/mcp/`
**Docker Image:** `ghcr.io/github/github-mcp-server`
**Auth Pattern:** Hybrid (OAuth preferred, PAT supported)

#### Remote Server with OAuth (Recommended)
- One-click OAuth authentication
- No local setup required
- Point client to `https://api.githubcopilot.com/mcp/`
- OAuth scopes approved during sign-in
- Access limited by organization policies

Verification:
```bash
curl -I https://api.githubcopilot.com/mcp/_ping
# Should return HTTP/1.1 200 OK
```

#### Personal Access Token (PAT)
- Create PAT at GitHub Settings → Developer settings
- Grant necessary scopes for desired actions
- Subject to organization PAT restrictions
- Used in local Docker deployments

#### Local Server with Docker
```bash
docker pull ghcr.io/github/github-mcp-server
```

Image is public; if pull fails, logout: `docker logout ghcr.io`

#### Read-Only Mode
Use header `X-MCP-Readonly: true` for read-only access (reviews, browsing).

**Verdict:** GitHub offers the best of both worlds - remote OAuth for convenience, local PAT for control.

---

### 3. Slack MCP Servers

**Auth Pattern:** Varies by implementation (multiple community servers available)

#### Official Slack MCP (Upcoming)
- Developed in collaboration with Anthropic
- Features OAuth authentication
- Respects existing Slack permissions
- Curated functions for enterprise security
- Planned for broad availability

#### Community Implementations

##### a) Duolingo's slack-mcp
**GitHub:** `github.com/duolingo/slack-mcp`
- OAuth 2.0 authentication
- Multi-user session support
- Read-only server
- Requires HTTPS for OAuth callbacks (use ngrok for local dev)

##### b) korotovsky/slack-mcp-server
**GitHub:** `github.com/korotovsky/slack-mcp-server`
- Most feature-rich community server
- Supports Stdio, SSE, and HTTP transports
- Multiple auth options (priority order):
  1. `xoxp-*` User OAuth token
  2. `xoxb-*` Bot token
  3. `xoxc-*` + `xoxd-*` session tokens (stealth mode)
- No permissions required for session tokens

##### c) cnye36/slack-mcp-server
**GitHub:** `github.com/cnye36/slack-mcp-server`
- Production-ready OAuth 2.0 implementation
- Multi-tenant support
- Automatic token rotation
- Full Slack OAuth v2 with state validation

#### Required OAuth Scopes
Navigate to OAuth & Permissions and add User Token Scopes:
- `channels:history`, `groups:history`, `im:history`, `mpim:history`
- `channels:read`, `groups:read`, `im:read`, `mpim:read`
- `users:read`, `users:read.email`
- `search:read`
- `chat:write` (if posting)

**Verdict:** Slack MCP landscape is fragmented. Wait for official release or use korotovsky's for flexibility.

---

### 4. Gmail/Google MCP Servers

**Auth Pattern:** OAuth 2.0 (self-service with setup)

Multiple community implementations available, all using OAuth:

#### GongRzhe/Gmail-MCP-Server
**GitHub:** `github.com/GongRzhe/Gmail-MCP-Server`
- Auto authentication support
- Natural language Gmail management

##### Setup Steps:
1. Create Google Cloud Project
2. Enable Gmail API
3. Create OAuth 2.0 credentials (Desktop or Web app)
4. Save credentials as `gcp-oauth.keys.json`
5. Place in current directory or `~/.gmail-mcp/`
6. First run launches browser for authentication
7. Credentials stored at `~/.gmail-mcp/credentials.json`

For Web app credentials, add redirect URI:
```
http://localhost:3000/oauth2callback
```

#### Other Implementations

##### PaulFidika's Gmail MCP
- HTTP daemon mode to avoid OAuth popup spam
- Persistent server eliminates repeated authentication
- Stdio mode causes fresh OAuth on each process

##### Unified Gmail MCP Server
- Multiple Gmail account support
- Requires environment variables:
  ```bash
  GOOGLE_OAUTH_CLIENT_ID=xxx
  GOOGLE_OAUTH_CLIENT_SECRET=xxx
  ```
- **Important:** Must use Web application OAuth client type, NOT Desktop

#### FastMCP Google OAuth Integration
- Available since FastMCP v2.12.0
- Uses OAuth Proxy pattern
- Google doesn't support Dynamic Client Registration
- Bridges Google's traditional OAuth with MCP auth requirements

**Verdict:** Google/Gmail MCPs require manual OAuth setup (GCP project, credentials), but then handle auth flow automatically.

---

### 5. Notion MCP Server

**Package:** `@notionhq/notion-mcp-server`
**Auth Pattern:** Token-Based (API key via environment variable)

#### Setup Steps:

1. **Create Notion Integration:**
   - Go to https://www.notion.so/my-integrations
   - Click "+ New integration"
   - Name it (e.g., "My Local MCP Server")
   - Select permissions (Read, Update, Insert content)
   - Copy "Internal Integration Secret" token

2. **Connect Pages:**
   - Visit integration settings → Access tab
   - Edit access and select pages
   - OR individually: Page → 3 dots → "Connect to integration"

3. **Configure MCP Client:**

**Option 1: Using NOTION_TOKEN (Recommended)**
```json
{
  "mcpServers": {
    "notionApi": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_TOKEN": "ntn_****"
      }
    }
  }
}
```

**Option 2: Using OPENAPI_MCP_HEADERS (Advanced)**
```json
{
  "mcpServers": {
    "notionApi": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\"Authorization\": \"Bearer ntn_****\", \"Notion-Version\": \"2025-09-03\" }"
      }
    }
  }
}
```

#### HTTP Transport with Bearer Token

When using Streamable HTTP, the MCP server itself requires authentication:

```bash
# Auto-generated token (development)
npx @notionhq/notion-mcp-server --transport http

# Custom token (production)
npx @notionhq/notion-mcp-server --transport http --auth-token "your-secret-token"

# Via environment variable
AUTH_TOKEN="your-secret-token" npx @notionhq/notion-mcp-server --transport http
```

Server available at: `http://0.0.0.0:<port>/mcp`

#### Security Note
- Never store token in source code
- Never commit to version control
- Read from environment variables only

**Verdict:** Notion uses traditional API key approach. No OAuth flow, but requires manual integration setup.

---

## General MCP Server Authentication Patterns

### Pattern 1: Self-Service OAuth (Remote Servers)
**Examples:** Linear MCP, GitHub Remote MCP, Official Slack MCP (upcoming)

**Characteristics:**
- Server hosted centrally
- OAuth flow handled by server
- Browser-based authentication
- Credentials cached locally (`~/.mcp-auth`)
- No API key management
- Respects service permissions/scopes

**User Experience:**
1. Configure MCP client with server URL
2. Run command to trigger auth
3. Browser opens for OAuth approval
4. Credentials cached for future use

**Pros:**
- Zero manual token management
- Automatic token refresh
- Follows OAuth best practices
- Great UX for end users

**Cons:**
- Requires internet connection
- Server must be maintained
- Less suitable for CI/CD (need token fallback)

---

### Pattern 2: Token-Based (Local Servers)
**Examples:** Notion MCP, most community servers

**Characteristics:**
- Runs locally via npx/npm
- Requires pre-generated API token
- Token set via environment variable
- No OAuth flow
- Simple but manual setup

**User Experience:**
1. Visit service (e.g., Notion) to create integration
2. Generate API token
3. Set environment variable
4. Configure MCP client

**Pros:**
- Works offline (after setup)
- Simple implementation
- Full control over token
- Great for CI/CD

**Cons:**
- Manual token management
- Token rotation requires manual update
- Users must understand API key creation
- Token exposed in environment

---

### Pattern 3: Hybrid (Best of Both)
**Examples:** GitHub MCP, some Slack implementations

**Characteristics:**
- Remote server with OAuth
- Local server with token option
- Read-only modes available
- Flexible deployment

**User Experience:**
- Remote: Point to URL, OAuth flow
- Local: Set token, run locally

**Pros:**
- Flexibility for different use cases
- Remote for convenience, local for control
- Can switch between modes

**Cons:**
- More complex setup documentation
- Users must choose which mode

---

### Pattern 4: OAuth with Manual Setup
**Examples:** Gmail/Google MCPs

**Characteristics:**
- OAuth 2.0 flow, but requires manual GCP setup
- User creates OAuth client in cloud console
- Downloads credentials file
- Server uses credentials for OAuth flow

**User Experience:**
1. Create project in cloud console (GCP, AWS, etc.)
2. Enable APIs
3. Create OAuth 2.0 credentials
4. Download credentials file
5. Place in specific location
6. Run server, browser opens for OAuth
7. Credentials cached

**Pros:**
- Full OAuth security
- User controls OAuth client
- Automatic token refresh

**Cons:**
- Complex initial setup
- Requires understanding of cloud console
- Each user needs separate OAuth client
- Not suitable for shared/team deployments

---

## Key Insights for Navi Integration

### 1. Transport Matters
- **STDIO transports:** Use environment variables (MCP spec recommendation)
- **HTTP transports:** Should use OAuth 2.1
- This explains why most local servers use simple tokens

### 2. The "mcp-remote" Helper
Used by Linear and other remote servers:
```json
{
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
}
```

The `mcp-remote` package likely handles:
- OAuth flow initiation
- Credential caching at `~/.mcp-auth`
- Token refresh
- HTTP transport setup

### 3. OAuth Popup Problem (Stdio Mode)
PaulFidika's Gmail MCP mentions: "In stdio mode, Cursor starts a fresh server process each time, causing OAuth popup spam."

**Solution:** Run as persistent HTTP daemon that authenticates once and stays running.

This is a critical UX issue for MCP clients!

### 4. Standard Credential Locations
- OAuth credentials: `~/.mcp-auth`
- Gmail-specific: `~/.gmail-mcp/credentials.json`
- Config file: MCP client configuration (e.g., `claude_desktop_config.json`)

### 5. Environment Variable Patterns

**Common patterns:**
```bash
# Service-specific token
NOTION_TOKEN=xxx
LINEAR_API_KEY=xxx
GITHUB_TOKEN=xxx

# OAuth credentials (for manual setup)
LINEAR_CLIENT_ID=xxx
LINEAR_CLIENT_SECRET=xxx
LINEAR_REDIRECT_URI=http://localhost:3000/callback

GOOGLE_OAUTH_CLIENT_ID=xxx
GOOGLE_OAUTH_CLIENT_SECRET=xxx

SLACK_CLIENT_ID=xxx
SLACK_CLIENT_SECRET=xxx

# HTTP transport auth
AUTH_TOKEN=xxx  # For protecting HTTP MCP server

# Advanced: Custom headers
OPENAPI_MCP_HEADERS='{"Authorization": "Bearer xxx", "X-Custom": "value"}'
```

### 6. Read-Only Modes
Both GitHub and several Slack servers support read-only modes for safety:
- GitHub: `X-MCP-Readonly: true` header
- Useful for code reviews, exploration without risk

---

## Recommendations for Navi

### For OAuth Integrations (Gmail, Google Sheets, etc.)

**Current Navi Approach:**
- Navi runs its own OAuth server
- Handles OAuth flow for users
- Stores credentials in database
- Provides credentials to MCP servers

**This is correct for:**
1. Services where we want unified auth (one OAuth for multiple MCP tools)
2. Simplifying setup (users don't create their own OAuth clients)
3. Team/shared environments

**Consider adding:**
1. "Self-managed OAuth" option for advanced users
2. Support for `mcp-remote` pattern for services that provide it
3. Credential caching at `~/.mcp-auth` for interoperability

### For Token-Based MCPs (Notion, etc.)

**Simple approach:**
1. UI for entering API tokens
2. Store in Navi's credential system
3. Inject as environment variables when spawning MCP server

**Already implemented in Navi:**
- Credential storage system (`packages/navi-app/server/integrations/credentials.ts`)
- Integration registry
- UI for managing credentials

### For Remote OAuth MCPs (Linear)

**Recommendation:**
1. Support `mcp-remote` pattern directly
2. Let server handle OAuth
3. Monitor process, display status in UI
4. Handle credential expiration gracefully

### Stdio vs HTTP Transport

**For Navi:**
- **HTTP transport preferred** for persistent servers
  - Avoids OAuth popup spam
  - Better process management
  - Can implement read-only modes
  - Easier to proxy/secure

- **Stdio acceptable** for simple tools
  - Use token-based auth
  - No OAuth in stdio mode

---

## Authentication Decision Tree for New MCPs

```
Is the MCP server remote (hosted by service)?
├─ YES → Does it use mcp-remote pattern?
│   ├─ YES → Use mcp-remote, let server handle OAuth
│   └─ NO → Does it have its own OAuth?
│       ├─ YES → Support as-is, document OAuth flow
│       └─ NO → Requires token, add credential input
│
└─ NO (Local) → What transport does it use?
    ├─ STDIO → Use token-based auth via env vars
    └─ HTTP → Should we run it?
        ├─ Run as HTTP → Use token + HTTP auth
        └─ User runs it → Document token setup
```

---

## Summary Matrix

| MCP Server | Auth Type | Self-Service OAuth | Requires Manual Setup | Best For |
|------------|-----------|-------------------|----------------------|----------|
| **Linear** | Hybrid | ✅ Yes (primary) | ❌ No | Remote, easy setup |
| **GitHub (Remote)** | Hybrid | ✅ Yes | ❌ No | Remote, one-click |
| **GitHub (Local)** | Token | ❌ No | ✅ PAT | Local, CI/CD |
| **Slack (Official)** | OAuth | ✅ Yes (planned) | ❌ No | Enterprise, planned |
| **Slack (Community)** | Varies | Some | Varies | Depends on impl |
| **Gmail/Google** | OAuth | Partial | ✅ GCP setup | OAuth with setup |
| **Notion** | Token | ❌ No | ✅ Integration | Simple, local |

**Legend:**
- **Self-Service OAuth:** Server handles OAuth flow automatically
- **Requires Manual Setup:** User must create API keys/OAuth clients manually
- **Best For:** Primary use case

---

## Sources

### Linear MCP
- [Linear MCP Documentation](https://linear.app/docs/mcp)
- [How to Install and Use Linear MCP Server](https://apidog.com/blog/linear-mcp-server/)
- [Linear MCP Server Setup Guide](https://www.builder.io/blog/linear-mcp-server)

### GitHub MCP
- [Official GitHub MCP Server](https://github.com/github/github-mcp-server)
- [GitHub MCP Practical Guide](https://github.blog/ai-and-ml/generative-ai/a-practical-guide-on-how-to-use-the-github-mcp-server/)
- [Setting up GitHub MCP Server](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server)
- [Using GitHub MCP Server](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server)

### Slack MCP
- [Duolingo Slack MCP](https://github.com/duolingo/slack-mcp)
- [korotovsky Slack MCP Server](https://github.com/korotovsky/slack-mcp-server)
- [Slack MCP Authentication Setup](https://github.com/korotovsky/slack-mcp-server/blob/master/docs/01-authentication-setup.md)
- [cnye36 Slack MCP Server](https://glama.ai/mcp/servers/@cnye36/slack-mcp-server)

### Gmail/Google MCP
- [GongRzhe Gmail MCP Server](https://github.com/GongRzhe/Gmail-MCP-Server)
- [Gmail MCP Server by PaulFidika](https://mcpservers.org/servers/PaulFidika/gmail-mcp-server)
- [FastMCP Google OAuth Integration](https://gofastmcp.com/integrations/google)

### Notion MCP
- [Official Notion MCP Server](https://github.com/makenotion/notion-mcp-server)
- [Notion MCP Documentation](https://developers.notion.com/docs/mcp)
- [Notion MCP Getting Started](https://developers.notion.com/docs/get-started-with-mcp)
- [Notion MCP Setup Guide](https://matthiasfrank.de/en/notion-mcp-setup/)

### MCP Specification & General
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [MCP Authentication Implementation Guide](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)
- [MCP Authentication and Authorization Servers](https://stytch.com/blog/mcp-authentication-and-authorization-servers/)
- [Diving Into MCP Authorization Specification](https://www.descope.com/blog/post/mcp-auth-spec)
- [Introduction to MCP and Authorization](https://auth0.com/blog/an-introduction-to-mcp-and-authorization/)
- [MCP Auth Implementation Guide (Logto)](https://blog.logto.io/mcp-auth-implementation-guide-2025-06-18)
- [Securing MCP Servers Guide](https://www.infracloud.io/blogs/securing-mcp-servers/)

---

## Next Steps

1. **Audit Navi's current MCP integration approach** against patterns found
2. **Implement support for `mcp-remote` pattern** for services that provide it
3. **Add HTTP transport option** for persistent MCP servers (avoid OAuth popup spam)
4. **Create credential templates** for common token-based MCPs (Notion, etc.)
5. **Document the decision tree** for adding new MCP servers
6. **Consider credential import/export** for interoperability with other MCP clients
7. **Add read-only mode support** for safety-conscious users
