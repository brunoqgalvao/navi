<script lang="ts">
  import DiffViewer from "../DiffViewer.svelte";

  interface Props {
    filePath: string;
    content: string;
    onPreview?: (path: string) => void;
  }

  let { filePath, content, onPreview }: Props = $props();

  let showPreview = $state(false);

  function getFileName(path: string): string {
    return path?.split("/").pop() || path || "";
  }

  function truncatePath(path: string, maxLen = 50): string {
    if (!path || path.length <= maxLen) return path;
    const parts = path.split("/");
    if (parts.length <= 3) return path;
    return `.../${parts.slice(-3).join("/")}`;
  }

  const lineCount = $derived(content?.split("\n").length || 0);
</script>

<div class="space-y-2">
  <div class="flex items-center gap-2">
    <span class="text-xs text-gray-500">Writing</span>
    <button
      onclick={() => onPreview?.(filePath)}
      class="text-xs font-mono text-green-600 hover:text-green-800 hover:underline truncate max-w-md"
      title={filePath}
    >
      {truncatePath(filePath)}
    </button>
    <span class="text-[10px] text-gray-400">({lineCount} lines)</span>
    <button
      onclick={() => showPreview = !showPreview}
      class="text-[10px] text-blue-500 hover:text-blue-700 hover:underline ml-auto"
    >
      {showPreview ? "hide" : "preview"}
    </button>
  </div>

  {#if showPreview && content}
    <DiffViewer
      oldText=""
      newText={content}
      fileName={getFileName(filePath)}
      maxHeight="400px"
    />
  {/if}
</div>
