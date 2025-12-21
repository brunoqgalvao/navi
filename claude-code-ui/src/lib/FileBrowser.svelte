<script lang="ts">
  import { onMount } from "svelte";

  interface FileEntry {
    name: string;
    type: "file" | "directory";
    path: string;
  }

  interface Props {
    rootPath: string;
    onSelect?: (path: string) => void;
    onPreview?: (path: string) => void;
  }

  let { rootPath, onSelect, onPreview }: Props = $props();

  let currentPath = $state("");
  let entries = $state<FileEntry[]>([]);
  let loading = $state(false);
  let error = $state("");
  let expandedDirs = $state<Set<string>>(new Set());
  let dirContents = $state<Map<string, FileEntry[]>>(new Map());

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
    const res = await fetch(`http://localhost:3001/api/fs/list?path=${encodeURIComponent(path)}`);
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
        console.error("Failed to load directory:", e);
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

<div class="h-full flex flex-col bg-white">
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
          {@const isExpanded = expandedDirs.has(entry.path)}
          {@const contents = dirContents.get(entry.path) || []}
          
          <div>
            <button
              onclick={() => handleFileClick(entry)}
              class="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-left group"
            >
              {#if entry.type === "directory"}
                <svg class={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
                <svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"></path>
                </svg>
              {:else}
                <span class="w-3.5"></span>
                <svg class={`w-4 h-4 ${getFileIcon(entry.name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
              {/if}
              <span class="text-[13px] text-gray-700 truncate flex-1">{entry.name}</span>
              
              {#if entry.type === "file"}
                <span class="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  preview
                </span>
              {/if}
            </button>

            {#if entry.type === "directory" && isExpanded}
              <div class="ml-4 pl-2 border-l border-gray-200">
                {#if contents.length === 0}
                  <div class="text-xs text-gray-400 py-1 px-2">Empty</div>
                {:else}
                  {#each contents as child}
                    {@const childExpanded = expandedDirs.has(child.path)}
                    {@const childContents = dirContents.get(child.path) || []}
                    
                    <div>
                      <button
                        onclick={() => handleFileClick(child)}
                        class="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-left group"
                      >
                        {#if child.type === "directory"}
                          <svg class={`w-3 h-3 text-gray-400 transition-transform ${childExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                          </svg>
                          <svg class="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"></path>
                          </svg>
                        {:else}
                          <span class="w-3"></span>
                          <svg class={`w-3.5 h-3.5 ${getFileIcon(child.name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                        {/if}
                        <span class="text-[12px] text-gray-600 truncate flex-1">{child.name}</span>
                      </button>

                      {#if child.type === "directory" && childExpanded && childContents.length > 0}
                        <div class="ml-3 pl-2 border-l border-gray-100">
                          {#each childContents as grandchild}
                            <button
                              onclick={() => handleFileClick(grandchild)}
                              class="w-full flex items-center gap-2 px-2 py-0.5 rounded hover:bg-gray-100 transition-colors text-left"
                            >
                              {#if grandchild.type === "directory"}
                                <svg class="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                                </svg>
                                <svg class="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"></path>
                                </svg>
                              {:else}
                                <span class="w-2.5"></span>
                                <svg class={`w-3 h-3 ${getFileIcon(grandchild.name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                              {/if}
                              <span class="text-[11px] text-gray-500 truncate">{grandchild.name}</span>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
