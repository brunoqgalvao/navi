import type { BoardData, BoardGroup } from "./types";
import { getApiBase } from "../../config";

const getSessionsBoardApiBase = () => `${getApiBase()}/sessions-board`;

/**
 * Get sessions grouped by state for the board view
 * @param projectId - Optional project ID to filter to a single project (workspace view)
 */
export async function getBoardData(projectId?: string): Promise<BoardData> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set("projectId", projectId);
  }
  const queryString = params.toString();
  const url = `${getSessionsBoardApiBase()}${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Get board data for a specific project (workspace view)
 */
export async function getProjectBoardData(projectId: string): Promise<BoardGroup | null> {
  const data = await getBoardData(projectId);
  return data.groups[0] || null;
}

/**
 * Get board data for all projects (global view)
 */
export async function getGlobalBoardData(): Promise<BoardData> {
  return getBoardData();
}
