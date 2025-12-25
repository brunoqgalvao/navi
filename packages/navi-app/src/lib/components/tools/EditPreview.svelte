<script lang="ts">
  import DiffViewer from "../DiffViewer.svelte";

  interface Props {
    filePath: string;
    oldString?: string;
    newString?: string;
    edits?: Array<{ old_string: string; new_string: string }>;
    replaceAll?: boolean;
    onPreview?: (path: string) => void;
  }

  let { filePath, oldString, newString, edits, replaceAll, onPreview }: Props = $props();

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

  const isMultiEdit = $derived(!!edits && edits.length > 0);
  const editCount = $derived(isMultiEdit ? edits!.length : 1);
</script>

<div class="space-y-2">
  <div class="flex items-center gap-2">
    <span class="text-xs text-gray-500">Editing</span>
    <button
      onclick={() => onPreview?.(filePath)}
      class="text-xs font-mono text-amber-600 hover:text-amber-800 hover:underline truncate max-w-md"
      title={filePath}
    >
      {truncatePath(filePath)}
    </button>
    {#if isMultiEdit}
      <span class="text-[10px] text-gray-400">({editCount} changes)</span>
    {:else if replaceAll}
      <span class="text-[10px] text-gray-400">(replace all)</span>
    {/if}
    <button
      onclick={() => showPreview = !showPreview}
      class="text-[10px] text-blue-500 hover:text-blue-700 hover:underline ml-auto"
    >
      {showPreview ? "hide" : "preview"}
    </button>
  </div>

  {#if showPreview}
    {#if isMultiEdit}
      <div class="space-y-2">
        {#each edits! as edit, idx}
          <div class="border border-gray-200 rounded overflow-hidden">
            <div class="text-[10px] text-gray-500 bg-gray-100 px-2 py-1 border-b border-gray-200">
              Change {idx + 1}
            </div>
            <DiffViewer
              oldText={edit.old_string || ""}
              newText={edit.new_string || ""}
              fileName={getFileName(filePath)}
              maxHeight="200px"
            />
          </div>
        {/each}
      </div>
    {:else if oldString !== undefined}
      <DiffViewer
        oldText={oldString || ""}
        newText={newString || ""}
        fileName={getFileName(filePath)}
        maxHeight="300px"
      />
    {/if}
  {/if}
</div>
