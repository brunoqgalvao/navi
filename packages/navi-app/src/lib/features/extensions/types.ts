// Extension system types

import type { ComponentType } from "svelte";

/**
 * Extension definition - what an extension provides
 */
export interface Extension {
  id: string;
  name: string;
  icon: string; // SVG path or Lucide icon name
  description: string;
  panelMode: string;
  component?: ComponentType;
  requiresProject: boolean;
  defaultEnabled: boolean;
  defaultOrder: number; // Default tab order priority
}

/**
 * Extension settings for a specific project (from DB)
 */
export interface ExtensionSettings {
  id: string;
  project_id: string;
  extension_id: string;
  enabled: number; // SQLite boolean
  config: string | null; // JSON string for extension-specific config
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/**
 * Enabled extension state for UI
 */
export interface EnabledExtension {
  extensionId: string;
  enabled: boolean;
  sortOrder: number;
  config?: Record<string, unknown>;
}

/**
 * Extension with resolved settings for display
 */
export interface ResolvedExtension extends Extension {
  enabled: boolean;
  sortOrder: number;
  config?: Record<string, unknown>;
}

/**
 * Extension config from templates
 */
export interface TemplateExtensionConfig {
  extensions: Record<string, { enabled: boolean; config?: Record<string, unknown>; sortOrder?: number }>;
}
