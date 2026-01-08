<script lang="ts">
  import { onMount } from "svelte";
  import { skillsApi, type Skill } from "../api";
  import { skillLibrary } from "../stores";

  interface Props {
    projectId: string;
    onCreateSkill?: () => void;
    onEditSkill?: (skill: Skill) => void;
    onOpenLibrary?: () => void;
  }

  let { projectId, onCreateSkill, onEditSkill, onOpenLibrary }: Props = $props();

  let loading = $state(true);
  let error: string | null = $state(null);
  let togglingSkill: string | null = $state(null);
  let openMenuId: string | null = $state(null);
  let searchQuery = $state("");

  // Helper to check if skill matches search
  function matchesSearch(skill: Skill, query: string): boolean {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return !!(
      skill.name.toLowerCase().includes(q) ||
      skill.description?.toLowerCase().includes(q) ||
      skill.tags?.some((t) => t.toLowerCase().includes(q)) ||
      skill.category?.toLowerCase().includes(q)
    );
  }

  // Derived: split skills into enabled and available, filtered by search
  let enabledSkills = $derived(
    $skillLibrary
      .filter((s) => s.enabled_projects?.includes(projectId))
      .filter((s) => matchesSearch(s, searchQuery))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  let availableSkills = $derived(
    $skillLibrary
      .filter((s) => !s.enabled_projects?.includes(projectId))
      .filter((s) => matchesSearch(s, searchQuery))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  // Total counts (unfiltered) for section headers
  let totalEnabled = $derived(
    $skillLibrary.filter((s) => s.enabled_projects?.includes(projectId)).length
  );
  let totalAvailable = $derived(
    $skillLibrary.filter((s) => !s.enabled_projects?.includes(projectId)).length
  );

  onMount(async () => {
    await loadSkills();
  });

  async function loadSkills() {
    loading = true;
    error = null;
    try {
      await skillsApi.syncGlobal();
      const skills = await skillsApi.list();
      skillLibrary.set(skills);
    } catch (e: any) {
      error = e.message || "Failed to load skills";
    } finally {
      loading = false;
    }
  }

  async function enableSkill(skill: Skill) {
    togglingSkill = skill.id;
    try {
      await skillsApi.enableForProject(projectId, skill.id);
      skillLibrary.updateEnableStatus(skill.id, skill.enabled_globally, [
        ...skill.enabled_projects,
        projectId,
      ]);
    } catch (e: any) {
      error = e.message || "Failed to enable skill";
    } finally {
      togglingSkill = null;
    }
  }

  async function disableSkill(skill: Skill) {
    togglingSkill = skill.id;
    try {
      await skillsApi.disableForProject(projectId, skill.id);
      skillLibrary.updateEnableStatus(
        skill.id,
        skill.enabled_globally,
        skill.enabled_projects.filter((p) => p !== projectId)
      );
    } catch (e: any) {
      error = e.message || "Failed to disable skill";
    } finally {
      togglingSkill = null;
    }
  }

  function toggleMenu(skillId: string) {
    openMenuId = openMenuId === skillId ? null : skillId;
  }

  function closeMenu() {
    openMenuId = null;
  }
</script>

<svelte:window on:click={closeMenu} />

<div class="h-full overflow-y-auto">
  <div class="max-w-2xl mx-auto p-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-semibold text-gray-900">Project Skills</h2>
        <p class="text-sm text-gray-500 mt-1">
          Choose which skills Claude can use in this project
        </p>
      </div>
      {#if onCreateSkill}
        <button
          onclick={onCreateSkill}
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Skill
        </button>
      {/if}
    </div>

    <!-- Search -->
    {#if $skillLibrary.length > 0}
      <div class="relative mb-6">
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search skills by name, description, or tags..."
          class="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
        />
        {#if searchQuery}
          <button
            onclick={() => (searchQuery = "")}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>
    {/if}

    {#if error}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
        {error}
        <button onclick={() => (error = null)} class="ml-2 text-red-500 hover:text-red-700">&times;</button>
      </div>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-16">
        <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
    {:else if $skillLibrary.length === 0}
      <!-- Empty state -->
      <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No skills available</h3>
        <p class="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          Create your first skill to extend Claude's capabilities in this project.
        </p>
        {#if onCreateSkill}
          <button
            onclick={onCreateSkill}
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Create Skill
          </button>
        {/if}
      </div>
    {:else}
      <div class="space-y-6">
        <!-- Enabled Skills Section -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="w-2 h-2 bg-green-500 rounded-full"></div>
            <h3 class="text-sm font-medium text-gray-700 uppercase tracking-wide">
              Enabled ({searchQuery ? `${enabledSkills.length}/${totalEnabled}` : enabledSkills.length})
            </h3>
          </div>

          {#if enabledSkills.length === 0}
            <div class="bg-gray-50 border border-gray-200 border-dashed rounded-xl px-6 py-8 text-center">
              {#if searchQuery && totalEnabled > 0}
                <p class="text-sm text-gray-500">No enabled skills match "{searchQuery}"</p>
              {:else}
                <p class="text-sm text-gray-500">No skills enabled for this project</p>
                <p class="text-xs text-gray-400 mt-1">Enable skills below to give Claude new capabilities</p>
              {/if}
            </div>
          {:else}
            <div class="space-y-2">
              {#each enabledSkills as skill (skill.id)}
                {@const isToggling = togglingSkill === skill.id}
                <div
                  class="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div class="flex items-center gap-4">
                    <!-- Icon -->
                    <div class="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center shrink-0">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <h4 class="font-medium text-gray-900">{skill.name}</h4>
                        {#if skill.enabled_globally}
                          <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Global</span>
                        {/if}
                      </div>
                      <p class="text-sm text-gray-500 truncate">{skill.description}</p>
                    </div>

                    <!-- Three-dot menu -->
                    <div class="relative">
                      <button
                        onclick={(e) => { e.stopPropagation(); toggleMenu(skill.id); }}
                        class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="More options"
                      >
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {#if openMenuId === skill.id}
                        <div
                          class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-40"
                          onclick={(e) => e.stopPropagation()}
                        >
                          {#if onEditSkill}
                            <button
                              onclick={() => { closeMenu(); onEditSkill(skill); }}
                              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit Skill
                            </button>
                          {/if}
                          {#if onOpenLibrary}
                            <button
                              onclick={() => { closeMenu(); onOpenLibrary(); }}
                              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Manage Library
                            </button>
                          {/if}
                        </div>
                      {/if}
                    </div>

                    <!-- Toggle -->
                    <button
                      onclick={() => disableSkill(skill)}
                      disabled={isToggling}
                      class="relative inline-flex h-6 w-11 items-center rounded-full bg-green-500 transition-colors hover:bg-green-600 disabled:opacity-50 shrink-0"
                      title="Disable for this project"
                    >
                      {#if isToggling}
                        <span class="absolute inset-0 flex items-center justify-center">
                          <svg class="w-3 h-3 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                        </span>
                      {:else}
                        <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6 shadow-sm"></span>
                      {/if}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Divider -->
        {#if availableSkills.length > 0}
          <div class="border-t border-gray-200"></div>
        {/if}

        <!-- Available Skills Section -->
        {#if availableSkills.length > 0 || (searchQuery && totalAvailable > 0)}
          <div>
            <div class="flex items-center gap-2 mb-3">
              <div class="w-2 h-2 bg-gray-300 rounded-full"></div>
              <h3 class="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Available ({searchQuery ? `${availableSkills.length}/${totalAvailable}` : availableSkills.length})
              </h3>
            </div>

            {#if availableSkills.length === 0 && searchQuery}
              <div class="bg-gray-50 border border-gray-200 border-dashed rounded-xl px-6 py-8 text-center">
                <p class="text-sm text-gray-500">No available skills match "{searchQuery}"</p>
              </div>
            {:else}
            <div class="space-y-2">
              {#each availableSkills as skill (skill.id)}
                {@const isToggling = togglingSkill === skill.id}
                <div
                  class="group bg-gray-50/50 border border-gray-200 rounded-xl p-4 hover:bg-white hover:border-gray-300 transition-all"
                >
                  <div class="flex items-center gap-4">
                    <!-- Icon (greyed out) -->
                    <div class="w-10 h-10 bg-gray-100 text-gray-400 rounded-lg flex items-center justify-center shrink-0">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>

                    <!-- Content (slightly muted) -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <h4 class="font-medium text-gray-600">{skill.name}</h4>
                        {#if skill.enabled_globally}
                          <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Global</span>
                        {/if}
                      </div>
                      <p class="text-sm text-gray-400 truncate">{skill.description}</p>
                    </div>

                    <!-- Three-dot menu -->
                    <div class="relative">
                      <button
                        onclick={(e) => { e.stopPropagation(); toggleMenu(skill.id); }}
                        class="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        title="More options"
                      >
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {#if openMenuId === skill.id}
                        <div
                          class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-40"
                          onclick={(e) => e.stopPropagation()}
                        >
                          {#if onEditSkill}
                            <button
                              onclick={() => { closeMenu(); onEditSkill(skill); }}
                              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit Skill
                            </button>
                          {/if}
                          {#if onOpenLibrary}
                            <button
                              onclick={() => { closeMenu(); onOpenLibrary(); }}
                              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Manage Library
                            </button>
                          {/if}
                        </div>
                      {/if}
                    </div>

                    <!-- Toggle (off state) -->
                    <button
                      onclick={() => enableSkill(skill)}
                      disabled={isToggling}
                      class="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 transition-colors hover:bg-gray-400 disabled:opacity-50 shrink-0"
                      title="Enable for this project"
                    >
                      {#if isToggling}
                        <span class="absolute inset-0 flex items-center justify-center">
                          <svg class="w-3 h-3 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                        </span>
                      {:else}
                        <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1 shadow-sm"></span>
                      {/if}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer info -->
      <div class="mt-8 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <div class="flex items-start gap-3">
          <svg class="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-xs text-gray-500">
            Enabled skills are copied to <code class="bg-gray-200 px-1 rounded">.claude/skills/</code> in this project.
            Skills marked "Global" are also available in all projects.
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>
