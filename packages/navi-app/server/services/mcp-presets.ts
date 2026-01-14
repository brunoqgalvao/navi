/**
 * MCP Server Presets Registry
 *
 * Pre-configured MCP servers that can be added with minimal setup.
 * Presets can define setup wizard steps for guided configuration.
 */

export interface MCPCredentialTemplate {
  /** Credential key to reference (matches integration provider credential keys) */
  credentialKey: string;
  /** Provider ID for credential lookup */
  providerId: string;
  /** How to format the credential value */
  format?: "raw" | "bearer" | "basic";
}

/**
 * Setup wizard step definition
 * Each step guides the user through configuration
 */
export interface MCPSetupStep {
  /** Unique step ID */
  id: string;
  /** Step type determines the UI rendered */
  type: "input" | "secret" | "directory" | "select" | "confirm" | "info";
  /** Display label */
  label: string;
  /** Longer description/help text */
  description?: string;
  /** Placeholder text for inputs */
  placeholder?: string;
  /** URL for help/documentation (shows "Get API key →" link) */
  helpUrl?: string;
  /** Help link text (defaults to "Get API key →") */
  helpText?: string;
  /** Whether this step is required */
  required?: boolean;
  /** Default value */
  defaultValue?: string;
  /** For select type: available options */
  options?: { value: string; label: string }[];
  /** Where to store the value */
  storeAs: {
    /** Store as environment variable */
    env?: string;
    /** Store as argument (appended to args array) */
    arg?: boolean;
    /** Replace a placeholder in args (e.g., "/path/to/directory") */
    argReplace?: string;
  };
  /** Validation rules */
  validation?: {
    pattern?: string;
    minLength?: number;
    message?: string;
  };
}

export interface MCPServerPreset {
  /** Unique preset ID */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this server does */
  description: string;
  /** Icon emoji */
  icon: string;
  /** Category for grouping */
  category: "popular" | "filesystem" | "development" | "ai" | "data" | "search";
  /** Type of MCP server */
  type: "stdio" | "sse" | "streamable-http";
  /** Command to run (for stdio type) */
  command?: string;
  /** Default arguments */
  args?: string[];
  /** SSE/HTTP URL (for sse/http types) */
  url?: string;
  /** Environment variable templates - use {{credential:provider:key}} for credential lookup */
  envTemplates?: Record<string, string>;
  /** Credential template for auto-fill (legacy, prefer setupSteps) */
  credentialTemplate?: MCPCredentialTemplate;
  /** Help URL for setup */
  helpUrl?: string;
  /** Whether this preset requires additional configuration beyond credentials */
  requiresConfig: boolean;
  /** Authentication type (if any) for this preset */
  authType?: "oauth" | "mcp_oauth" | "api_key" | "none";
  /** Optional URL to kick off auth flow in browser */
  authUrl?: string;
  /** Optional extra auth guidance */
  authDescription?: string;
  /** Setup wizard steps - if defined, shows wizard before adding */
  setupSteps?: MCPSetupStep[];
}

/**
 * MCP Server Presets
 *
 * These are popular MCP servers that users can add with guided setup wizards.
 * Each preset defines setupSteps for a step-by-step configuration flow.
 */
export const MCP_PRESETS: MCPServerPreset[] = [
  // ==================== POPULAR ====================
  {
    id: "github",
    name: "GitHub",
    description: "Access repositories, issues, PRs, and code search",
    icon: "🐙",
    category: "popular",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    helpUrl: "https://github.com/settings/tokens",
    requiresConfig: true,
    setupSteps: [
      {
        id: "info",
        type: "info",
        label: "GitHub Personal Access Token",
        description: "To access your repositories (including private ones), you need a GitHub Personal Access Token (PAT).\n\n**Required scopes:** `repo`, `read:org`, `read:user`\n\nClick the link below to create one.",
        helpUrl: "https://github.com/settings/tokens/new?description=Navi%20MCP&scopes=repo,read:org,read:user",
        helpText: "Create token on GitHub →",
        storeAs: {},
      },
      {
        id: "token",
        type: "secret",
        label: "Personal Access Token",
        description: "Paste your GitHub PAT here. It will be stored securely.",
        placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
        required: true,
        storeAs: { env: "GITHUB_PERSONAL_ACCESS_TOKEN" },
        validation: {
          pattern: "^gh[ps]_[a-zA-Z0-9]{36,}$|^github_pat_[a-zA-Z0-9]{22,}_[a-zA-Z0-9]{59,}$",
          message: "Invalid GitHub token format. Should start with ghp_, ghs_, or github_pat_",
        },
      },
    ],
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write files in a specific directory",
    icon: "📁",
    category: "popular",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
    requiresConfig: true,
    setupSteps: [
      {
        id: "directory",
        type: "directory",
        label: "Directory Path",
        description: "Choose which directory Claude can access. This limits file operations to this folder and its subfolders for safety.",
        placeholder: "/Users/you/projects",
        required: true,
        storeAs: { argReplace: "/path/to/directory" },
        validation: {
          minLength: 1,
          message: "Please enter a directory path",
        },
      },
    ],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search with privacy-focused Brave Search API",
    icon: "🦁",
    category: "popular",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    helpUrl: "https://api.search.brave.com/app/keys",
    requiresConfig: true,
    setupSteps: [
      {
        id: "info",
        type: "info",
        label: "Brave Search API",
        description: "Get a free API key from Brave Search. The free tier includes 2,000 queries/month.",
        helpUrl: "https://api.search.brave.com/app/keys",
        helpText: "Get free API key →",
        storeAs: {},
      },
      {
        id: "api_key",
        type: "secret",
        label: "API Key",
        placeholder: "BSA...",
        required: true,
        storeAs: { env: "BRAVE_API_KEY" },
      },
    ],
  },

  // ==================== AI SERVICES ====================
  {
    id: "exa",
    name: "Exa AI",
    description: "AI-powered semantic search for research",
    icon: "🔮",
    category: "ai",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-exa"],
    helpUrl: "https://dashboard.exa.ai",
    requiresConfig: true,
    setupSteps: [
      {
        id: "info",
        type: "info",
        label: "Exa AI Search",
        description: "Exa provides AI-powered semantic search that understands meaning, not just keywords. Sign up for an API key.",
        helpUrl: "https://dashboard.exa.ai/api-keys",
        helpText: "Get API key →",
        storeAs: {},
      },
      {
        id: "api_key",
        type: "secret",
        label: "API Key",
        placeholder: "exa-...",
        required: true,
        storeAs: { env: "EXA_API_KEY" },
      },
    ],
  },

  // ==================== DEVELOPMENT ====================
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query PostgreSQL databases",
    icon: "🐘",
    category: "development",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    requiresConfig: true,
    setupSteps: [
      {
        id: "connection_string",
        type: "secret",
        label: "Connection String",
        description: "PostgreSQL connection URL. Format: `postgresql://user:password@host:port/database`",
        placeholder: "postgresql://user:password@localhost:5432/mydb",
        required: true,
        storeAs: { arg: true },
        validation: {
          pattern: "^postgres(ql)?://",
          message: "Must be a valid PostgreSQL connection string starting with postgresql:// or postgres://",
        },
      },
    ],
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Query SQLite databases",
    icon: "🗃️",
    category: "development",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite"],
    requiresConfig: true,
    setupSteps: [
      {
        id: "db_path",
        type: "input",
        label: "Database Path",
        description: "Path to your SQLite database file (.db, .sqlite, .sqlite3)",
        placeholder: "/path/to/database.db",
        required: true,
        storeAs: { arg: true },
      },
    ],
  },

  // ==================== DATA & TOOLS ====================
  {
    id: "fetch",
    name: "Fetch",
    description: "Make HTTP requests and fetch web content",
    icon: "🌐",
    category: "data",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    requiresConfig: false,
    // No setup steps needed - works out of the box
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Automate web browsers for scraping and testing",
    icon: "🎭",
    category: "data",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    requiresConfig: false,
    // No setup steps needed
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent memory for Claude using a knowledge graph",
    icon: "🧠",
    category: "data",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    requiresConfig: false,
    // No setup steps needed
  },

  // ==================== SEARCH ====================
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Search places, get directions, geocoding",
    icon: "🗺️",
    category: "search",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    helpUrl: "https://developers.google.com/maps/documentation/javascript/get-api-key",
    requiresConfig: true,
    setupSteps: [
      {
        id: "info",
        type: "info",
        label: "Google Maps API",
        description: "You need a Google Cloud API key with Maps API enabled. Google offers $200 free credits monthly.",
        helpUrl: "https://console.cloud.google.com/apis/credentials",
        helpText: "Google Cloud Console →",
        storeAs: {},
      },
      {
        id: "api_key",
        type: "secret",
        label: "API Key",
        placeholder: "AIza...",
        required: true,
        storeAs: { env: "GOOGLE_MAPS_API_KEY" },
      },
    ],
  },

  // ==================== REMOTE MCP SERVERS ====================
  {
    id: "notion",
    name: "Notion",
    description: "Access Notion pages and databases (Official MCP)",
    icon: "📓",
    category: "popular",
    type: "sse",
    url: "https://mcp.notion.com/sse",
    requiresConfig: false,
    authType: "mcp_oauth",
    authDescription: "OAuth starts when you first use a Notion tool in a session.",
    setupSteps: [
      {
        id: "info",
        type: "info",
        label: "Notion Official MCP",
        description: "This connects to Notion's official MCP server. You'll authenticate via OAuth when you first use it.",
        storeAs: {},
      },
    ],
  },
];

/**
 * Get presets grouped by category
 */
export function getPresetsByCategory(): Record<string, MCPServerPreset[]> {
  const grouped: Record<string, MCPServerPreset[]> = {};
  for (const preset of MCP_PRESETS) {
    if (!grouped[preset.category]) {
      grouped[preset.category] = [];
    }
    grouped[preset.category].push(preset);
  }
  return grouped;
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): MCPServerPreset | undefined {
  return MCP_PRESETS.find(p => p.id === id);
}

/**
 * Get presets that require credentials
 */
export function getPresetsNeedingCredentials(): MCPServerPreset[] {
  return MCP_PRESETS.filter(p => p.credentialTemplate !== undefined);
}

/**
 * Resolve environment variables for a preset using credentials
 */
export function resolvePresetEnv(
  preset: MCPServerPreset,
  credentials?: Record<string, string>
): Record<string, string> | undefined {
  if (!preset.envTemplates) return undefined;

  const resolved: Record<string, string> = {};

  for (const [key, template] of Object.entries(preset.envTemplates)) {
    // Check for {{credential:provider:key}} pattern
    const match = template.match(/^\{\{credential:([^:]+):([^}]+)\}\}$/);
    if (match && credentials) {
      const [, provider, credKey] = match;
      // Look up credential value from passed credentials
      const credValue = credentials[credKey];
      if (credValue) {
        resolved[key] = credValue;
      } else {
        // Keep template if no credential found
        resolved[key] = template;
      }
    } else {
      resolved[key] = template;
    }
  }

  return resolved;
}

/**
 * Format a credential value based on format type
 */
export function formatCredential(value: string, format?: string): string {
  switch (format) {
    case "bearer":
      return `Bearer ${value}`;
    case "basic":
      // For basic auth, return as-is (base64 encoded typically)
      return value;
    case "raw":
    default:
      return value;
  }
}

/**
 * Category display info
 */
export const CATEGORY_INFO: Record<string, { label: string; icon: string; description: string }> = {
  popular: {
    label: "Popular",
    icon: "",
    description: "Most commonly used MCP servers",
  },
  filesystem: {
    label: "Files & Data",
    icon: "",
    description: "Access local files and data sources",
  },
  development: {
    label: "Development",
    icon: "",
    description: "Database and development tools",
  },
  ai: {
    label: "AI & Search",
    icon: "",
    description: "AI-powered services and search",
  },
  data: {
    label: "Web & Tools",
    icon: "",
    description: "Fetch, scrape, and automate",
  },
  search: {
    label: "Maps & Location",
    icon: "",
    description: "Geospatial and mapping services",
  },
};
