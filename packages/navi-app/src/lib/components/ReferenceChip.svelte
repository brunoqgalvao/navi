<script lang="ts">
  import type { TextReference } from "../stores/types";

  interface Props {
    reference: TextReference;
    onRemove?: () => void;
  }

  let { reference, onRemove }: Props = $props();

  function getSourceLabel(): string {
    const { source } = reference;
    const filename = source.path?.split("/").pop() || "";

    switch (source.type) {
      case "code":
      case "markdown":
      case "text":
        if (source.startLine) {
          const lineRef =
            source.endLine && source.endLine !== source.startLine
              ? `L${source.startLine}-${source.endLine}`
              : `L${source.startLine}`;
          return `${filename}:${lineRef}`;
        }
        return filename;
      case "csv":
        if (source.rows && source.columns) {
          return `${filename} Row ${source.rows[0]}`;
        }
        return filename;
      case "xlsx":
        if (source.sheet && source.rows) {
          return `${filename} [${source.sheet}]`;
        }
        return filename;
      case "json":
        if (source.jsonPath) {
          return `${filename} ${source.jsonPath}`;
        }
        return filename;
      case "url":
        try {
          return source.url ? new URL(source.url).hostname : "Web";
        } catch {
          return source.url || "Web";
        }
      default:
        return filename || "Quote";
    }
  }

  // Build tooltip text - show the quote content
  function getTooltipText(): string {
    const preview = reference.truncatedText.length > 100
      ? reference.truncatedText.slice(0, 100) + "..."
      : reference.truncatedText;
    return `"${preview}"`;
  }
</script>

<div
  class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs transition-colors group cursor-default"
  title={getTooltipText()}
>
  <svg
    class="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    ></path>
  </svg>

  <span class="text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
    {getSourceLabel()}
  </span>

  {#if onRemove}
    <button
      onclick={(e) => { e.stopPropagation(); onRemove?.(); }}
      class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 -mr-0.5"
      title="Remove"
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
