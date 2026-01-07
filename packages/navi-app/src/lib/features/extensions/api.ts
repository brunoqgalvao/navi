// Extensions API - Frontend client for extension settings

import { getApiBase } from "../../config";
import type { ExtensionSettings } from "./types";

const getExtensionsApiBase = () => `${getApiBase()}/extensions`;

/**
 * Get all extension settings for a project
 */
export async function getProjectExtensions(projectId: string): Promise<ExtensionSettings[]> {
  const res = await fetch(`${getExtensionsApiBase()}/project/${projectId}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.extensions;
}

/**
 * Set extension enabled state for a project
 */
export async function setExtensionEnabled(
  projectId: string,
  extensionId: string,
  enabled: boolean,
  sortOrder?: number
): Promise<void> {
  const res = await fetch(`${getExtensionsApiBase()}/project/${projectId}/${extensionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, sortOrder }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update extension settings");
}

/**
 * Set extension config for a project
 */
export async function setExtensionConfig(
  projectId: string,
  extensionId: string,
  config: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${getExtensionsApiBase()}/project/${projectId}/${extensionId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update extension config");
}

/**
 * Update extension order for a project
 */
export async function reorderExtensions(
  projectId: string,
  orders: { extensionId: string; sortOrder: number }[]
): Promise<void> {
  const res = await fetch(`${getExtensionsApiBase()}/project/${projectId}/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orders }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update extension order");
}

/**
 * Reset extension settings to defaults for a project
 */
export async function resetProjectExtensions(projectId: string): Promise<void> {
  const res = await fetch(`${getExtensionsApiBase()}/project/${projectId}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to reset extension settings");
}

/**
 * Apply template extension settings to a project
 */
export async function applyTemplateExtensions(
  projectId: string,
  templateConfig: Record<string, { enabled: boolean; config?: Record<string, unknown>; sortOrder?: number }>
): Promise<void> {
  const res = await fetch(`${getExtensionsApiBase()}/project/${projectId}/apply-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extensions: templateConfig }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to apply template extensions");
}

export const extensionsApi = {
  getProjectExtensions,
  setExtensionEnabled,
  setExtensionConfig,
  reorderExtensions,
  resetProjectExtensions,
  applyTemplateExtensions,
};
