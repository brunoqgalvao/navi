/**
 * Dashboard API Client
 *
 * All dashboard-related API calls isolated here.
 */

import type { DashboardResponse, ExecuteActionResponse } from './types';
import { getApiBase } from '../../config';

const getDashboardApiBase = () => `${getApiBase()}/dashboard`;

/**
 * Get dashboard for a project
 */
export async function getDashboard(projectPath: string): Promise<DashboardResponse> {
  const res = await fetch(
    `${getDashboardApiBase()}?path=${encodeURIComponent(projectPath)}`
  );
  return res.json();
}

/**
 * Save dashboard content
 */
export async function saveDashboard(projectPath: string, content: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(getDashboardApiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: projectPath, content })
  });
  return res.json();
}

/**
 * Execute a dashboard action command
 */
export async function executeAction(
  projectPath: string,
  command: string
): Promise<ExecuteActionResponse> {
  const res = await fetch(`${getDashboardApiBase()}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: projectPath, command })
  });
  return res.json();
}

/**
 * Check service status for status widget
 */
export async function checkServiceStatus(url: string): Promise<{ up: boolean; latency?: number }> {
  const res = await fetch(`${getDashboardApiBase()}/status-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  return res.json();
}

/**
 * Get file content for file widget
 */
export async function getFileContent(projectPath: string, filePath: string): Promise<{ content: string; error?: string }> {
  const res = await fetch(
    `${getDashboardApiBase()}/file?projectPath=${encodeURIComponent(projectPath)}&filePath=${encodeURIComponent(filePath)}`
  );
  return res.json();
}

/**
 * Create default dashboard for a project
 */
export async function createDefaultDashboard(projectPath: string, projectName: string): Promise<{ success: boolean; error?: string }> {
  const defaultContent = `# ${projectName}

Welcome to your project dashboard. Customize this file at \`.claude/dashboard.md\`.

## Quick Actions
\`\`\`actions
- name: "📂 Open in Finder"
  command: "open ."
- name: "🔧 Install Dependencies"
  command: "bun install"
\`\`\`

## Recent Commits
\`\`\`widget:git-log
limit: 5
\`\`\`
`;

  return saveDashboard(projectPath, defaultContent);
}
