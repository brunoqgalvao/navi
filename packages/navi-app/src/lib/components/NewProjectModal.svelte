<script lang="ts">
  // Hardcoded templates
  const TEMPLATES = [
    {
      id: "vibe-coding",
      name: "Vibe Coding",
      description: "Full vibe coding pipeline with Spec, Plan, and Implement agents",
      icon: "🚀",
      tags: ["apps", "mvp", "features"],
    },
    {
      id: "nano-banana",
      name: "Image Generation",
      description: "AI image generation with creative and branding agents",
      icon: "🎨",
      tags: ["images", "design", "logos"],
    },
  ];

  interface Props {
    open: boolean;
    defaultProjectsDir: string;
    onClose: () => void;
    onCreate: () => void;
    onPickDirectory: () => void;
    onCreateFromTemplate?: (templateId: string, name: string) => void;
    projectCreationMode: "quick" | "browse" | "template";
    newProjectQuickName: string;
    newProjectPath: string;
    newProjectName: string;
    onModeChange: (mode: "quick" | "browse" | "template") => void;
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
    onCreateFromTemplate,
    projectCreationMode,
    newProjectQuickName,
    newProjectPath,
    newProjectName,
    onModeChange,
    onQuickNameChange,
    onPathChange,
    onNameChange,
  }: Props = $props();

// Template creation state
  let selectedTemplate = $state<string | null>(null);
  let templateProjectName = $state("");
  let templateCreating = $state(false);
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      if (projectCreationMode === "template") {
        handleCreateFromTemplate();
      } else {
        onCreate();
      }
    }
  }

async function handleCreateFromTemplate() {
    if (!selectedTemplate || !templateProjectName.trim() || !onCreateFromTemplate) return;
    templateCreating = true;
    onCreateFromTemplate(selectedTemplate, templateProjectName.trim());
    templateCreating = false;
    selectedTemplate = null;
    templateProjectName = "";
  }

  // Reset fields when modal closes
  $effect(() => {
    if (!open) {
      selectedTemplate = null;
      templateProjectName = "";
    }
  });
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30">
    <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="px-6 py-5 border-b border-gray-100">
        <h3 class="font-serif text-2xl text-gray-900">
          Create New Workspace
        </h3>
      </div>

      <div class="px-6 pt-4 flex gap-1 border-b border-gray-100">
        <button
          onclick={() => onModeChange("quick")}
          class={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${projectCreationMode === 'quick' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
        >
          Quick Start
        </button>
{#if onCreateFromTemplate}
          <button
            onclick={() => onModeChange("template")}
            class={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${projectCreationMode === 'template' ? 'text-emerald-600 border-emerald-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
            Template
          </button>
        {/if}
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
        {:else if projectCreationMode === "browse"}
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
        {:else if projectCreationMode === "template"}
          <div class="space-y-3">
            <label class="text-xs font-medium text-gray-700">Choose a Template</label>
            <div class="grid gap-2">
              {#each TEMPLATES as template}
                <button
                  onclick={() => selectedTemplate = template.id}
                  class={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    selectedTemplate === template.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div class="flex items-start gap-3">
                    <span class="text-2xl">{template.icon}</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-gray-900">{template.name}</div>
                      <div class="text-xs text-gray-500 mt-0.5">{template.description}</div>
                      <div class="flex gap-1 mt-1.5">
                        {#each template.tags as tag}
                          <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{tag}</span>
                        {/each}
                      </div>
                    </div>
                    {#if selectedTemplate === template.id}
                      <svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                      </svg>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>

          {#if selectedTemplate}
            <div class="space-y-1.5">
              <label for="template-name" class="text-xs font-medium text-gray-700">Project Name</label>
              <!-- svelte-ignore a11y_autofocus -->
              <input
                id="template-name"
                type="text"
                bind:value={templateProjectName}
                placeholder="e.g. my-awesome-app"
                onkeydown={handleKeydown}
                autofocus
                class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"
              />
            </div>

            <div class="text-xs text-gray-500 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
              <span class="font-medium text-emerald-700">Location:</span> <span class="font-mono text-emerald-600">{defaultProjectsDir}/{templateProjectName.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "project-name"}</span>
            </div>
          {/if}
        {/if}
      </div>

      <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
        <button onclick={onClose} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
        {#if projectCreationMode === "template"}
          <button
            onclick={handleCreateFromTemplate}
            disabled={!selectedTemplate || !templateProjectName.trim() || templateCreating}
            class="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {templateCreating ? "Creating..." : "Create from Template"}
          </button>
        {:else}
          <button onclick={onCreate} class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95">Create Workspace</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
