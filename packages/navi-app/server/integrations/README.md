# Integrations Module

The integrations module provides secure storage for both OAuth tokens and API credentials.

## Overview

This module contains two complementary systems:

1. **OAuth System** (`oauth.ts`, types in `types.ts`) - For services requiring user authorization flows
2. **Credentials System** (`credentials.ts`) - For simple API keys and tokens

Both systems use the same AES-256-GCM encryption (`crypto.ts`) to protect sensitive data.

## Files

| File | Purpose |
|------|---------|
| `crypto.ts` | AES-256-GCM encryption/decryption for tokens and credentials |
| `db.ts` | Database operations for OAuth integrations table |
| `credentials.ts` | Database operations for credentials table |
| `oauth.ts` | OAuth flow helpers and token refresh logic |
| `types.ts` | TypeScript types for integrations |
| `index.ts` | Barrel exports for the module |
| `CREDENTIALS.md` | Full documentation for the credentials system |
| `credentials.test.ts` | Test suite for credentials system |
| `credentials.example.ts` | Example API routes for credential management |

## Quick Start

### OAuth Integrations

For services like Gmail, Google Sheets, etc. that require user authorization:

```typescript
import { integrations, encrypt } from "./integrations";

// After OAuth flow completes
integrations.create({
  id: "gmail-user@example.com",
  provider: "google",
  account_id: "user@example.com",
  account_label: "user@example.com",
  services: ["gmail", "contacts"],
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  access_token_encrypted: encrypt(accessToken),
  refresh_token_encrypted: encrypt(refreshToken),
  expires_at: expiresAt,
  created_at: Date.now(),
  updated_at: Date.now(),
});

// Later, retrieve and use
const integration = integrations.findByService("google", "gmail");
```

### API Credentials

For services like Slack, OpenAI, Discord that use simple API keys:

```typescript
import { setCredential, getCredential, hasRequiredCredentials } from "./integrations";

// Store credentials
setCredential("slack", "botToken", "xoxb-...");
setCredential("openai", "apiKey", "sk-proj-...");

// Check before using
if (hasRequiredCredentials("slack", ["botToken"])) {
  const token = getCredential("slack", "botToken");
  // Use token...
}
```

## Database Tables

### `integrations` (OAuth)

```sql
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  services TEXT NOT NULL,              -- JSON array
  scopes TEXT NOT NULL,                -- JSON array
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  UNIQUE(provider, account_id)
);
```

### `credentials` (API Keys)

```sql
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,                 -- Composite: "provider:key"
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, key)
);
```

## Initialization

Both tables are initialized automatically when the server starts:

```typescript
// In server/index.ts (already configured)
import { initIntegrationsTable } from "./integrations/db";

initIntegrationsTable();  // Creates both OAuth and credentials tables
```

## Security

- **Encryption**: AES-256-GCM with machine-specific keys
- **Key Storage**: `~/.claude-code-ui/.integration-key` (0o600 permissions)
- **Database**: `~/.claude-code-ui/data.db` (SQLite, encrypted values)
- **No Plaintext**: Credentials never stored unencrypted

## When to Use Which System

| Use OAuth System | Use Credentials System |
|------------------|------------------------|
| Service requires user consent | Service uses API keys |
| Tokens expire and need refresh | Static/long-lived tokens |
| Multiple users/accounts | Single bot/service account |
| Examples: Gmail, Google Drive | Examples: Slack bots, OpenAI |

## Testing

```bash
# Run credential system tests
bun test server/integrations/credentials.test.ts

# All tests should pass
```

## Documentation

- **OAuth System**: See `types.ts` for integration types and `oauth.ts` for flow helpers
- **Credentials System**: See `CREDENTIALS.md` for complete documentation and examples
- **Example Routes**: See `credentials.example.ts` for API endpoint implementations

## Migration Notes

If you have existing integrations or credentials:

1. **From environment variables**: Use `setCredential()` to migrate API keys
2. **From OAuth system**: Already compatible, no changes needed
3. **From other storage**: Export encrypted values and use `importCredentials()`

## Future Enhancements

Possible improvements (not implemented):

- [ ] Credential expiration/rotation tracking
- [ ] Audit log for credential access
- [ ] Credential sharing between projects
- [ ] Backup/restore functionality with encryption
- [ ] UI for credential management
- [ ] Webhook signature validation helpers
