/**
 * Workspace state stores
 * Centralizes state that was previously passed via callbacks between App.svelte and action modules
 */
import { writable, get } from "svelte/store";
import type { Project, Session } from "../api";

// =============================================================================
// SIDEBAR STATE
// =============================================================================

/** Projects displayed in the sidebar */
export const sidebarProjects = writable<Project[]>([]);

/** Sessions displayed in the sidebar for the current project */
export const sidebarSessions = writable<Session[]>([]);

/** Recent chats for quick access */
export const recentChats = writable<Session[]>([]);

// =============================================================================
// PROJECT STATE
// =============================================================================

/** Index mapping file names/paths to full paths for the current project */
export const projectFileIndex = writable<Map<string, string>>(new Map());

/** AI-generated project context (summary and suggestions) */
export const projectContext = writable<{ summary: string; suggestions: string[] } | null>(null);

/** Error message for project context loading */
export const projectContextError = writable<string | null>(null);

/** Content of the project's CLAUDE.md file */
export const claudeMdContent = writable<string | null>(null);

/** Default projects directory from config */
export const defaultProjectsDir = writable<string>("");

// =============================================================================
// WORKSPACE FOLDERS
// =============================================================================

export interface WorkspaceFolder {
  id: string;
  name: string;
  sort_order: number;
  collapsed: number;
  pinned?: number;
  created_at: number;
  updated_at: number;
}

/** Folders for organizing projects */
export const workspaceFolders = writable<WorkspaceFolder[]>([]);

// =============================================================================
// PERMISSIONS STATE
// =============================================================================

export interface PermissionSettings {
  autoAcceptAll: boolean;
  allowedTools: string[];
  requireConfirmation: string[];
}

/** Global permission settings */
export const globalPermissionSettings = writable<PermissionSettings | null>(null);

/** Default tool permissions */
export const permissionDefaults = writable<{ tools: string[]; dangerous: string[] } | null>(null);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Get current value of a store (convenience wrapper around Svelte's get) */
export { get };

/** Reset all workspace state to initial values */
export function resetWorkspaceState(): void {
  sidebarProjects.set([]);
  sidebarSessions.set([]);
  recentChats.set([]);
  projectFileIndex.set(new Map());
  projectContext.set(null);
  projectContextError.set(null);
  claudeMdContent.set(null);
  workspaceFolders.set([]);
}
