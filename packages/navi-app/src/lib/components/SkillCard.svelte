<script lang="ts">
  import { skillsApi, type Skill } from "../api";

  interface Props {
    skill: Skill;
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleGlobal?: () => void;
    onToggleProject?: () => void;
    onToggleDefault?: (enabled: boolean) => void;
    onSync?: () => void;
    projectId?: string | null;
    compact?: boolean;
    needsSync?: boolean;
  }

  let {
    skill,
    onEdit,
    onDelete,
    onToggleGlobal,
    onToggleProject,
    onToggleDefault,
    onSync,
    projectId = null,
    compact = false,
    needsSync = false,
  }: Props = $props();

  let togglingDefault = $state(false);

  async function handleToggleDefault() {
    togglingDefault = true;
    try {
      const newValue = skill.default_enabled !== 1;
      await skillsApi.setDefaultEnabled(skill.id, newValue);
      onToggleDefault?.(newValue);
    } catch (e) {
      console.error("Toggle default failed:", e);
    } finally {
      togglingDefault = false;
      showMenu = false;
    }
  }

  let exporting = $state(false);
  let savingToStore = $state(false);

  async function handleExport() {
    exporting = true;
    try {
      await skillsApi.exportZip(skill.id, skill.slug);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      exporting = false;
      showMenu = false;
    }
  }

  async function handleSaveToStore() {
    savingToStore = true;
    try {
      await skillsApi.enableGlobal(skill.id);
      onToggleGlobal?.();
    } catch (e) {
      console.error("Save to store failed:", e);
    } finally {
      savingToStore = false;
      showMenu = false;
    }
  }

  async function handleRemoveFromStore() {
    savingToStore = true;
    try {
      await skillsApi.disableGlobal(skill.id);
      onToggleGlobal?.();
    } catch (e) {
      console.error("Remove from store failed:", e);
    } finally {
      savingToStore = false;
      showMenu = false;
    }
  }

  let showMenu = $state(false);
  let isEnabledForProject = $derived(projectId ? (skill.enabled_projects ?? []).includes(projectId) : false);
</script>

<div
  class="group bg-white border border-gray-200 rounded-xl {compact ? 'p-3' : 'p-4'} hover:border-gray-300 hover:shadow-sm transition-all"
>
  <div class="flex items-start gap-3">
    <div
      class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {skill.enabled_globally
        ? 'bg-green-100 text-green-600'
        : 'bg-gray-100 text-gray-500'}"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="font-medium text-gray-900 truncate">{skill.name}</h3>
        <span class="text-xs text-gray-400 font-mono">v{skill.version}</span>
        {#if skill.default_enabled === 1}
          <span class="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded" title="Auto-enabled for new projects">Default</span>
        {/if}
        {#if skill.enabled_globally}
          <span class="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Global</span>
        {/if}
        {#if needsSync}
          <span class="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1" title="Library version differs from enabled version">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Update
          </span>
        {/if}
        {#if isEnabledForProject}
          <span class="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Project</span>
        {/if}
      </div>
      <p class="text-sm text-gray-500 line-clamp-2 mt-0.5">{skill.description}</p>

      {#if skill.allowed_tools && skill.allowed_tools.length > 0 && !compact}
        <div class="flex flex-wrap gap-1 mt-2">
          {#each skill.allowed_tools.slice(0, 5) as tool}
            <span class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{tool}</span>
          {/each}
          {#if skill.allowed_tools.length > 5}
            <span class="text-xs text-gray-400">+{skill.allowed_tools.length - 5}</span>
          {/if}
        </div>
      {/if}

      {#if skill.tags && skill.tags.length > 0 && !compact}
        <div class="flex flex-wrap gap-1 mt-2">
          {#each skill.tags.slice(0, 3) as tag}
            <span class="text-xs text-gray-500">#{tag}</span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      {#if onToggleProject && projectId}
        <button
          onclick={onToggleProject}
          class="p-1.5 rounded-lg transition-colors {isEnabledForProject
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
          title={isEnabledForProject ? "Disable for project" : "Enable for project"}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </button>
      {/if}

      {#if onEdit}
        <button
          onclick={onEdit}
          class="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 hover:text-gray-700 transition-colors"
          title="Edit skill"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      {/if}

      {#if onDelete}
        <div class="relative">
          <button
            onclick={() => (showMenu = !showMenu)}
            class="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>

          {#if showMenu}
            <div
              class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-36"
            >
              {#if onToggleGlobal}
                {#if skill.enabled_globally}
                  <button
                    onclick={handleRemoveFromStore}
                    disabled={savingToStore}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {savingToStore ? "Removing..." : "Remove from Global Store"}
                  </button>
                {:else}
                  <button
                    onclick={handleSaveToStore}
                    disabled={savingToStore}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {savingToStore ? "Saving..." : "Save to Global Store"}
                  </button>
                {/if}
              {/if}
              {#if onToggleDefault}
                <button
                  onclick={handleToggleDefault}
                  disabled={togglingDefault}
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm {skill.default_enabled === 1 ? 'text-gray-700 hover:bg-gray-50' : 'text-purple-700 hover:bg-purple-50'} transition-colors disabled:opacity-50"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  {togglingDefault ? "Updating..." : skill.default_enabled === 1 ? "Remove from defaults" : "Add to defaults"}
                </button>
              {/if}
              <button
                onclick={handleExport}
                disabled={exporting}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? "Exporting..." : "Export ZIP"}
              </button>
              {#if onSync && needsSync}
                <button
                  onclick={() => { showMenu = false; onSync?.(); }}
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync to enabled
                </button>
              {/if}
              <button
                onclick={() => {
                  showMenu = false;
                  onDelete?.();
                }}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
