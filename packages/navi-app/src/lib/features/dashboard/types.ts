/**
 * Dashboard Feature Types
 *
 * Fully isolated - can be removed without affecting other features.
 */

// Widget type identifiers
export type WidgetType =
  | 'git-log'
  | 'preview'
  | 'file'
  | 'status'
  | 'suggestions';

// Action button in an actions block
export interface DashboardAction {
  name: string;
  command: string;
  confirm?: boolean;
}

// Configuration for each widget type
export interface GitLogWidgetConfig {
  limit?: number;
  branch?: string;
}

export interface PreviewWidgetConfig {
  url: string;
  height?: number;
}

export interface FileWidgetConfig {
  path: string;
  collapsible?: boolean;
}

export interface StatusWidgetConfig {
  services: Array<{
    name: string;
    url: string;
  }>;
}

export interface SuggestionsWidgetConfig {
  context?: 'auto' | 'manual';
  prompt?: string;
}

export type WidgetConfig =
  | GitLogWidgetConfig
  | PreviewWidgetConfig
  | FileWidgetConfig
  | StatusWidgetConfig
  | SuggestionsWidgetConfig;

// Parsed dashboard blocks
export type DashboardBlock =
  | { type: 'markdown'; content: string }
  | { type: 'actions'; actions: DashboardAction[] }
  | { type: 'widget'; widget: WidgetType; config: WidgetConfig };

// Full parsed dashboard
export interface Dashboard {
  raw: string;
  blocks: DashboardBlock[];
  error?: string;
}

// API response for dashboard endpoint
export interface DashboardResponse {
  exists: boolean;
  dashboard: Dashboard | null;
  path: string;
}

// Action execution request/response
export interface ExecuteActionRequest {
  command: string;
  projectPath: string;
}

export interface ExecuteActionResponse {
  success: boolean;
  output?: string;
  error?: string;
}

// Service status for status widget
export interface ServiceStatus {
  name: string;
  url: string;
  status: 'up' | 'down' | 'checking';
  latency?: number;
}
