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
          return `${filename} Row ${source.rows[0]}, ${source.columns[0]}`;
        }
        return filename;
      case "xlsx":
        if (source.sheet && source.rows) {
          return `${filename} [${source.sheet}] Row ${source.rows[0]}`;
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
        return filename || "Reference";
    }
  }
</script>

<div
  class="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs transition-colors group max-w-[200px]"
>
  <svg
    class="w-3 h-3 text-indigo-400 flex-shrink-0"
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

  <div class="flex flex-col min-w-0">
    <span class="text-indigo-700 font-medium truncate" title={reference.text}>
      "{reference.truncatedText}"
    </span>
    <span class="text-[10px] text-indigo-500 truncate" title={getSourceLabel()}>
      {getSourceLabel()}
    </span>
  </div>

  {#if onRemove}
    <button
      onclick={onRemove}
      class="text-indigo-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      title="Remove reference"
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
