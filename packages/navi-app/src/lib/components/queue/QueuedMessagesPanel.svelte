<script lang="ts">
  import { messageQueue } from "../../stores/session";
  import type { QueuedMessage } from "../../stores/types";
  import QueuedMessageItem from "./QueuedMessageItem.svelte";
  import QueuedMessageEditor from "./QueuedMessageEditor.svelte";

  interface Props {
    sessionId: string;
  }

  let { sessionId }: Props = $props();

  let isExpanded = $state(false);
  let editingMessage = $state<QueuedMessage | null>(null);
  let dragFromIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  let queuedMessages = $derived(
    $messageQueue.filter((m) => m.sessionId === sessionId)
  );

  function handleEdit(message: QueuedMessage) {
    editingMessage = message;
  }

  function handleSaveEdit(id: string, text: string) {
    messageQueue.updateText(id, text);
    editingMessage = null;
  }

  function handleCancelEdit() {
    editingMessage = null;
  }

  function handleRemove(id: string) {
    messageQueue.remove(id);
  }

  function handleClearAll() {
    messageQueue.clearSession(sessionId);
  }

  function handleDragStart(index: number) {
    dragFromIndex = index;
  }

  function handleDragOver(index: number) {
    dragOverIndex = index;
  }

  function handleDragEnd() {
    if (dragFromIndex !== null && dragOverIndex !== null && dragFromIndex !== dragOverIndex) {
      messageQueue.reorder(sessionId, dragFromIndex, dragOverIndex);
    }
    dragFromIndex = null;
    dragOverIndex = null;
  }
</script>

{#if queuedMessages.length > 0}
  <div class="mb-2">
    <!-- Collapsed: just a subtle inline bar -->
    <button
      onclick={() => (isExpanded = !isExpanded)}
      class="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 transition-colors py-1"
    >
      <div class="flex items-center gap-1.5">
        <svg
          class="w-3 h-3 transition-transform {isExpanded ? 'rotate-90' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span>{queuedMessages.length} queued</span>
      </div>
      {#if isExpanded}
        <span
          role="button"
          tabindex="0"
          onclick={(e) => {
            e.stopPropagation();
            handleClearAll();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              handleClearAll();
            }
          }}
          class="text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          clear
        </span>
      {/if}
    </button>

    <!-- Expanded: minimal list -->
    {#if isExpanded}
      <div class="space-y-1 mt-1 max-h-32 overflow-y-auto" role="list">
        {#each queuedMessages as message, index (message.id)}
          <QueuedMessageItem
            {message}
            {index}
            isDragging={dragFromIndex === index}
            onEdit={handleEdit}
            onRemove={handleRemove}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if editingMessage}
  <QueuedMessageEditor
    message={editingMessage}
    onSave={handleSaveEdit}
    onCancel={handleCancelEdit}
  />
{/if}
