# OAuth Integration Setup Guide

This guide explains how OAuth integrations work in Navi and how to configure them.

## Current Architecture

Navi supports two authentication patterns:

### 1. API Key Authentication (Simple)
For: **Linear, Notion, Slack**
- User gets an API key from the service
- Pastes it in Navi Settings → Integrations
- Key is encrypted and stored locally
- ✅ Works out of the box

### 2. OAuth Authentication (Complex)
For: **Google (Gmail, Calendar, Sheets, Drive)**
- Requires OAuth app registration
- User must configure OAuth client credentials
- Then can click "Connect" for OAuth flow
- ⚠️ Requires setup (see below)

## Setting Up Google OAuth (Current Method)

Since Navi doesn't ship with built-in Google OAuth credentials, you need to create your own OAuth app:

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Navi Integration")
3. Select the project

### Step 2: Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Enable these APIs:
   - Gmail API
   - Google Calendar API
   - Google Sheets API
   - Google Drive API

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (or Internal if using Google Workspace)
3. Fill in:
   - App name: "Navi" (or your preference)
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - `email`, `profile`, `openid`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.readonly`
5. Add test users (your email addresses)

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: "Navi Desktop"
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

### Step 5: Configure Navi

Currently, you need to set these via API or database:

```bash
# Via API (create endpoint first) or directly in database
# The credentials are stored in globalSettings table:
# - oauth_google_client_id
# - oauth_google_client_secret
```

**TODO**: Add UI in Settings → Integrations → Google → Configure OAuth App

### Step 6: Connect

1. Go to Settings → Integrations
2. Click **Connect** on Google
3. Complete OAuth flow in popup
4. Done!

## Future: Navi-Owned OAuth Apps

We plan to ship Navi with pre-configured OAuth apps so users can just click "Connect":

### Benefits
- Zero configuration for users
- Professional app verification
- Better user experience

### Requirements
- Register OAuth apps with Google, Slack, etc.
- Pass app verification/review
- Set up backend proxy for token exchange
- Handle rate limits and abuse

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    NAVI OAUTH FLOW                              │
│                                                                 │
│  Current (User-owned OAuth)         Future (Navi-owned OAuth)  │
│  ─────────────────────────────     ─────────────────────────── │
│                                                                 │
│  User                               User                        │
│    ↓                                  ↓                         │
│  Creates Google Cloud Project       Clicks "Connect"            │
│    ↓                                  ↓                         │
│  Configures OAuth                   Navi opens OAuth popup      │
│    ↓                                  ↓                         │
│  Pastes credentials in Navi         Google auth screen          │
│    ↓                                  ↓                         │
│  Clicks "Connect"                   Callback to Navi Cloud      │
│    ↓                                  ↓                         │
│  Local OAuth flow                   Tokens stored locally       │
│    ↓                                  ↓                         │
│  Tokens stored locally              Done!                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### Setting OAuth Credentials Programmatically

```typescript
import { setClientCredentials } from "./server/integrations/oauth";

// Set Google OAuth credentials
setClientCredentials("google", "YOUR_CLIENT_ID", "YOUR_CLIENT_SECRET");
```

### Getting OAuth Credentials

```typescript
import { getClientCredentials } from "./server/integrations/oauth";

const creds = getClientCredentials("google");
if (creds) {
  console.log("Client ID:", creds.clientId);
}
```

## Scopes Reference

### Google Scopes (by service)

| Service | Scopes |
|---------|--------|
| Gmail (read) | `gmail.readonly` |
| Gmail (send) | `gmail.send` |
| Calendar (read) | `calendar.readonly` |
| Calendar (write) | `calendar.events` |
| Sheets | `spreadsheets` |
| Drive | `drive.readonly` |

### Full OAuth Flow

1. **Auth URL Generation** (`generateAuthUrl`)
   - Builds Google OAuth URL with scopes
   - Generates state nonce for CSRF protection
   - Returns URL for popup

2. **Callback Handling** (`/api/integrations/oauth/callback`)
   - Validates state
   - Exchanges code for tokens
   - Fetches user info
   - Stores encrypted tokens

3. **Token Refresh** (`refreshToken`)
   - Automatically refreshes expired tokens
   - Updates stored tokens

4. **Token Access** (`getValidToken`)
   - Returns valid access token
   - Refreshes if needed

## Troubleshooting

### "No OAuth credentials configured"
- You haven't set up OAuth client credentials
- Follow the setup guide above

### "OAuth flow failed"
- Check your redirect URI matches
- Ensure APIs are enabled
- Verify test users are added

### "Token refresh failed"
- Google may have revoked access
- Try disconnecting and reconnecting

### "Scope not granted"
- User didn't grant all requested permissions
- May need to disconnect and reconnect with full consent
