// Kanban stores - Reactive state

import { writable, derived, get } from "svelte/store";
import type { KanbanCard, KanbanStatus } from "./types";
import { kanbanApi } from "./api";
import { KANBAN_COLUMNS } from "./types";

/**
 * Store for kanban cards by project
 */
function createKanbanStore() {
  const { subscribe, set, update } = writable<Map<string, KanbanCard[]>>(new Map());

  return {
    subscribe,

    /**
     * Load cards for a project
     */
    async loadForProject(projectId: string, includeArchived = false): Promise<void> {
      try {
        const cards = await kanbanApi.listCards(projectId, includeArchived);
        update((state) => {
          state.set(projectId, cards);
          return new Map(state);
        });
      } catch (error) {
        console.error("Failed to load kanban cards:", error);
      }
    },

    /**
     * Get cards for a project
     */
    getCardsForProject(projectId: string): KanbanCard[] {
      const state = get({ subscribe });
      return state.get(projectId) || [];
    },

    /**
     * Add a card
     */
    async addCard(
      projectId: string,
      card: { title: string; spec?: string; status?: KanbanStatus }
    ): Promise<KanbanCard> {
      const newCard = await kanbanApi.createCard(projectId, card);
      update((state) => {
        const cards = state.get(projectId) || [];
        state.set(projectId, [...cards, newCard]);
        return new Map(state);
      });
      return newCard;
    },

    /**
     * Update a card
     */
    async updateCard(
      projectId: string,
      cardId: string,
      updates: Partial<KanbanCard>
    ): Promise<void> {
      const updatedCard = await kanbanApi.updateCard(projectId, cardId, updates);
      update((state) => {
        const cards = state.get(projectId) || [];
        const idx = cards.findIndex((c) => c.id === cardId);
        if (idx >= 0) {
          cards[idx] = updatedCard;
          state.set(projectId, [...cards]);
        }
        return new Map(state);
      });
    },

    /**
     * Update card status
     */
    async updateStatus(
      projectId: string,
      cardId: string,
      status: KanbanStatus,
      statusMessage?: string
    ): Promise<void> {
      const updatedCard = await kanbanApi.updateCardStatus(projectId, cardId, status, statusMessage);
      update((state) => {
        const cards = state.get(projectId) || [];
        const idx = cards.findIndex((c) => c.id === cardId);
        if (idx >= 0) {
          cards[idx] = updatedCard;
          state.set(projectId, [...cards]);
        }
        return new Map(state);
      });
    },

    /**
     * Delete a card
     */
    async deleteCard(projectId: string, cardId: string): Promise<void> {
      await kanbanApi.deleteCard(projectId, cardId);
      update((state) => {
        const cards = state.get(projectId) || [];
        state.set(
          projectId,
          cards.filter((c) => c.id !== cardId)
        );
        return new Map(state);
      });
    },

    /**
     * Archive a card
     */
    async archiveCard(projectId: string, cardId: string): Promise<void> {
      await kanbanApi.archiveCard(projectId, cardId);
      update((state) => {
        const cards = state.get(projectId) || [];
        const idx = cards.findIndex((c) => c.id === cardId);
        if (idx >= 0) {
          cards[idx] = { ...cards[idx], status: "archived" };
          state.set(projectId, [...cards]);
        }
        return new Map(state);
      });
    },

    /**
     * Dispatch card to chat
     */
    async dispatchCard(
      projectId: string,
      cardId: string
    ): Promise<{ sessionId: string; prompt: string; autoSend: boolean }> {
      const result = await kanbanApi.dispatchCard(projectId, cardId);
      update((state) => {
        const cards = state.get(projectId) || [];
        const idx = cards.findIndex((c) => c.id === cardId);
        if (idx >= 0) {
          cards[idx] = result.card;
          state.set(projectId, [...cards]);
        }
        return new Map(state);
      });
      return { sessionId: result.sessionId, prompt: result.prompt, autoSend: result.autoSend };
    },

    /**
     * Update card from external source (e.g., WebSocket)
     */
    updateCardFromExternal(projectId: string, card: KanbanCard): void {
      update((state) => {
        const cards = state.get(projectId) || [];
        const idx = cards.findIndex((c) => c.id === card.id);
        if (idx >= 0) {
          cards[idx] = card;
        } else {
          cards.push(card);
        }
        state.set(projectId, [...cards]);
        return new Map(state);
      });
    },

    /**
     * Clear project data
     */
    clearProject(projectId: string): void {
      update((state) => {
        state.delete(projectId);
        return new Map(state);
      });
    },

    /**
     * Reset all
     */
    reset(): void {
      set(new Map());
    },
  };
}

export const kanbanStore = createKanbanStore();

/**
 * Get cards grouped by status for a project
 */
export function getCardsByStatus(projectId: string) {
  return derived(kanbanStore, ($store) => {
    const cards = $store.get(projectId) || [];
    const grouped: Record<KanbanStatus, KanbanCard[]> = {
      backlog: [],
      spec: [],
      execute: [],
      review: [],
      done: [],
      archived: [],
    };

    for (const card of cards) {
      if (grouped[card.status]) {
        grouped[card.status].push(card);
      }
    }

    // Sort by sort_order within each column
    for (const status of Object.keys(grouped) as KanbanStatus[]) {
      grouped[status].sort((a, b) => a.sort_order - b.sort_order);
    }

    return grouped;
  });
}

/**
 * Get active columns (non-archived) with their cards
 */
export function getActiveColumns(projectId: string) {
  return derived(kanbanStore, ($store) => {
    const cards = $store.get(projectId) || [];
    return KANBAN_COLUMNS.map((column) => ({
      ...column,
      cards: cards
        .filter((c) => c.status === column.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }));
  });
}
