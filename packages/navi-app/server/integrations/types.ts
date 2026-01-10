/**
 * OAuth Integrations Type Definitions
 *
 * Defines the structure for OAuth-based integrations (Google, GitHub, etc.)
 * that allow Navi to access external services on behalf of the user.
 */

// =============================================================================
// Provider Configuration
// =============================================================================

export type IntegrationProvider = "google" | "github" | "notion" | "slack";

export type GoogleService = "gmail" | "sheets" | "drive" | "calendar";
export type GitHubService = "repos" | "issues" | "prs";
export type NotionService = "pages" | "databases";
export type SlackService = "channels" | "messages";

export type IntegrationService = GoogleService | GitHubService | NotionService | SlackService;

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
  provider: IntegrationProvider;
  name: string;
  icon: string;
  services: ServiceConfig[];
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  defaultScopes: string[];
}

export interface ServiceConfig {
  id: IntegrationService;
  name: string;
  description: string;
  scopes: string[];
  icon: string;
}

// =============================================================================
// OAuth Flow Types
// =============================================================================

export interface OAuthState {
  provider: IntegrationProvider;
  services: IntegrationService[];
  redirectUri: string;
  timestamp: number;
  nonce: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // Unix timestamp
  token_type: string;
  scope: string;
}

// =============================================================================
// Stored Integration
// =============================================================================

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  account_id: string; // e.g., email for Google, username for GitHub
  account_label: string; // Display name
  services: IntegrationService[]; // Which services are enabled
  scopes: string[];
  access_token_encrypted: string;
  refresh_token_encrypted?: string;
  expires_at?: number;
  created_at: number;
  updated_at: number;
  last_used_at?: number;
}

// =============================================================================
// CLI Access Types
// =============================================================================

/**
 * Token request from CLI/skill
 * Skills request tokens by provider + optional service filter
 */
export interface TokenRequest {
  provider: IntegrationProvider;
  service?: IntegrationService;
  scopes?: string[]; // If specific scopes needed
}

/**
 * Token response to CLI/skill
 * Never includes refresh token - that stays server-side
 */
export interface TokenResponse {
  access_token: string;
  expires_at?: number;
  account_id: string;
  scopes: string[];
}

// =============================================================================
// Integration Reference (for @ mentions)
// =============================================================================

export interface IntegrationReferenceData {
  provider: IntegrationProvider;
  service: IntegrationService;
  integrationId: string;
  resourceId?: string; // Specific email ID, sheet ID, etc.
  resourceLabel: string; // "Recent emails", "Budget 2024", etc.
  query?: string; // Optional query/filter
}

// =============================================================================
// Provider Definitions
// =============================================================================

export const GOOGLE_SCOPES = {
  gmail_readonly: "https://www.googleapis.com/auth/gmail.readonly",
  gmail_send: "https://www.googleapis.com/auth/gmail.send",
  gmail_modify: "https://www.googleapis.com/auth/gmail.modify",
  sheets_readonly: "https://www.googleapis.com/auth/spreadsheets.readonly",
  sheets_write: "https://www.googleapis.com/auth/spreadsheets",
  drive_readonly: "https://www.googleapis.com/auth/drive.readonly",
  drive_file: "https://www.googleapis.com/auth/drive.file",
  calendar_readonly: "https://www.googleapis.com/auth/calendar.readonly",
  calendar_events: "https://www.googleapis.com/auth/calendar.events",
  userinfo_email: "https://www.googleapis.com/auth/userinfo.email",
  userinfo_profile: "https://www.googleapis.com/auth/userinfo.profile",
} as const;

export const GITHUB_SCOPES = {
  repo: "repo",
  read_user: "read:user",
  user_email: "user:email",
} as const;

export const PROVIDERS: Record<IntegrationProvider, ProviderConfig> = {
  google: {
    provider: "google",
    name: "Google",
    icon: "google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    defaultScopes: [GOOGLE_SCOPES.userinfo_email, GOOGLE_SCOPES.userinfo_profile],
    services: [
      {
        id: "gmail",
        name: "Gmail",
        description: "Read and search emails",
        scopes: [GOOGLE_SCOPES.gmail_readonly],
        icon: "mail",
      },
      {
        id: "sheets",
        name: "Google Sheets",
        description: "Read and edit spreadsheets",
        scopes: [GOOGLE_SCOPES.sheets_readonly],
        icon: "table",
      },
      {
        id: "drive",
        name: "Google Drive",
        description: "Access files and folders",
        scopes: [GOOGLE_SCOPES.drive_readonly],
        icon: "hard-drive",
      },
      {
        id: "calendar",
        name: "Google Calendar",
        description: "Read calendar events",
        scopes: [GOOGLE_SCOPES.calendar_readonly],
        icon: "calendar",
      },
    ],
  },
  github: {
    provider: "github",
    name: "GitHub",
    icon: "github",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    revokeUrl: undefined,
    defaultScopes: [GITHUB_SCOPES.read_user, GITHUB_SCOPES.user_email],
    services: [
      {
        id: "repos",
        name: "Repositories",
        description: "Access repository data",
        scopes: [GITHUB_SCOPES.repo],
        icon: "git-branch",
      },
      {
        id: "issues",
        name: "Issues",
        description: "Read and create issues",
        scopes: [GITHUB_SCOPES.repo],
        icon: "circle-dot",
      },
      {
        id: "prs",
        name: "Pull Requests",
        description: "Read and create PRs",
        scopes: [GITHUB_SCOPES.repo],
        icon: "git-pull-request",
      },
    ],
  },
  notion: {
    provider: "notion",
    name: "Notion",
    icon: "book-open",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    defaultScopes: [],
    services: [
      {
        id: "pages",
        name: "Pages",
        description: "Read Notion pages",
        scopes: [],
        icon: "file-text",
      },
      {
        id: "databases",
        name: "Databases",
        description: "Query Notion databases",
        scopes: [],
        icon: "database",
      },
    ],
  },
  slack: {
    provider: "slack",
    name: "Slack",
    icon: "message-square",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    defaultScopes: [],
    services: [
      {
        id: "channels",
        name: "Channels",
        description: "Read channel messages",
        scopes: ["channels:read", "channels:history"],
        icon: "hash",
      },
      {
        id: "messages",
        name: "Messages",
        description: "Send messages",
        scopes: ["chat:write"],
        icon: "send",
      },
    ],
  },
};
