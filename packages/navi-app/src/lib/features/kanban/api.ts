// Kanban API - Frontend client

import { getApiBase } from "../../config";
import type { KanbanCard, KanbanStatus } from "./types";

const getKanbanApiBase = (projectId: string) => `${getApiBase()}/projects/${projectId}/kanban`;

/**
 * List all kanban cards for a project
 */
export async function listCards(
  projectId: string,
  includeArchived = false
): Promise<KanbanCard[]> {
  const params = includeArchived ? "?includeArchived=true" : "";
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.cards;
}

/**
 * Create a new card
 */
export async function createCard(
  projectId: string,
  card: {
    title: string;
    spec?: string;
    status?: KanbanStatus;
    session_id?: string;
  }
): Promise<KanbanCard> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.card;
}

/**
 * Get a specific card
 */
export async function getCard(projectId: string, cardId: string): Promise<KanbanCard> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards/${cardId}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.card;
}

/**
 * Update a card
 */
export async function updateCard(
  projectId: string,
  cardId: string,
  updates: Partial<Omit<KanbanCard, "id" | "project_id" | "created_at" | "updated_at">>
): Promise<KanbanCard> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.card;
}

/**
 * Delete a card
 */
export async function deleteCard(projectId: string, cardId: string): Promise<void> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards/${cardId}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to delete card");
}

/**
 * Update card status
 */
export async function updateCardStatus(
  projectId: string,
  cardId: string,
  status: KanbanStatus,
  statusMessage?: string
): Promise<KanbanCard> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards/${cardId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, status_message: statusMessage }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.card;
}

/**
 * Dispatch card to chat - creates a session and links it
 */
export async function dispatchCard(
  projectId: string,
  cardId: string
): Promise<{ sessionId: string; prompt: string; autoSend: boolean; card: KanbanCard }> {
  const url = `${getKanbanApiBase(projectId)}/cards/${cardId}/dispatch`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Reorder cards
 */
export async function reorderCards(projectId: string, cardIds: string[]): Promise<void> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardIds }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to reorder cards");
}

/**
 * Archive a card
 */
export async function archiveCard(projectId: string, cardId: string): Promise<void> {
  const res = await fetch(`${getKanbanApiBase(projectId)}/cards/${cardId}/archive`, {
    method: "POST",
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to archive card");
}

/**
 * Get kanban card for a session (if any)
 */
export async function getCardForSession(sessionId: string): Promise<KanbanCard | null> {
  const res = await fetch(`${getApiBase()}/sessions/${sessionId}/kanban`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.card;
}

/**
 * Update kanban status from session (agent-driven)
 */
export async function updateSessionKanbanStatus(
  sessionId: string,
  status: KanbanStatus,
  statusMessage?: string
): Promise<KanbanCard | null> {
  const res = await fetch(`${getApiBase()}/sessions/${sessionId}/kanban/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, status_message: statusMessage }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.card;
}

export const kanbanApi = {
  listCards,
  createCard,
  getCard,
  updateCard,
  deleteCard,
  updateCardStatus,
  dispatchCard,
  reorderCards,
  archiveCard,
  getCardForSession,
  updateSessionKanbanStatus,
};
