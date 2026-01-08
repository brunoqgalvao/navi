<script lang="ts">
  import { onMount } from "svelte";
  import type { KanbanCard, KanbanStatus } from "../types";
  import { kanbanStore, getActiveColumns } from "../stores";
  import KanbanBoard from "./KanbanBoard.svelte";
  import KanbanCardModal from "./KanbanCardModal.svelte";
  import { showError, showSuccess } from "../../../errorHandler";

  interface Props {
    projectId: string;
    onNavigateToSession?: (sessionId: string, prompt?: string) => void;
  }

  let { projectId, onNavigateToSession }: Props = $props();

  // Modal state
  let modalOpen = $state(false);
  let modalMode = $state<"create" | "edit">("create");
  let modalCard = $state<KanbanCard | null>(null);
  let modalInitialStatus = $state<KanbanStatus>("spec");

  // Loading state
  let isLoading = $state(true);

  // Get active columns with cards
  const columnsStore = $derived(getActiveColumns(projectId));

  onMount(async () => {
    await loadCards();
  });

  async function loadCards() {
    isLoading = true;
    try {
      await kanbanStore.loadForProject(projectId);
    } catch (error) {
      showError({ title: "Failed to load tasks", message: String(error) });
    } finally {
      isLoading = false;
    }
  }

  // Inline add card (from ghost card)
  async function handleAddCard(status: KanbanStatus, title: string) {
    try {
      await kanbanStore.addCard(projectId, { title, status });
    } catch (error) {
      showError({ title: "Failed to create task", message: String(error) });
    }
  }

  function handleEditCard(card: KanbanCard) {
    modalMode = "edit";
    modalCard = card;
    modalOpen = true;
  }

  async function handleDispatchCard(card: KanbanCard) {
    try {
      const { sessionId, prompt } = await kanbanStore.dispatchCard(projectId, card.id);
      showSuccess("Task started", `Chat created for "${card.title}"`);
      onNavigateToSession?.(sessionId, prompt);
    } catch (error) {
      showError({ title: "Failed to start task", message: String(error) });
    }
  }

  async function handleStatusChange(card: KanbanCard, status: KanbanStatus) {
    try {
      await kanbanStore.updateStatus(projectId, card.id, status);
    } catch (error) {
      showError({ title: "Failed to update status", message: String(error) });
    }
  }

  async function handleMoveNext(card: KanbanCard) {
    // Move to next status
    const nextStatus: Record<KanbanStatus, KanbanStatus> = {
      backlog: "spec",
      spec: "execute",
      execute: "review",
      review: "done",
      done: "archived",
      archived: "archived",
    };
    try {
      await kanbanStore.updateStatus(projectId, card.id, nextStatus[card.status]);
    } catch (error) {
      showError({ title: "Failed to update status", message: String(error) });
    }
  }

  async function handleDeleteCard(card: KanbanCard) {
    if (!confirm(`Delete "${card.title}"?`)) return;
    try {
      await kanbanStore.deleteCard(projectId, card.id);
      showSuccess("Task deleted");
    } catch (error) {
      showError({ title: "Failed to delete task", message: String(error) });
    }
  }

  function handleNavigateToSession(sessionId: string) {
    onNavigateToSession?.(sessionId);
  }

  async function handleModalSave(data: { title: string; spec: string; status: KanbanStatus }) {
    try {
      if (modalMode === "create") {
        await kanbanStore.addCard(projectId, data);
        showSuccess("Task created");
      } else if (modalCard) {
        await kanbanStore.updateCard(projectId, modalCard.id, data);
        showSuccess("Task updated");
      }
      modalOpen = false;
    } catch (error) {
      showError({ title: "Failed to save task", message: String(error) });
    }
  }

  async function handleModalDelete() {
    if (!modalCard) return;
    modalOpen = false;
    await handleDeleteCard(modalCard);
  }
</script>

<div class="flex flex-col h-full bg-white">
  <!-- Minimal Header -->
  <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
    <h2 class="font-medium text-gray-700 text-sm">Tasks</h2>
    <button
      onclick={loadCards}
      class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
      title="Refresh"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        ></path>
      </svg>
    </button>
  </div>

  <!-- Board -->
  <div class="flex-1 overflow-hidden py-4">
    {#if isLoading}
      <div class="flex items-center justify-center h-full">
        <div class="text-gray-400 text-sm">Loading...</div>
      </div>
    {:else}
      <KanbanBoard
        columns={$columnsStore}
        onAddCard={handleAddCard}
        onEditCard={handleEditCard}
        onDispatchCard={handleDispatchCard}
        onStatusChange={handleStatusChange}
        onMoveNext={handleMoveNext}
        onDeleteCard={handleDeleteCard}
        onNavigateToSession={handleNavigateToSession}
      />
    {/if}
  </div>
</div>

<!-- Card Modal -->
<KanbanCardModal
  open={modalOpen}
  card={modalCard}
  mode={modalMode}
  initialStatus={modalInitialStatus}
  onClose={() => (modalOpen = false)}
  onSave={handleModalSave}
  onDelete={handleModalDelete}
/>
