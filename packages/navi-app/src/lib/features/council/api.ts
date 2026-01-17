/**
 * LLM Council API - Frontend client
 */

import { getApiBase } from "../../config";
import type { CouncilMember, CouncilResult, CouncilProvider } from "./types";

const API_BASE = () => `${getApiBase()}/council`;

/**
 * Get available council members
 */
export async function getMembers(): Promise<{
  members: CouncilMember[];
  defaultCouncil: string[];
}> {
  const res = await fetch(`${API_BASE()}/members`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Get available providers
 */
export async function getProviders(): Promise<CouncilProvider[]> {
  const res = await fetch(`${API_BASE()}/providers`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Convene the council - send prompt to multiple LLMs
 */
export async function convene(
  prompt: string,
  members?: string[],
  systemPrompt?: string
): Promise<CouncilResult> {
  const res = await fetch(`${API_BASE()}/convene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, members, systemPrompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export const councilApi = {
  getMembers,
  getProviders,
  convene,
};
