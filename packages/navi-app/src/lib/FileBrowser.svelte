<script lang="ts">
  import { onMount } from "svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import { attachedFiles } from "./stores";
  import { getApiBase } from "./config";
  import { showError } from "./errorHandler";

  interface FileEntry {
    name: string;
    type: "file" | "directory";
    path: string;
  }

  interface Props {
    rootPath: string;
    onSelect?: (path: string) => void;
    onPreview?: (path: string) => void;
    onEdit?: (path: string) => void;
  }

  let { rootPath, onSelect, onPreview, onEdit }: Props = $props();

  let isDraggingOver = $state(false);
  let dragCounter = $state(0);

  function handleDragStart(e: DragEvent, entry: FileEntry) {
    if (e.dataTransfer) {
      e.dataTransfer.setData("application/x-file-path", entry.path);
      e.dataTransfer.setData("text/plain", entry.path);
      e.dataTransfer.effectAllowed = "copy";
    }
  }

  function handleFileBrowserDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer?.types.includes("Files")) {
      isDraggingOver = true;
    }
  }

  function handleFileBrowserDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      isDraggingOver = false;
    }
  }

  function handleFileBrowserDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  async function handleFileBrowserDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    dragCounter = 0;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && rootPath) {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetDir", rootPath);

        try {
          const res = await fetch(`${getApiBase()}/fs/upload`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            attachedFiles.add({ path: data.path, name: data.name, type: "file" });
            loadRoot();
          } else {
            showError({
              title: "Upload Failed",
              message: data.error || `Failed to upload ${file.name}`
            });
          }
        } catch (err) {
          showError({
            title: "Upload Error",
            message: `Failed to upload ${file.name}`,
            error: err
          });
        }
      }
    }
  }

  let currentPath = $state("");
  let entries = $state<FileEntry[]>([]);
  let loading = $state(false);
  let error = $state("");
  let expandedDirs = $state<Set<string>>(new Set());
  let dirContents = $state<Map<string, FileEntry[]>>(new Map());

  let contextMenu = $state<{ x: number; y: number; entry: FileEntry } | null>(null);

  const icons = {
    preview: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>`,
    edit: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>`,
    folder: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>`,
    attach: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>`,
  };

  function attachToChat(entry: FileEntry) {
    attachedFiles.add({ path: entry.path, name: entry.name, type: entry.type });
  }

  // Check if a file is editable (code/text file)
  function isEditable(entry: FileEntry): boolean {
    if (entry.type !== "file") return false;
    const ext = entry.name.split(".").pop()?.toLowerCase() || "";
    const editableExtensions = [
      "js", "ts", "jsx", "tsx", "svelte", "vue", "py", "rs", "go", "java", "c", "cpp", "h",
      "css", "scss", "sass", "less", "html", "xml", "yaml", "yml", "toml", "sh", "bash", "zsh",
      "sql", "graphql", "prisma", "json", "md", "mdx", "markdown", "txt", "env", "gitignore",
      "dockerfile", "makefile"
    ];
    return editableExtensions.includes(ext) || entry.name.startsWith(".");
  }

  function getContextMenuItems(entry: FileEntry) {
    return [
      {
        label: "Attach to Chat",
        icon: icons.attach,
        onclick: () => attachToChat(entry),
      },
      {
        label: "Preview",
        icon: icons.preview,
        onclick: () => onPreview?.(entry.path),
        show: entry.type === "file",
      },
      {
        label: "Edit",
        icon: icons.edit,
        onclick: () => onEdit?.(entry.path),
        show: isEditable(entry),
      },
      {
        label: "Reveal in Finder",
        icon: icons.folder,
        onclick: () => revealInFinder(entry.path),
      },
    ];
  }

  const fileIcons: Record<string, string> = {
    ts: "text-blue-500",
    tsx: "text-blue-500",
    js: "text-yellow-500",
    jsx: "text-yellow-500",
    svelte: "text-orange-500",
    vue: "text-green-500",
    py: "text-blue-400",
    rs: "text-orange-600",
    go: "text-cyan-500",
    json: "text-yellow-600",
    md: "text-gray-500",
    css: "text-pink-500",
    html: "text-orange-400",
    default: "text-gray-400"
  };

  function getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    return fileIcons[ext] || fileIcons.default;
  }

  async function loadDirectory(path: string): Promise<FileEntry[]> {
    const res = await fetch(`${getApiBase()}/fs/list?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.entries;
  }

  async function loadRoot() {
    if (!rootPath) return;
    loading = true;
    error = "";
    try {
      currentPath = rootPath;
      entries = await loadDirectory(rootPath);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load directory";
    } finally {
      loading = false;
    }
  }

  async function toggleDirectory(entry: FileEntry) {
    if (expandedDirs.has(entry.path)) {
      expandedDirs.delete(entry.path);
      expandedDirs = new Set(expandedDirs);
    } else {
      try {
        const contents = await loadDirectory(entry.path);
        dirContents.set(entry.path, contents);
        dirContents = new Map(dirContents);
        expandedDirs.add(entry.path);
        expandedDirs = new Set(expandedDirs);
      } catch (e) {
        showError({
          title: "Directory Error",
          message: `Failed to load ${entry.name}`,
          error: e
        });
      }
    }
  }

  function handleFileClick(entry: FileEntry) {
    if (entry.type === "directory") {
      toggleDirectory(entry);
    } else {
      onSelect?.(entry.path);
      onPreview?.(entry.path);
    }
  }

  function handleContextMenu(e: MouseEvent, entry: FileEntry) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, entry };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function revealInFinder(path: string) {
    try {
      await fetch(`${getApiBase()}/fs/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch (e) {
      showError({
        title: "Reveal Failed",
        message: "Failed to reveal file in Finder",
        error: e
      });
    }
  }

  function goUp() {
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    currentPath = parent;
    loadDirectory(parent).then(e => entries = e).catch(console.error);
    expandedDirs.clear();
    expandedDirs = new Set(expandedDirs);
    dirContents.clear();
    dirContents = new Map(dirContents);
  }

  $effect(() => {
    if (rootPath) {
      loadRoot();
    }
  });
</script>

{#snippet fileEntry(entry: FileEntry, depth: number)}
  {@const isExpanded = expandedDirs.has(entry.path)}
  {@const contents = dirContents.get(entry.path) || []}
  {@const indent = Math.min(depth, 8)}

  <div>
    <button
      onclick={() => handleFileClick(entry)}
      oncontextmenu={(e) => handleContextMenu(e, entry)}
      ondragstart={(e) => handleDragStart(e, entry)}
      draggable="true"
      class="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-left group cursor-grab active:cursor-grabbing"
      style="padding-left: {8 + indent * 12}px"
    >
      {#if entry.type === "directory"}
        <svg class={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
        <svg class="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"></path>
        </svg>
      {:else}
        <span class="w-3 shrink-0"></span>
        <svg class={`w-4 h-4 shrink-0 ${getFileIcon(entry.name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
      {/if}
      <span class="text-[13px] text-gray-700 truncate flex-1">{entry.name}</span>

      {#if entry.type === "file"}
        <span class="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          preview
        </span>
      {/if}
    </button>

    {#if entry.type === "directory" && isExpanded}
      {#if contents.length === 0}
        <div class="text-xs text-gray-400 py-1" style="padding-left: {20 + indent * 12}px">Empty</div>
      {:else}
        {#each contents as child}
          {@render fileEntry(child, depth + 1)}
        {/each}
      {/if}
    {/if}
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="h-full flex flex-col bg-white relative {isDraggingOver ? 'ring-2 ring-inset ring-blue-400' : ''}"
  ondragenter={handleFileBrowserDragEnter}
  ondragleave={handleFileBrowserDragLeave}
  ondragover={handleFileBrowserDragOver}
  ondrop={handleFileBrowserDrop}
>
  {#if isDraggingOver}
    <div class="absolute inset-0 bg-blue-50/80 z-20 flex items-center justify-center pointer-events-none">
      <div class="flex items-center gap-2 text-blue-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
        <span class="text-sm font-medium">Drop files to attach</span>
      </div>
    </div>
  {/if}
  <div class="h-10 px-3 border-b border-gray-200 flex items-center gap-2 bg-gray-50/50 shrink-0">
    <button
      onclick={goUp}
      disabled={currentPath === "/" || currentPath === rootPath}
      class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
      title="Go up"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
    </button>
    <button
      onclick={loadRoot}
      class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
      title="Refresh"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
    </button>
    <span class="text-xs text-gray-500 truncate flex-1 font-mono" title={currentPath}>
      {currentPath.replace(rootPath, "~") || "~"}
    </span>
  </div>

  <div class="flex-1 overflow-auto p-1">
    {#if loading}
      <div class="flex items-center justify-center py-8">
        <svg class="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
    {:else if error}
      <div class="text-center py-8 text-sm text-red-500">{error}</div>
    {:else if entries.length === 0}
      <div class="text-center py-8 text-sm text-gray-400">Empty directory</div>
    {:else}
      <div class="space-y-px">
        {#each entries as entry}
          {@render fileEntry(entry, 0)}
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.entry)}
    onclose={closeContextMenu}
  />
{/if}
