/**
 * Context Sidebar Types
 *
 * Simplified types for the compact context panel.
 */

export interface Artifact {
  path: string;
  name: string;
  type: "created" | "edited";
  timestamp: Date;
}

export interface ContextStats {
  filesRead: number;
  bashCommands: number;
  webFetches: number;
  searches: number;
  tasks: number;
}

export interface FileAccessEntry {
  path: string;
  accessType: "read" | "modified" | "write" | "create" | "delete";
  timestamp?: string | Date;
  [key: string]: unknown;
}

export interface ToolCallEntry {
  name: string;
  timestamp?: string | Date;
  [key: string]: unknown;
}

export interface WebFetchEntry {
  url: string;
  timestamp?: string | Date;
  [key: string]: unknown;
}

export interface SearchEntry {
  query: string;
  timestamp?: string | Date;
  [key: string]: unknown;
}

export interface ContextSummary {
  sessionId: string;
  filesRead: FileAccessEntry[];
  filesModified: FileAccessEntry[];
  toolCalls: ToolCallEntry[];
  webFetches: WebFetchEntry[];
  searches: SearchEntry[];
  stats: {
    totalToolCalls: number;
    totalFilesAccessed: number;
    totalWebFetches: number;
    totalSearches: number;
    messageCount: number;
    [key: string]: number | undefined;
  };
}

export interface ContextFilter {
  query?: string;
  section?: string;
  [key: string]: unknown;
}
