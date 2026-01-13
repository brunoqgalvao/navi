# Connect Google Skill

Guide users through connecting Google services (Gmail, Sheets, Drive) to Navi via OAuth. You have full context on Google Cloud Console setup, OAuth flow, and API configuration.

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> Navi has its own integration system. Google uses OAuth - configure in Settings > Integrations.

## Trigger Phrases
- "connect google"
- "setup google"
- "add google integration"
- "connect gmail"
- "connect google sheets"
- "connect google drive"

## What Google Enables
- **Gmail**: Read, send, and manage emails
- **Google Sheets**: Read and write spreadsheet data
- **Google Drive**: Access and manage files
- **Shared**: OAuth-based secure authentication

## Authentication

Google uses **OAuth 2.0** for authentication. Unlike API keys, this requires setting up a Google Cloud project first.

### Prerequisites: Create OAuth App (One-Time Setup)

**Step 1: Create Google Cloud Project**
1. Go to **https://console.cloud.google.com**
2. Click **Select a project** → **New Project**
3. Name it "Navi" (or your preference)
4. Click **Create**

**Step 2: Enable Required APIs**
1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search and enable these APIs:
   - **Gmail API** (for email)
   - **Google Sheets API** (for spreadsheets)
   - **Google Drive API** (for file access)
3. Click **Enable** for each

**Step 3: Configure OAuth Consent Screen**
1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (for personal use) or **Internal** (for workspace)
3. Fill in:
   - **App name**: "Navi"
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Click **Save and Continue**
5. **Scopes**: Skip for now (we'll add them next)
6. **Test users** (External only): Add your email
7. Click **Save and Continue**

**Step 4: Add OAuth Scopes**
1. In the OAuth consent screen, click **Edit App**
2. Go to **Scopes** → **Add or Remove Scopes**
3. Add these scopes:

**Gmail Scopes:**
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/gmail.send` - Send emails
- `https://www.googleapis.com/auth/gmail.modify` - Modify emails

**Sheets Scopes:**
- `https://www.googleapis.com/auth/spreadsheets` - Full sheets access

**Drive Scopes:**
- `https://www.googleapis.com/auth/drive.readonly` - Read files
- `https://www.googleapis.com/auth/drive.file` - Manage files created by app

4. Click **Update** → **Save and Continue**

**Step 5: Create OAuth Credentials**
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Application type**: **Web application**
4. Name it "Navi Desktop"
5. Add **Authorized redirect URIs**:
   - `http://localhost:3001/oauth/google/callback`
6. Click **Create**
7. **IMPORTANT**: Copy both values:
   - **Client ID** (starts with `...apps.googleusercontent.com`)
   - **Client Secret** (alphanumeric string)

### Client Credentials Format
- **Client ID**: Ends with `.apps.googleusercontent.com`
- **Client Secret**: Random alphanumeric string (e.g., `GOCSPX-...`)

## Configuring in Navi

Once you have the Client ID and Secret, configure them in Navi Settings:

1. Open **Navi Settings** → **Integrations**
2. Find **Google** section
3. Enter:
   - **Client ID**: Your `...apps.googleusercontent.com` ID
   - **Client Secret**: Your `GOCSPX-...` secret
4. Click **Save**

## OAuth Flow (Automatic After Configuration)

Once configured, users can connect by:

1. Click **Connect Google** in Navi
2. Browser opens to Google login
3. Select your Google account
4. Review and accept permissions
5. Browser redirects back to Navi
6. Connection confirmed!

**Behind the scenes:**
- Navi receives an **authorization code** from Google
- Exchanges it for **access token** and **refresh token**
- Tokens stored securely in credentials database
- Refresh token auto-renews access when needed

## Testing the Connection

After OAuth flow completes, test the credentials:

```bash
curl -X POST http://localhost:3001/api/credentials/google/test
```

A successful response:
```json
{
  "success": true,
  "provider": "google",
  "message": "Connected as user@gmail.com"
}
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_client` | Wrong Client ID/Secret | Re-check credentials in Cloud Console |
| `redirect_uri_mismatch` | Wrong redirect URI | Ensure `http://localhost:3001/oauth/google/callback` is added |
| `access_denied` | User declined permissions | Re-run OAuth flow, accept all scopes |
| `insufficient_permissions` | Missing scopes | Add required scopes in OAuth consent screen |
| `invalid_grant` | Token expired/revoked | User must re-authenticate (click Connect again) |
| API not enabled | API disabled in project | Enable Gmail/Sheets/Drive APIs in Cloud Console |

## Google API Quick Reference

After connecting, Navi can use:

### Gmail
- **Read emails**: Search inbox, read messages, get attachments
- **Send emails**: Compose and send from your account
- **Manage labels**: Create, apply, remove labels
- **Search**: Use Gmail search syntax (e.g., `from:boss@company.com`)

### Google Sheets
- **Read data**: Get values from ranges, entire sheets
- **Write data**: Update cells, append rows
- **Formatting**: Update cell styles, colors
- **Formulas**: Read and write formulas

### Google Drive
- **List files**: Search and filter by type, name
- **Download**: Get file contents
- **Upload**: Create new files
- **Permissions**: Share files, manage access

## Example Prompts After Setup

Once connected, users can try:
- "Check my Gmail for emails from 'boss@company.com' this week"
- "Send an email to team@company.com with subject 'Meeting reminder'"
- "Read data from the 'Q1 Sales' Google Sheet"
- "Add a row to my Tasks spreadsheet: 'Review PR #123'"
- "List files in my Google Drive from last month"
- "Search my Gmail for 'invoice' and summarize"

## Workflow

1. **Check if OAuth configured**: Verify Client ID/Secret in Navi Settings
2. **If not configured**: Guide through Google Cloud Console setup
3. **Once configured**: Click "Connect Google" in Integrations
4. **OAuth flow**: Browser opens → User logs in → Accepts permissions
5. **Tokens stored**: Navi saves access + refresh tokens
6. **Test connection**: POST to test endpoint
7. **Confirm success**: Show what services are now available

## Token Refresh

Google access tokens expire after 1 hour. Navi automatically:
- Detects expired tokens
- Uses refresh token to get new access token
- Updates stored credentials
- Retries the original request

Users never need to manually refresh!

## Revoking Access

To disconnect Google:
1. In Navi: Settings → Integrations → Google → Disconnect
2. In Google: https://myaccount.google.com/permissions → Remove "Navi"

## Troubleshooting OAuth Flow

**Browser doesn't open:**
- Check if Navi backend is running on port 3001
- Try manually opening: `http://localhost:3001/oauth/google/start`

**"This app isn't verified" warning:**
- Expected for apps in testing mode
- Click "Advanced" → "Go to Navi (unsafe)" (it's your own app)
- OR: Submit app for verification (if publishing)

**Scopes not available:**
- Ensure APIs are enabled in Cloud Console
- Check OAuth consent screen has correct scopes added

**Token immediately invalid:**
- Check system clock is correct (OAuth is time-sensitive)
- Verify Client Secret matches exactly (no extra spaces)

## Security Notes

- **Never share** Client Secret publicly
- Tokens are stored encrypted in Navi's credentials database
- Refresh tokens are long-lived - treat them like passwords
- Revoke access if device is compromised
- Use project-scoped credentials for shared projects
