<script lang="ts">
  import type { KanbanCard } from "../types";

  interface Props {
    card: KanbanCard;
    onEdit?: (card: KanbanCard) => void;
    onDispatch?: (card: KanbanCard) => void;
    onMoveNext?: (card: KanbanCard) => void;
    onDelete?: (card: KanbanCard) => void;
    onNavigateToSession?: (sessionId: string) => void;
  }

  let { card, onEdit, onDispatch, onMoveNext, onDelete, onNavigateToSession }: Props = $props();

  function handleClick() {
    if (card.session_id && onNavigateToSession) {
      onNavigateToSession(card.session_id);
    } else {
      onEdit?.(card);
    }
  }

  function handleAction(e: MouseEvent) {
    e.stopPropagation();
    if (card.status === "spec" && !card.session_id) {
      onDispatch?.(card);
    } else if (card.status === "review") {
      onMoveNext?.(card);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group relative bg-white border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md {card.blocked ? 'border-red-400 bg-red-50/50' : 'border-gray-200 hover:border-accent-300'}"
  onclick={handleClick}
  draggable="true"
  ondragstart={(e) => e.dataTransfer?.setData("text/plain", card.id)}
>
  <!-- Blocked indicator -->
  {#if card.blocked}
    <div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
  {/if}

  <!-- Title -->
  <h4 class="font-medium text-gray-900 text-sm leading-tight mb-1 line-clamp-2">
    {card.title}
  </h4>

  <!-- Status message when blocked -->
  {#if card.blocked && card.status_message}
    <p class="text-xs text-red-600 mt-2 flex items-center gap-1">
      <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <span class="truncate">{card.status_message}</span>
    </p>
  {/if}

  <!-- Session link -->
  {#if card.session_id}
    <div class="flex items-center gap-1 mt-2 text-xs text-gray-400">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      <span class="truncate">{card.session_title || "Chat"}</span>
    </div>
  {/if}

  <!-- Quick action button (on hover) -->
  <div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
    {#if card.status === "spec" && !card.session_id}
      <button
        onclick={handleAction}
        class="px-2 py-1 text-xs font-medium text-white bg-accent-500 hover:bg-accent-600 rounded transition-colors"
        title="Start task"
      >
        Start →
      </button>
    {:else if card.status === "review" && !card.blocked}
      <button
        onclick={handleAction}
        class="px-2 py-1 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded transition-colors"
        title="Mark as done"
      >
        Done ✓
      </button>
    {:else if card.blocked}
      <button
        onclick={handleAction}
        class="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
        title="Respond to agent"
      >
        Respond
      </button>
    {/if}
  </div>
</div>
