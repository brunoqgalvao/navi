<script lang="ts">
  import { onMount } from "svelte";
  import { skillsApi, type Skill } from "../api";
  import { skillLibrary, projects, currentProject } from "../stores";
  import SkillCard from "./SkillCard.svelte";
  import SkillEditor from "./SkillEditor.svelte";
  import SkillImport from "./SkillImport.svelte";

  interface Props {
    projectId?: string | null;
    showProjectToggle?: boolean;
  }

  let { projectId = null, showProjectToggle = false }: Props = $props();

  let loading = $state(true);
  let error: string | null = $state(null);
  let searchQuery = $state("");
  let filterCategory = $state<string | null>(null);
  let filterDefaultOnly = $state(false);
  let showEditor = $state(false);
  let editingSkill: Skill | null = $state(null);
  let showCreateExamples = $state(false);
  let creatingExamples = $state(false);
  let scanning = $state(false);
  let showImport = $state(false);

  let categories = $derived(() => {
    const cats = new Set<string>();
    $skillLibrary.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  });

  let filteredSkills = $derived(() => {
    let result = $skillLibrary;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filterCategory) {
      result = result.filter((s) => s.category === filterCategory);
    }
    if (filterDefaultOnly) {
      result = result.filter((s) => s.default_enabled === 1);
    }
    return result;
  });

  onMount(async () => {
    await loadSkills();
  });

  async function loadSkills() {
    loading = true;
    error = null;
    try {
      const skills = await skillsApi.list();
      skillLibrary.set(skills);
      showCreateExamples = skills.length === 0;
    } catch (e: any) {
      error = e.message || "Failed to load skills";
    } finally {
      loading = false;
    }
  }

  async function handleCreateExamples() {
    creatingExamples = true;
    try {
      await skillsApi.createExamples();
      await loadSkills();
    } catch (e: any) {
      error = e.message || "Failed to create examples";
    } finally {
      creatingExamples = false;
    }
  }

  async function handleScan() {
    scanning = true;
    try {
      // Pass current project path to also scan project-local skills
      await skillsApi.scan($currentProject?.path);
      await loadSkills();
    } catch (e: any) {
      error = e.message || "Scan failed";
    } finally {
      scanning = false;
    }
  }

  async function handleToggleGlobal(skill: Skill) {
    try {
      if (skill.enabled_globally) {
        await skillsApi.disableGlobal(skill.id);
        skillLibrary.updateEnableStatus(skill.id, false, skill.enabled_projects);
      } else {
        await skillsApi.enableGlobal(skill.id);
        skillLibrary.updateEnableStatus(skill.id, true, skill.enabled_projects);
      }
    } catch (e: any) {
      error = e.message || "Failed to toggle skill";
    }
  }

  async function handleToggleProject(skill: Skill) {
    if (!projectId) return;
    try {
      const isEnabled = skill.enabled_projects.includes(projectId);
      if (isEnabled) {
        await skillsApi.disableForProject(projectId, skill.id);
        skillLibrary.updateEnableStatus(
          skill.id,
          skill.enabled_globally,
          skill.enabled_projects.filter((p) => p !== projectId)
        );
      } else {
        await skillsApi.enableForProject(projectId, skill.id);
        skillLibrary.updateEnableStatus(skill.id, skill.enabled_globally, [
          ...skill.enabled_projects,
          projectId,
        ]);
      }
    } catch (e: any) {
      error = e.message || "Failed to toggle skill";
    }
  }

  async function handleDelete(skill: Skill) {
    if (!confirm(`Delete "${skill.name}"? This will remove the skill from all projects.`)) return;
    try {
      await skillsApi.delete(skill.id);
      skillLibrary.remove(skill.id);
    } catch (e: any) {
      error = e.message || "Failed to delete skill";
    }
  }

  async function handleSync(skill: Skill) {
    try {
      if (skill.enabled_globally) {
        await skillsApi.sync(skill.id, "global");
      }
      for (const projId of skill.enabled_projects) {
        await skillsApi.sync(skill.id, "project", projId);
      }
      await loadSkills();
    } catch (e: any) {
      error = e.message || "Sync failed";
    }
  }

  function handleEdit(skill: Skill) {
    editingSkill = skill;
    showEditor = true;
  }

  function handleCreate() {
    editingSkill = null;
    showEditor = true;
  }

  function handleToggleDefault(skill: Skill, enabled: boolean) {
    // Update the skill in the store
    skillLibrary.update({
      ...skill,
      default_enabled: enabled ? 1 : 0,
    });
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-2 flex-1">
      <div class="relative flex-1 max-w-xs">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search skills..."
          class="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:border-gray-900 focus:outline-none transition-colors"
        />
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
      </div>

      {#if categories().length > 0}
        <select
          bind:value={filterCategory}
          class="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value={null}>All categories</option>
          {#each categories() as cat}
            <option value={cat}>{cat}</option>
          {/each}
        </select>
      {/if}

      <!-- Default filter toggle -->
      <button
        onclick={() => (filterDefaultOnly = !filterDefaultOnly)}
        class="px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-1.5 {filterDefaultOnly
          ? 'bg-purple-50 border-purple-300 text-purple-700'
          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}"
        title="Show only skills that are default for new projects"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
        Defaults
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button
        onclick={handleScan}
        disabled={scanning}
        class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Scan for changes on disk"
      >
        <svg
          class="w-4 h-4 {scanning ? 'animate-spin' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
      <button
        onclick={() => (showImport = true)}
        class="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Import
      </button>
      <button
        onclick={handleCreate}
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Create
      </button>
    </div>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
      {error}
      <button onclick={() => (error = null)} class="ml-2 text-red-500 hover:text-red-700">&times;</button>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else if showCreateExamples && $skillLibrary.length === 0}
    <div class="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">No skills yet</h3>
      <p class="text-gray-500 mb-6 max-w-md mx-auto">
        Skills customize how Claude behaves in your projects. Start with example skills or create your own.
      </p>
      <div class="flex items-center justify-center gap-3">
        <button
          onclick={handleCreateExamples}
          disabled={creatingExamples}
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
        >
          {#if creatingExamples}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          {/if}
          Add Example Skills
        </button>
        <button
          onclick={handleCreate}
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Skill
        </button>
      </div>
    </div>
  {:else if filteredSkills().length === 0}
    <div class="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <p class="text-gray-500">No skills match your search</p>
    </div>
  {:else}
    <div class="grid gap-3">
      {#each filteredSkills() as skill (skill.id)}
        <SkillCard
          {skill}
          {projectId}
          onEdit={() => handleEdit(skill)}
          onDelete={() => handleDelete(skill)}
          onToggleGlobal={() => handleToggleGlobal(skill)}
          onToggleProject={showProjectToggle && projectId ? () => handleToggleProject(skill) : undefined}
          onToggleDefault={(enabled) => handleToggleDefault(skill, enabled)}
          onSync={() => handleSync(skill)}
          needsSync={skill.needs_sync}
        />
      {/each}
    </div>
  {/if}

  <div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
    <div class="flex items-start gap-3">
      <svg class="w-5 h-5 text-blue-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div class="text-sm text-blue-800">
        <p class="font-medium mb-1">How skills work</p>
        <ul class="text-blue-700 space-y-1">
          <li><span class="font-medium">Global skills</span> are copied to <code class="bg-blue-100 px-1 rounded">~/.claude/skills/</code> and apply to all Claude sessions</li>
          <li><span class="font-medium">Project skills</span> are copied to <code class="bg-blue-100 px-1 rounded">.claude/skills/</code> in the project</li>
          <li>Library: <code class="bg-blue-100 px-1 rounded">~/.claude-code-ui/skill-library/</code></li>
        </ul>
      </div>
    </div>
  </div>
</div>

<SkillEditor
  open={showEditor}
  onClose={() => (showEditor = false)}
  skill={editingSkill}
  {projectId}
/>

<SkillImport
  open={showImport}
  onClose={() => (showImport = false)}
/>
