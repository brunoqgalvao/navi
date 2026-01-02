<script lang="ts">
  import type { ChatReference } from "../stores/types";

  interface Props {
    reference: ChatReference;
    onRemove?: () => void;
    onNavigate?: (sessionId: string) => void;
  }

  let { reference, onRemove, onNavigate }: Props = $props();

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
</script>

<div
  class="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs transition-colors group max-w-[240px]"
>
  <!-- Chat icon -->
  <svg
    class="w-3 h-3 text-blue-500 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    ></path>
  </svg>

  <button
    onclick={() => onNavigate?.(reference.sessionId)}
    class="flex flex-col min-w-0 text-left hover:underline"
    title="Click to open chat"
  >
    <span class="text-blue-700 font-medium truncate">
      {reference.title}
    </span>
    <span class="text-[10px] text-blue-500 truncate">
      {reference.messageCount} msgs · {formatDate(reference.updatedAt)}
      {#if reference.projectName}
        · {reference.projectName}
      {/if}
    </span>
  </button>

  {#if onRemove}
    <button
      onclick={onRemove}
      class="text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      title="Remove chat reference"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        ></path>
      </svg>
    </button>
  {/if}
</div>
