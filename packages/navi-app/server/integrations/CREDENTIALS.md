# Credential Storage System

The credential storage system provides encrypted storage for API keys and simple credentials that complement the OAuth integration system.

## Features

- **AES-256-GCM encryption** - All credentials are encrypted at rest using the same crypto system as OAuth tokens
- **Provider-based organization** - Group credentials by provider (e.g., "slack", "openai", "discord")
- **Key-value storage** - Store multiple credential types per provider
- **Validation helpers** - Check if required credentials exist before making API calls

## Usage

### Basic Operations

```typescript
import {
  setCredential,
  getCredential,
  getCredentials,
  deleteCredential,
  deleteAllCredentials,
  hasRequiredCredentials,
} from "./integrations";

// Store a credential
setCredential("slack", "apiKey", "xoxb-your-token-here");
setCredential("openai", "apiKey", "sk-proj-...");

// Retrieve a single credential
const slackToken = getCredential("slack", "apiKey");
// Returns: "xoxb-your-token-here" or null if not found

// Get all credentials for a provider
const openaiCreds = getCredentials("openai");
// Returns: { apiKey: "sk-proj-...", orgId: "org-123", ... }

// Delete a credential
deleteCredential("slack", "apiKey");

// Delete all credentials for a provider
deleteAllCredentials("slack");

// Check if required credentials exist
if (hasRequiredCredentials("openai", ["apiKey", "orgId"])) {
  // Safe to proceed with API call
}
```

### Integration Example: Slack Bot

```typescript
// Store Slack credentials
setCredential("slack", "botToken", "xoxb-...");
setCredential("slack", "signingSecret", "abc123...");
setCredential("slack", "webhookUrl", "https://hooks.slack.com/...");

// Later, in your Slack integration code
if (!hasRequiredCredentials("slack", ["botToken"])) {
  throw new Error("Slack bot token not configured");
}

const credentials = getCredentials("slack");
const slackClient = new SlackClient(credentials.botToken);
```

### Integration Example: OpenAI with Optional Org/Project

```typescript
// Store OpenAI API key (required)
setCredential("openai", "apiKey", "sk-proj-...");

// Optional: Store org and project IDs
setCredential("openai", "orgId", "org-...");
setCredential("openai", "projectId", "proj-...");

// Later, when making API calls
const creds = getCredentials("openai");

const openai = new OpenAI({
  apiKey: creds.apiKey,
  organization: creds.orgId,  // undefined if not set
  project: creds.projectId,   // undefined if not set
});
```

## Common Patterns

### Conditional Features Based on Credentials

```typescript
function getAvailableIntegrations() {
  const integrations = [];

  if (hasRequiredCredentials("slack", ["botToken"])) {
    integrations.push({ name: "Slack", enabled: true });
  }

  if (hasRequiredCredentials("discord", ["botToken"])) {
    integrations.push({ name: "Discord", enabled: true });
  }

  return integrations;
}
```

### API Route Handler

```typescript
// In server/routes/integrations.ts
async function handleSlackMessage(req: Request): Promise<Response> {
  if (!hasRequiredCredentials("slack", ["botToken", "signingSecret"])) {
    return error("Slack integration not configured", 400);
  }

  const creds = getCredentials("slack");

  // Verify request signature
  const signature = req.headers.get("x-slack-signature");
  if (!verifySlackSignature(signature, creds.signingSecret, req.body)) {
    return error("Invalid signature", 401);
  }

  // Use bot token for API calls
  const response = await sendSlackMessage(creds.botToken, {
    channel: "#general",
    text: "Hello from Navi!",
  });

  return json({ success: true });
}
```

## Management Helpers

```typescript
import { listProviders, listCredentialKeys } from "./integrations";

// List all providers with stored credentials
const providers = listProviders();
// Returns: ["slack", "openai", "discord", ...]

// List credential keys for a provider (metadata only, no values)
const keys = listCredentialKeys("slack");
// Returns: [
//   { key: "botToken", created_at: 1234567890, updated_at: 1234567890 },
//   { key: "signingSecret", created_at: 1234567890, updated_at: 1234567890 }
// ]
```

## Security Notes

1. **Encryption key** is stored at `~/.claude-code-ui/.integration-key` and is generated automatically
2. **Machine-specific** - Encrypted credentials can only be decrypted on the same machine
3. **File permissions** - The encryption key file is created with `0o600` (read/write by owner only)
4. **No plaintext** - Credentials are never stored in plaintext in the database

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,              -- Composite: "provider:key"
  provider TEXT NOT NULL,           -- e.g., "slack", "openai"
  key TEXT NOT NULL,                -- e.g., "apiKey", "botToken"
  value_encrypted TEXT NOT NULL,    -- AES-256-GCM encrypted value
  created_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  UNIQUE(provider, key)
);
```

## Comparison: Credentials vs OAuth

| Feature | Credentials System | OAuth System |
|---------|-------------------|--------------|
| Use case | Simple API keys | User-authorized access |
| Storage | Key-value pairs | Access/refresh tokens |
| Expiration | None (manual rotation) | Automatic refresh |
| User consent | Not required | Required via OAuth flow |
| Examples | Slack bot tokens, OpenAI API keys | Gmail access, Google Sheets |

## Migration from Environment Variables

If you're currently storing API keys in environment variables, migrate them to the credentials system:

```typescript
// Before (insecure, in .env file)
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// After (encrypted, in database)
import { getCredential, setCredential } from "./integrations";

// One-time migration
if (process.env.SLACK_BOT_TOKEN && !getCredential("slack", "botToken")) {
  setCredential("slack", "botToken", process.env.SLACK_BOT_TOKEN);
}

// Usage
const botToken = getCredential("slack", "botToken");
```

## API Reference

### `setCredential(provider: string, key: string, value: string): void`
Store or update a credential. Automatically encrypts the value.

### `getCredential(provider: string, key: string): string | null`
Retrieve and decrypt a credential. Returns `null` if not found.

### `getCredentials(provider: string): Record<string, string>`
Get all credentials for a provider as a key-value object. Skips any that fail to decrypt.

### `deleteCredential(provider: string, key: string): void`
Delete a specific credential.

### `deleteAllCredentials(provider: string): void`
Delete all credentials for a provider.

### `hasRequiredCredentials(provider: string, requiredKeys: string[]): boolean`
Check if all required credentials exist and can be decrypted. Returns `true` if `requiredKeys` is empty.

### `listProviders(): string[]`
Get a list of all providers that have credentials stored.

### `listCredentialKeys(provider: string): Array<{key: string, created_at: number, updated_at: number}>`
Get metadata about all credential keys for a provider (no values returned).

### `exportCredentials(): CredentialRow[]`
Export all credentials for backup. **Warning:** Encryption is machine-specific.

### `importCredentials(credentials: CredentialRow[]): void`
Import credentials from a backup. Must be from the same machine or encryption will fail.
