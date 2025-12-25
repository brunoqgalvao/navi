<script lang="ts">
  interface Props {
    files: { path: string; name: string }[];
    onPreview?: (path: string) => void;
    onRemove?: (path: string) => void;
    removable?: boolean;
    size?: "sm" | "md";
  }

  let { files, onPreview, onRemove, removable = false, size = "md" }: Props = $props();

  const sizeClasses = {
    sm: "px-2 py-1 text-xs gap-1",
    md: "px-2.5 py-1.5 text-xs gap-1.5"
  };

  const iconSize = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5"
  };

  const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];

  function isImage(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return imageExtensions.includes(ext);
  }

  function getImageUrl(path: string): string {
    return `http://localhost:3001/api/fs/read?path=${encodeURIComponent(path)}&raw=true`;
  }
</script>

<div class="flex flex-wrap gap-1.5">
  {#each files as file}
    {#if isImage(file.name)}
      <!-- Image thumbnail -->
      <div class="relative group/file">
        <button
          type="button"
          onclick={() => onPreview?.(file.path)}
          class="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Click to preview"
        >
          <img
            src={getImageUrl(file.path)}
            alt={file.name}
            class="w-full h-full object-cover"
          />
        </button>
        {#if removable && onRemove}
          <button
            onclick={() => onRemove?.(file.path)}
            class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-gray-900 text-white rounded-full flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity shadow-sm"
            title="Remove"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        {/if}
      </div>
    {:else}
      <!-- Regular file -->
      <div class="flex items-center {sizeClasses[size]} bg-white/80 hover:bg-white border border-gray-200 rounded-lg text-gray-700 transition-colors group/file">
        <svg class="{iconSize[size]} text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>

        {#if onPreview}
          <button
            onclick={() => onPreview?.(file.path)}
            class="max-w-[150px] truncate font-medium hover:text-gray-900 transition-colors"
            title={file.path}
          >
            {file.name}
          </button>
        {:else}
          <span class="max-w-[150px] truncate" title={file.path}>{file.name}</span>
        {/if}

        {#if removable && onRemove}
          <button
            onclick={() => onRemove?.(file.path)}
            class="text-gray-400 hover:text-gray-600 opacity-0 group-hover/file:opacity-100 transition-opacity"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        {:else if onPreview}
          <svg class="w-3 h-3 text-gray-400 group-hover/file:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
          </svg>
        {/if}
      </div>
    {/if}
  {/each}
</div>
