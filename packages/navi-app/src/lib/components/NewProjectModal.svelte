<script lang="ts">
  interface Props {
    open: boolean;
    defaultProjectsDir: string;
    onClose: () => void;
    onCreate: () => void;
    onPickDirectory: () => void;
    projectCreationMode: "quick" | "browse";
    newProjectQuickName: string;
    newProjectPath: string;
    newProjectName: string;
    onModeChange: (mode: "quick" | "browse") => void;
    onQuickNameChange: (name: string) => void;
    onPathChange: (path: string) => void;
    onNameChange: (name: string) => void;
  }

  let {
    open,
    defaultProjectsDir,
    onClose,
    onCreate,
    onPickDirectory,
    projectCreationMode,
    newProjectQuickName,
    newProjectPath,
    newProjectName,
    onModeChange,
    onQuickNameChange,
    onPathChange,
    onNameChange,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") onCreate();
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm">
    <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="px-6 py-5 border-b border-gray-100">
        <h3 class="font-serif text-2xl text-gray-900">Create New Workspace</h3>
      </div>

      <div class="px-6 pt-4 flex gap-1 border-b border-gray-100">
        <button 
          onclick={() => onModeChange("quick")}
          class={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${projectCreationMode === 'quick' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
        >
          Quick Start
        </button>
        <button 
          onclick={() => onModeChange("browse")}
          class={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${projectCreationMode === 'browse' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
        >
          Existing Folder
        </button>
      </div>

      <div class="p-6 space-y-5">
        {#if projectCreationMode === "quick"}
          <div class="space-y-1.5">
            <label for="quick-name" class="text-xs font-medium text-gray-700">Workspace Name</label>
            <!-- svelte-ignore a11y_autofocus -->
            <input 
              id="quick-name"
              type="text" 
              value={newProjectQuickName}
              oninput={(e) => onQuickNameChange(e.currentTarget.value)}
              placeholder="e.g. my-new-app" 
              onkeydown={handleKeydown}
              autofocus
              class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"
            />
          </div>
          <div class="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            <span class="font-medium">Location:</span> <span class="font-mono">{defaultProjectsDir}/{newProjectQuickName.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "project-name"}</span>
          </div>
        {:else}
          <div class="space-y-1.5">
            <label for="browse-path" class="text-xs font-medium text-gray-700">Workspace Directory</label>
            <div class="flex gap-2">
              <input 
                id="browse-path"
                type="text" 
                value={newProjectPath}
                oninput={(e) => onPathChange(e.currentTarget.value)}
                placeholder="/path/to/directory" 
                class="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors font-mono placeholder:text-gray-400"
              />
              <button onclick={onPickDirectory} class="bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 rounded-lg border border-gray-300 transition-colors" aria-label="Browse for directory">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path></svg>
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="project-name" class="text-xs font-medium text-gray-700">Project Name</label>
            <input 
              id="project-name"
              type="text" 
              value={newProjectName}
              oninput={(e) => onNameChange(e.currentTarget.value)}
              placeholder="e.g. Website Redesign" 
              class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"
            />
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
        <button onclick={onClose} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
        <button onclick={onCreate} class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95">Create Workspace</button>
      </div>
    </div>
  </div>
{/if}
