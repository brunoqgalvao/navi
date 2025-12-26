<script lang="ts">
  import type { Project } from "../api";
  import WorkspaceCard from "../components/WorkspaceCard.svelte";

  interface Props {
    projects: Project[];
    onSelectProject: (project: Project) => void;
    onTogglePin: (project: Project, e: Event) => void;
    onNewProject: () => void;
    relativeTime: (timestamp: number | null | undefined) => string;
  }

  let { projects, onSelectProject, onTogglePin, onNewProject, relativeTime }: Props = $props();
</script>

<div class="flex-1 overflow-y-auto p-8 bg-white">
  <div class="w-full max-w-4xl mx-auto flex flex-col items-center pt-12">
    <div class="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-200 mb-6">
      <img src="/logo.png" alt="Logo" class="w-10 h-10" />
    </div>

    <h1 class="text-3xl font-serif text-gray-900 mb-3 tracking-tight">Navi</h1>
    <p class="text-base text-gray-500 mb-8 max-w-md text-center font-light">Select a workspace to get started. Already on it.</p>

    <button
      onclick={onNewProject}
      class="group relative inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] font-medium text-white transition-all duration-200 bg-gray-900 rounded-lg hover:bg-gray-800 hover:shadow-lg hover:shadow-gray-900/10 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 mb-16"
    >
      <svg class="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
      Create New Workspace
    </button>

    {#if projects.length > 0}
      <div class="w-full">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-sm font-semibold text-gray-700">Your Workspaces</h3>
          <span class="text-xs text-gray-400">{projects.length} workspace{projects.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each projects as proj}
            <WorkspaceCard
              project={proj}
              onclick={() => onSelectProject(proj)}
              onTogglePin={(e) => onTogglePin(proj, e)}
              {relativeTime}
            />
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
