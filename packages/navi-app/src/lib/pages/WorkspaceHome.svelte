<script lang="ts">
  import type { Project } from "../api";

  interface Props {
    projects: Project[];
    onSelectProject: (project: Project) => void;
    onTogglePin: (project: Project, e: Event) => void;
    onNewProject: () => void;
    relativeTime: (timestamp: number | null | undefined) => string;
  }

  let { projects, onSelectProject, onTogglePin, onNewProject, relativeTime }: Props = $props();

  // Show only the 5 most recent projects
  const recentProjects = $derived(projects.slice(0, 5));
</script>

<div class="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
  <div class="min-h-full flex flex-col">
    <!-- Hero Section -->
    <div class="flex-1 flex flex-col items-center justify-center px-8">
      <!-- Logo & Branding -->
      <div class="w-14 h-14 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-700 mb-5">
        <img src="/logo.png" alt="Logo" class="w-9 h-9" />
      </div>

      <h1 class="text-2xl font-serif text-gray-900 dark:text-gray-100 mb-2 tracking-tight">Navi</h1>
      <p class="text-sm text-gray-400 dark:text-gray-500 mb-8 text-center">Your AI coding companion</p>

      <!-- Main CTA -->
      <button
        onclick={onNewProject}
        class="group relative inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-[15px] font-medium text-white transition-all duration-200 bg-gray-900 dark:bg-gray-700 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-700 focus:ring-offset-2"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
        </svg>
        Create Workspace
      </button>
    </div>

    <!-- Recent Projects - Floating at bottom -->
    {#if recentProjects.length > 0}
      <div class="px-8 pb-8">
        <div class="max-w-md mx-auto">
          <h3 class="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 text-center">Recent</h3>
          <div class="flex flex-wrap justify-center gap-2">
            {#each recentProjects as proj}
              <button
                onclick={() => onSelectProject(proj)}
                class="group flex items-center gap-2 py-1.5 px-3 rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-all text-left"
              >
                <svg class="w-3 h-3 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
                <span class="text-xs text-gray-600 dark:text-gray-400 font-medium">{proj.name}</span>
              </button>
            {/each}
          </div>
          {#if projects.length > 5}
            <button class="mt-3 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors w-full text-center">
              +{projects.length - 5} more
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
