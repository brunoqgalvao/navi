<script lang="ts">
  import type { QueuedMessage } from "../../stores/types";

  interface Props {
    message: QueuedMessage;
    index: number;
    isDragging?: boolean;
    onEdit: (message: QueuedMessage) => void;
    onRemove: (id: string) => void;
    onDragStart: (index: number) => void;
    onDragOver: (index: number) => void;
    onDragEnd: () => void;
  }

  let {
    message,
    index,
    isDragging = false,
    onEdit,
    onRemove,
    onDragStart,
    onDragOver,
    onDragEnd,
  }: Props = $props();

  function truncateText(text: string, maxLength: number = 50): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + "...";
  }

  function handleDragStart(e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
    onDragStart(index);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    onDragOver(index);
  }
</script>

<div
  role="listitem"
  draggable="true"
  ondragstart={handleDragStart}
  ondragover={handleDragOver}
  ondragend={onDragEnd}
  class="group flex items-center gap-1.5 text-xs cursor-grab active:cursor-grabbing
    {isDragging ? 'opacity-50' : ''}"
>
  <!-- Drag handle + index -->
  <span class="text-gray-300 group-hover:text-gray-400 select-none">{index + 1}.</span>

  <!-- Message preview -->
  <span class="flex-1 text-gray-600 truncate">
    {truncateText(message.text)}
  </span>

  <!-- Actions -->
  <div class="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
    <button
      onclick={() => onEdit(message)}
      class="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
      title="Edit"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
    <button
      onclick={() => message.id && onRemove(message.id)}
      class="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
      title="Remove"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</div>
