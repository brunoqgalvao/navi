/**
 * Dashboard Feature - Public Exports
 *
 * Import from this file to use the dashboard feature.
 * Fully isolated - remove this folder to remove the feature.
 */

// Types
export type {
  Dashboard,
  DashboardBlock,
  DashboardAction,
  DashboardResponse,
  WidgetType,
  WidgetConfig,
  GitLogWidgetConfig,
  PreviewWidgetConfig,
  FileWidgetConfig,
  StatusWidgetConfig,
  SuggestionsWidgetConfig,
  ServiceStatus,
  ExecuteActionRequest,
  ExecuteActionResponse
} from './types';

// Parser
export { parseDashboard, validateDashboard } from './parser';

// API
export {
  getDashboard,
  saveDashboard,
  executeAction,
  checkServiceStatus,
  getFileContent,
  createDefaultDashboard
} from './api';

// Components are imported directly from their files
// e.g., import DashboardView from '$lib/features/dashboard/components/DashboardView.svelte'
