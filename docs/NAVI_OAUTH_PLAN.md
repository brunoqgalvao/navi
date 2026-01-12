# Navi-Owned OAuth Apps - Implementation Plan

## Overview

To provide a seamless "click Connect and it works" experience like Zapier/Make, we need to ship Navi with pre-registered OAuth apps.

## Phase 1: Google OAuth App (Priority)

Google is the highest-value integration (Gmail, Calendar, Sheets, Drive).

### Requirements

1. **Google Cloud Project**
   - Create project: "Navi by Meistrari" (or appropriate branding)
   - Organization: Your Google Cloud org

2. **OAuth Consent Screen**
   - App type: External (for general availability)
   - User type: Anyone with a Google account
   - App verification: Required for production

3. **Required Scopes**
   ```
   # User info (required)
   email
   profile
   openid

   # Gmail
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send

   # Calendar
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/calendar.events

   # Sheets
   https://www.googleapis.com/auth/spreadsheets

   # Drive
   https://www.googleapis.com/auth/drive.readonly
   ```

4. **App Verification**
   - Required for sensitive scopes (Gmail, etc.)
   - Need privacy policy URL
   - Need homepage URL
   - Security assessment may be required

### Architecture Options

#### Option A: Direct OAuth (Current)
```
User → Navi (local) → Google OAuth → Callback to localhost → Tokens stored locally
```
**Pros**: Simple, no backend needed, privacy-friendly
**Cons**: Users see "unverified app" warning, can't pass verification without real domain

#### Option B: Cloud Proxy OAuth
```
User → Navi (local) → Navi Cloud → Google OAuth → Callback to Navi Cloud → Tokens to local
```
**Pros**: Can use verified app, professional experience
**Cons**: Need cloud infrastructure, tokens pass through server (briefly)

#### Option C: Hybrid (Recommended)
```
User → Navi (local) → Navi Cloud (auth URL only) → Google OAuth → Callback to localhost
                                                                    (via custom URL scheme)
```
**Pros**: Verified app, tokens stay local
**Cons**: Requires custom URL scheme handling (Tauri supports this)

### Implementation Steps

1. **Create Google Cloud Project**
   - Set up project with proper branding
   - Configure OAuth consent screen
   - Create OAuth credentials (Web application type for cloud proxy)

2. **Build Cloud Proxy (if using Option B/C)**
   - Simple endpoint: `/oauth/google/start` → returns auth URL
   - Callback endpoint: `/oauth/google/callback` → redirects with tokens
   - Use Navi Cloud infrastructure

3. **Update Navi Code**
   - Add bundled client ID (public, safe to bundle)
   - Client secret either bundled (desktop app pattern) or via cloud proxy
   - Update `getClientCredentials` to check for bundled credentials

4. **App Verification**
   - Submit for Google verification
   - Provide required materials (privacy policy, etc.)
   - Complete security assessment if required

### Code Changes

```typescript
// server/integrations/oauth.ts

// Bundled OAuth credentials (shipped with Navi)
const BUNDLED_OAUTH_CREDENTIALS: Partial<Record<IntegrationProvider, { clientId: string; clientSecret?: string }>> = {
  google: {
    clientId: process.env.NAVI_GOOGLE_CLIENT_ID || "bundled-client-id.apps.googleusercontent.com",
    // For desktop apps, client secret can be bundled (not truly secret)
    // OR use cloud proxy for token exchange
    clientSecret: process.env.NAVI_GOOGLE_CLIENT_SECRET,
  },
};

export function getClientCredentials(provider: IntegrationProvider): { clientId: string; clientSecret: string } | null {
  // First check user-configured credentials
  const userClientId = globalSettings.get(`oauth_${provider}_client_id`);
  const userClientSecret = globalSettings.get(`oauth_${provider}_client_secret`);

  if (userClientId && userClientSecret) {
    return { clientId: userClientId, clientSecret: userClientSecret };
  }

  // Fall back to bundled credentials
  const bundled = BUNDLED_OAUTH_CREDENTIALS[provider];
  if (bundled?.clientId && bundled?.clientSecret) {
    return { clientId: bundled.clientId, clientSecret: bundled.clientSecret };
  }

  return null;
}
```

## Phase 2: Slack OAuth App (Nice to have)

Slack could also benefit from OAuth instead of bot tokens.

### Slack App Requirements
- Create Slack App in Slack API dashboard
- Configure OAuth scopes
- Less stringent verification than Google

## Phase 3: GitHub OAuth App (Nice to have)

GitHub already works via `gh` CLI, but OAuth could be cleaner.

### GitHub App Requirements
- Create OAuth App in GitHub settings
- Simple verification process

## Timeline Estimate

| Phase | Task | Effort |
|-------|------|--------|
| 1a | Create Google Cloud project & OAuth | 2 hours |
| 1b | Submit for verification | 1-4 weeks (Google review) |
| 1c | Code changes for bundled credentials | 2 hours |
| 1d | Cloud proxy (if needed) | 4 hours |
| 1e | Testing & polish | 2 hours |
| 2 | Slack OAuth (optional) | 4 hours |
| 3 | GitHub OAuth (optional) | 2 hours |

## Security Considerations

1. **Client Secret in Desktop App**
   - Desktop OAuth apps can't truly protect client secrets
   - Google allows bundling for desktop apps (accepted practice)
   - Alternative: Use PKCE flow (more secure, no secret needed)

2. **Token Storage**
   - Tokens encrypted with AES-256-GCM
   - Machine-specific encryption key
   - Stored locally, never transmitted

3. **Cloud Proxy Security**
   - If using cloud proxy, use ephemeral session tokens
   - Never store user tokens on server
   - Log minimal data

## Next Actions

- [ ] Decide on architecture (A, B, or C)
- [ ] Create Google Cloud project
- [ ] Set up OAuth consent screen
- [ ] Implement code changes
- [ ] Test OAuth flow
- [ ] Submit for verification
- [ ] Update documentation
