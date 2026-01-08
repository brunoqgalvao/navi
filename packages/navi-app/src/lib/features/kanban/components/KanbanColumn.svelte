<script lang="ts">
  import type { KanbanCard as KanbanCardType, KanbanStatus, KanbanColumn } from "../types";
  import KanbanCard from "./KanbanCard.svelte";

  interface Props {
    column: KanbanColumn;
    cards: KanbanCardType[];
    onAddCard?: (status: KanbanStatus, title: string) => void;
    onEditCard?: (card: KanbanCardType) => void;
    onDispatchCard?: (card: KanbanCardType) => void;
    onMoveNext?: (card: KanbanCardType) => void;
    onDeleteCard?: (card: KanbanCardType) => void;
    onNavigateToSession?: (sessionId: string) => void;
    onDropCard?: (cardId: string, toStatus: KanbanStatus) => void;
  }

  let {
    column,
    cards,
    onAddCard,
    onEditCard,
    onDispatchCard,
    onMoveNext,
    onDeleteCard,
    onNavigateToSession,
    onDropCard,
  }: Props = $props();

  let isDragOver = $state(false);
  let isAddingCard = $state(false);
  let newCardTitle = $state("");

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const cardId = e.dataTransfer?.getData("text/plain");
    if (cardId && onDropCard) {
      onDropCard(cardId, column.id);
    }
  }

  function handleAddSubmit(e?: Event) {
    e?.preventDefault();
    if (newCardTitle.trim() && onAddCard) {
      onAddCard(column.id, newCardTitle.trim());
      newCardTitle = "";
      isAddingCard = false;
    }
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddSubmit();
    } else if (e.key === "Escape") {
      isAddingCard = false;
      newCardTitle = "";
    }
  }
</script>

<div
  class="flex flex-col min-w-[260px] w-[260px] flex-shrink-0 h-full {isDragOver ? 'ring-2 ring-accent-400 ring-opacity-50 rounded-lg' : ''}"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label={column.title}
>
  <!-- Column header -->
  <div class="flex items-center justify-between px-2 py-2 mb-2">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold text-sm text-gray-700">{column.title}</h3>
      <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{cards.length}</span>
    </div>
    {#if onAddCard && (column.id === "backlog" || column.id === "spec")}
      <button
        onclick={() => { isAddingCard = true; }}
        class="p-1 text-gray-400 hover:text-accent-500 rounded transition-colors"
        title="Add task"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Cards -->
  <div class="flex-1 overflow-y-auto space-y-2 px-1 pb-2">
    {#each cards as card (card.id)}
      <KanbanCard
        {card}
        onEdit={onEditCard}
        onDispatch={onDispatchCard}
        {onMoveNext}
        onDelete={onDeleteCard}
        {onNavigateToSession}
      />
    {/each}

    <!-- Ghost card for adding (inline) -->
    {#if isAddingCard}
      <form onsubmit={handleAddSubmit} class="bg-white border border-accent-300 rounded-lg p-2">
        <input
          type="text"
          bind:value={newCardTitle}
          onkeydown={handleAddKeydown}
          onblur={() => { if (!newCardTitle.trim()) isAddingCard = false; }}
          placeholder={column.id === "backlog" ? "Idea or future task..." : "Task title..."}
          class="w-full text-sm text-gray-900 placeholder-gray-400 outline-none"
          autofocus
        />
        <div class="flex items-center gap-1 mt-2">
          <button
            type="submit"
            disabled={!newCardTitle.trim()}
            class="px-2 py-1 text-xs font-medium text-white bg-accent-500 hover:bg-accent-600 disabled:opacity-50 rounded transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onclick={() => { isAddingCard = false; newCardTitle = ""; }}
            class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    {:else if (column.id === "backlog" || column.id === "spec") && cards.length === 0}
      <!-- Empty state for backlog/spec columns -->
      <button
        onclick={() => { isAddingCard = true; }}
        class="w-full border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-sm text-gray-400 hover:border-accent-300 hover:text-accent-500 transition-colors"
      >
        + {column.id === "backlog" ? "Add an idea" : "Add a task"}
      </button>
    {/if}
  </div>
</div>
