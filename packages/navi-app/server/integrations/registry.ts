/**
 * Integration Registry
 *
 * Central registry for all available integrations in Navi.
 * Defines providers, their authentication requirements, and how to connect to them.
 */

import { hasRequiredCredentials, type CredentialScope } from "./credentials";
import { integrations as oauthIntegrations } from "./db";

// ============================================================================
// Types
// ============================================================================

export type CredentialFieldType = "text" | "password" | "oauth";

/** Authentication type for the integration */
export type AuthType = "api_key" | "oauth" | "cli" | "browser" | "none";

export interface CredentialField {
  key: string;
  label: string;
  type: CredentialFieldType;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  required?: boolean;
}

/** Skill configuration for the integration */
export interface SkillConfig {
  /** Skill ID for using the integration (e.g., "linear") */
  usage?: string;
  /** Skill ID for setting up the integration (e.g., "connect-linear") */
  setup?: string;
}

/** Default settings when integration is first connected */
export interface IntegrationDefaultsConfig {
  /** Whether enabled by default when credentials are added */
  enabledGlobally: boolean;
  /** Whether MCP server should auto-load */
  mcpEnabled: boolean;
  /** Whether skill should be available */
  skillEnabled: boolean;
}

export interface MCPConfig {
  /** npm package name (e.g., "@notionhq/notion-mcp-server") */
  package?: string;
  /** Direct command to run (e.g., "npx @modelcontextprotocol/server-github") */
  command?: string;
  /** SSE endpoint URL (e.g., "https://mcp.linear.app/sse") */
  sse?: string;
  /** Environment variables to pass to the MCP server */
  env: Record<string, string>;
  /** Additional command-line arguments */
  args?: string[];
}

export interface CLIConfig {
  /** CLI command to execute (e.g., "gh", "linear") */
  command: string;
  /** Environment variables for the CLI */
  env?: Record<string, string>;
  /** How to check if CLI is authenticated */
  authCheckCommand?: string;
}

export interface APIConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** Header name for authentication (e.g., "Authorization", "X-API-Key") */
  authHeader: string;
  /** Value template (use {{credential_key}} for substitution) */
  authValueTemplate?: string;
}

export interface SetupGuide {
  /** Short description of what this integration enables */
  description: string;
  /** Step-by-step instructions (markdown supported) */
  steps: string[];
  /** What capabilities this integration provides */
  capabilities: string[];
  /** Example prompts users can try after setup */
  examplePrompts?: string[];
}

export interface IntegrationProvider {
  /** Unique provider ID */
  id: string;
  /** Display name */
  name: string;
  /** Short description of what this integration does */
  description?: string;
  /** Icon color class (for UI) */
  color: string;
  /** SVG path data for icon */
  icon: string;
  /** Authentication type */
  authType: AuthType;
  /** Credentials required for this provider */
  credentials: CredentialField[];
  /** MCP server configuration (if this provider uses MCP) */
  mcp?: MCPConfig;
  /** CLI configuration (if this provider uses a CLI tool) */
  cli?: CLIConfig;
  /** Direct API configuration (if this provider uses REST API) */
  api?: APIConfig;
  /** Skill configuration */
  skill?: SkillConfig;
  /** Default settings when integration is connected */
  defaults: IntegrationDefaultsConfig;
  /** Whether this provider is currently available */
  available?: boolean;
  /** Setup guide for assisted onboarding */
  setupGuide?: SetupGuide;
}

// ============================================================================
// Provider Definitions
// ============================================================================

const LINEAR_PROVIDER: IntegrationProvider = {
  id: "linear",
  name: "Linear",
  description: "Issue tracking and project management",
  color: "text-blue-500 dark:text-blue-400",
  icon: "M4.5 2.5l-2 17 17-2-15-15z M6.5 6.5l10 10",
  authType: "api_key",
  credentials: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      placeholder: "lin_api_...",
      helpUrl: "https://linear.app/settings/account/security/api-keys/new",
      helpText: "Settings → Account → Security → API Keys → Create new key",
      required: true,
    },
  ],
  mcp: {
    sse: "https://mcp.linear.app/mcp",
    env: {
      // Linear MCP expects Authorization header with Bearer token
      Authorization: "Bearer {{apiKey}}",
    },
  },
  skill: {
    usage: "linear",
    setup: "connect-linear",
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: true,
    skillEnabled: true,
  },
  setupGuide: {
    description: "Connect to Linear to manage issues, projects, and workflows directly from Navi.",
    steps: [
      "Click the link above or go to **linear.app/settings/account/security/api-keys/new**",
      "Give your new key a label (e.g., 'Navi')",
      "Click **Create** and copy the key (starts with `lin_api_`)",
      "Paste it below and click Save",
    ],
    capabilities: [
      "Create, update, and close issues",
      "Search and filter issues",
      "Manage projects and cycles",
      "View team workload and priorities",
      "Link issues to code changes",
    ],
    examplePrompts: [
      "Show me my assigned issues in Linear",
      "Create a bug report for the login page issue",
      "What's in the current sprint?",
      "Close issue ENG-123 as completed",
    ],
  },
};

const NOTION_PROVIDER: IntegrationProvider = {
  id: "notion",
  name: "Notion",
  description: "Workspace pages, databases, and content management",
  color: "text-gray-900 dark:text-gray-100",
  icon: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.046-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.448-1.632z",
  authType: "api_key",
  credentials: [
    {
      key: "integrationToken",
      label: "Integration Token",
      type: "password",
      placeholder: "ntn_...",
      helpUrl: "https://www.notion.so/profile/integrations",
      helpText: "Create an internal integration and copy the Internal Integration Secret",
      required: true,
    },
  ],
  mcp: {
    package: "@notionhq/notion-mcp-server",
    env: {
      NOTION_API_KEY: "{{integrationToken}}",
    },
  },
  skill: {
    usage: "notion",
    setup: "connect-notion",
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: true,
    skillEnabled: true,
  },
  setupGuide: {
    description: "Connect to Notion to access your workspace's pages, databases, and content.",
    steps: [
      "Go to **notion.so/profile/integrations**",
      "Click **New integration**",
      "Name it (e.g., 'Navi') and select your workspace",
      "Click **Submit** to create the integration",
      "Copy the **Internal Integration Secret** (starts with `ntn_`)",
      "**Important**: Go to the pages you want Navi to access",
      "Click ••• → **Connect to** → Select your integration",
    ],
    capabilities: [
      "Read and search pages and databases",
      "Create and update pages",
      "Query database entries",
      "Access comments and discussions",
    ],
    examplePrompts: [
      "What's in my Product Roadmap database?",
      "Create a new meeting notes page for today",
      "Search Notion for 'Q1 planning'",
      "Add a new item to my Tasks database",
    ],
  },
};

const GITHUB_PROVIDER: IntegrationProvider = {
  id: "github",
  name: "GitHub",
  description: "Code hosting, issues, PRs, and workflows",
  color: "text-gray-900 dark:text-gray-100",
  icon: "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z",
  authType: "cli",
  credentials: [],
  cli: {
    command: "gh",
    authCheckCommand: "gh auth status",
  },
  mcp: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {},
  },
  skill: {
    usage: "github",
    setup: undefined,
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: true,
    skillEnabled: true,
  },
  available: true,
  setupGuide: {
    description: "GitHub is already connected via the `gh` CLI. No additional setup needed!",
    steps: [
      "GitHub uses the `gh` CLI which is already authenticated",
      "If not authenticated, run `gh auth login` in your terminal",
      "Navi will automatically use your existing GitHub credentials",
    ],
    capabilities: [
      "Create and manage issues and PRs",
      "Search code and repositories",
      "View commits and branches",
      "Manage releases and workflows",
    ],
    examplePrompts: [
      "Create a PR for my current branch",
      "Show me open issues in this repo",
      "What PRs need my review?",
      "Search for TODOs in the codebase",
    ],
  },
};

const GOOGLE_PROVIDER: IntegrationProvider = {
  id: "google",
  name: "Google",
  description: "Gmail, Calendar, Sheets, and Drive",
  color: "text-blue-600 dark:text-blue-400",
  icon: "M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z",
  authType: "oauth",
  credentials: [
    {
      key: "oauth",
      label: "OAuth",
      type: "oauth",
      helpText: "Connect using Google OAuth to access Gmail, Calendar, Sheets, and Drive",
    },
  ],
  api: {
    baseUrl: "https://www.googleapis.com",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{access_token}}",
  },
  skill: {
    usage: "integrations",
    setup: "connect-google",
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: false,
    skillEnabled: true,
  },
  available: true,
  setupGuide: {
    description: "Connect your Google account to access Gmail, Calendar, Sheets, and Drive.",
    steps: [
      "Click the **Connect** button below",
      "Sign in with your Google account in the popup",
      "Grant access to the requested services",
      "The popup will close automatically when complete",
    ],
    capabilities: [
      "Read and send emails (Gmail)",
      "View and create calendar events",
      "Read and write spreadsheets",
      "Access files in Google Drive",
    ],
    examplePrompts: [
      "Show me my unread emails",
      "What's on my calendar today?",
      "Read the Q4 Planning spreadsheet",
      "Find recent documents shared with me",
    ],
  },
};

const SLACK_PROVIDER: IntegrationProvider = {
  id: "slack",
  name: "Slack",
  description: "Team messaging and collaboration",
  color: "text-purple-600 dark:text-purple-400",
  icon: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  authType: "api_key",
  credentials: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      placeholder: "xoxb-...",
      helpUrl: "https://api.slack.com/apps",
      helpText: "Create a Slack app and install it to get a bot token",
      required: true,
    },
  ],
  api: {
    baseUrl: "https://slack.com/api",
    authHeader: "Authorization",
    authValueTemplate: "Bearer {{botToken}}",
  },
  skill: {
    usage: "slack",
    setup: "connect-slack",
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: false,
    skillEnabled: true,
  },
  setupGuide: {
    description: "Connect to Slack to read messages, post updates, and interact with your workspace.",
    steps: [
      "Go to **api.slack.com/apps** and click **Create New App**",
      "Choose **From scratch**, name it (e.g., 'Navi'), and select your workspace",
      "Go to **OAuth & Permissions** in the left sidebar",
      "Under **Bot Token Scopes**, add: `channels:read`, `chat:write`, `users:read`",
      "Click **Install to Workspace** and authorize",
      "Copy the **Bot User OAuth Token** (starts with `xoxb-`)",
    ],
    capabilities: [
      "Read channel messages and threads",
      "Post messages to channels",
      "View user profiles and presence",
      "Search messages and files",
    ],
    examplePrompts: [
      "What's been discussed in #engineering today?",
      "Post a standup update to #team",
      "Who's online in the workspace?",
      "Search Slack for 'deployment'",
    ],
  },
};

// ============================================================================
// Registry
// ============================================================================

export const PROVIDERS: Record<string, IntegrationProvider> = {
  linear: LINEAR_PROVIDER,
  notion: NOTION_PROVIDER,
  github: GITHUB_PROVIDER,
  google: GOOGLE_PROVIDER,
  slack: SLACK_PROVIDER,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a single provider by ID
 */
export function getProvider(id: string): IntegrationProvider | undefined {
  return PROVIDERS[id];
}

/**
 * List all available providers
 */
export function listProviders(): IntegrationProvider[] {
  return Object.values(PROVIDERS);
}

export interface IntegrationsRegistry {
  providers: IntegrationProvider[];
}

export function getIntegrationsRegistry(
  scope?: CredentialScope
): IntegrationsRegistry {
  const providers = Object.values(PROVIDERS).map((provider) => ({
    ...provider,
    available: resolveProviderAvailability(provider, scope),
  }));

  return { providers };
}

/**
 * Get the credential template for a provider
 * Returns the fields that need to be filled in to authenticate
 */
export function getProviderCredentialTemplate(id: string): CredentialField[] {
  const provider = getProvider(id);
  return provider?.credentials || [];
}

/**
 * Validate credentials against a provider's requirements
 */
export function validateCredentials(
  providerId: string,
  credentials: Record<string, string>
): { valid: boolean; errors: string[] } {
  const provider = getProvider(providerId);
  if (!provider) {
    return { valid: false, errors: ["Unknown provider"] };
  }

  const errors: string[] = [];

  for (const field of provider.credentials) {
    if (field.required && !credentials[field.key]) {
      errors.push(`Missing required field: ${field.label}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Substitute credential values into environment variables
 * Replaces {{key}} placeholders with actual credential values
 */
export function substituteCredentials(
  template: Record<string, string>,
  credentials: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(template)) {
    result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, credKey) => {
      return credentials[credKey] || "";
    });
  }

  return result;
}

/**
 * Get MCP configuration with credentials substituted
 */
export function getMCPConfig(
  providerId: string,
  credentials: Record<string, string>
): MCPConfig | undefined {
  const provider = getProvider(providerId);
  if (!provider?.mcp) return undefined;

  return {
    ...provider.mcp,
    env: substituteCredentials(provider.mcp.env, credentials),
  };
}

/**
 * Check if a provider requires OAuth
 */
export function isOAuthProvider(providerId: string): boolean {
  const provider = getProvider(providerId);
  return provider?.credentials.some((c) => c.type === "oauth") || false;
}

/**
 * Check if a provider has no credentials (e.g., GitHub CLI)
 */
export function isCredentiallessProvider(providerId: string): boolean {
  const provider = getProvider(providerId);
  return !provider?.credentials.length;
}

function resolveProviderAvailability(
  provider: IntegrationProvider,
  scope?: CredentialScope
): boolean {
  if (typeof provider.available === "boolean") {
    return provider.available;
  }

  if (provider.authType === "oauth") {
    return oauthIntegrations.listByProvider(provider.id as any).length > 0;
  }

  if (!provider.credentials.length) {
    return true;
  }

  const requiredKeys = provider.credentials
    .filter((field) => field.required)
    .map((field) => field.key);

  if (requiredKeys.length === 0) {
    return true;
  }

  return hasRequiredCredentials(provider.id, requiredKeys, scope);
}
