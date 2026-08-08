<script lang="ts">
  import { skillsApi, type Skill } from "../api";
  import { showError, showSuccess } from "$lib/errorHandler";

  interface Props {
    /** When set, toggles control per-project enablement; otherwise global. */
    projectId?: string | null;
    /** Project root path — lets rescan also import .claude/skills from the project. */
    projectPath?: string | null;
  }

  let { projectId = null, projectPath = null }: Props = $props();

  let skills = $state<Skill[]>([]);
  let loading = $state(true);
  let deleting = $state<string | null>(null);
  let rescanning = $state(false);

  $effect(() => {
    loadSkills();
  });

  async function loadSkills() {
    loading = true;
    try {
      skills = await skillsApi.list();
    } catch (e: any) {
      showError({ title: "Failed to load skills", message: e.message });
    } finally {
      loading = false;
    }
  }

  async function rescan() {
    if (rescanning) return;
    rescanning = true;
    try {
      const { results } = await skillsApi.scan(projectPath ?? undefined);
      await loadSkills();
      const added = results.library.added.length;
      showSuccess(
        "Rescan complete",
        added > 0 ? `Imported ${added} new skill${added === 1 ? "" : "s"}.` : "No new skills found."
      );
    } catch (e: any) {
      showError({ title: "Rescan failed", message: e.message });
    } finally {
      rescanning = false;
    }
  }

  function isEnabled(skill: Skill): boolean {
    return projectId
      ? skill.enabled_projects.includes(projectId)
      : skill.enabled_globally;
  }

  function toggle(skill: Skill) {
    const previous = skills;
    const next = !isEnabled(skill);
    skills = skills.map((s) => {
      if (s.id !== skill.id) return s;
      if (projectId) {
        return {
          ...s,
          enabled_projects: next
            ? [...s.enabled_projects, projectId]
            : s.enabled_projects.filter((p) => p !== projectId),
        };
      }
      return { ...s, enabled_globally: next };
    });
    const call = projectId
      ? next
        ? skillsApi.enableForProject(projectId, skill.id)
        : skillsApi.disableForProject(projectId, skill.id)
      : next
        ? skillsApi.enableGlobal(skill.id)
        : skillsApi.disableGlobal(skill.id);
    call.catch((e: any) => {
      skills = previous;
      showError({ title: "Failed to toggle skill", message: e.message });
    });
  }

  function openFolder(skill: Skill) {
    skillsApi.openInEditor(skill.id, "finder").catch((e: any) => {
      showError({ title: "Failed to open folder", message: e.message });
    });
  }

  async function deleteSkill(skill: Skill) {
    if (!confirm(`Delete skill "${skill.name}"? This removes it from the library.`)) return;
    deleting = skill.id;
    try {
      await skillsApi.delete(skill.id);
      skills = skills.filter((s) => s.id !== skill.id);
    } catch (e: any) {
      showError({ title: "Failed to delete skill", message: e.message });
    } finally {
      deleting = null;
    }
  }
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-end pb-1">
    <button
      onclick={rescan}
      disabled={rescanning || loading}
      class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors disabled:opacity-50"
      title="Import skills from ~/.claude/skills{projectPath ? ' and .claude/skills' : ''}"
    >
      <svg class="w-3.5 h-3.5 {rescanning ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      {rescanning ? "Rescanning…" : "Rescan"}
    </button>
  </div>
  {#if loading}
    <p class="text-sm text-gray-500 dark:text-gray-400 py-4">Loading skills…</p>
  {:else if skills.length === 0}
    <div class="text-sm text-gray-500 dark:text-gray-400 py-4 space-y-1">
      <p>No skills in the library.</p>
      <p>Drop a skill folder into <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">~/.claude/skills/</code> or <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">.claude/skills/</code>, then hit Rescan above.</p>
    </div>
  {:else}
    {#each skills as skill (skill.id)}
      <div class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{skill.name}</span>
            {#if skill.enabled_globally && projectId}
              <span class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 shrink-0">global</span>
            {/if}
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{skill.description}</p>
        </div>
        <button
          onclick={() => openFolder(skill)}
          class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-all"
          title="Reveal in Finder"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
        </button>
        <button
          onclick={() => deleteSkill(skill)}
          disabled={deleting === skill.id}
          class="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
          title="Delete skill"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
        <button
          onclick={() => toggle(skill)}
          role="switch"
          aria-checked={isEnabled(skill)}
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {isEnabled(skill) ? 'bg-accent-600' : 'bg-gray-200 dark:bg-gray-700'}"
          title={projectId ? "Enable for this project" : "Enable globally"}
        >
          <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {isEnabled(skill) ? 'translate-x-[18px]' : 'translate-x-[3px]'}"></span>
        </button>
      </div>
    {/each}
  {/if}
</div>
