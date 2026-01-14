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
