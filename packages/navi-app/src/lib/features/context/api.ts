/**
 * Context Sidebar API
 *
 * Fetches context summaries from the backend.
 */

import { getServerUrl } from "../../api";
import type { ContextSummary } from "./types";

const API_BASE = () => getServerUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export const contextApi = {
  /**
   * Get the context summary for a session
   */
  getSummary: (sessionId: string) =>
    request<ContextSummary>(`/api/sessions/${sessionId}/context`),
};
