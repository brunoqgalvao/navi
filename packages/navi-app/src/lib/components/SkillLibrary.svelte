<script lang="ts">
  import { onMount } from "svelte";
  import {
    skillsApi,
    type Skill,
    type SkillDocument,
    type SkillDocumentScope,
  } from "../api";
  import { skillLibrary, currentProject } from "../stores";
  import SkillEditor from "./SkillEditor.svelte";
  import SkillImport from "./SkillImport.svelte";
  import SkillMarketplace from "./SkillMarketplace.svelte";

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
  let showMarketplace = $state(false);
  let inactiveExpanded = $state(false);

  let selectedSkillId = $state<string | null>(null);
  let selectedScope = $state<SkillDocumentScope>("library");
  let selectedDocument = $state<SkillDocument | null>(null);
  let editorContent = $state("");
  let lastLoadedContent = $state("");
  let documentLoading = $state(false);
  let documentSaving = $state(false);
  let reverting = $state(false);
  let documentError: string | null = $state(null);
  let togglingTarget = $state<string | null>(null);
  let documentRefreshNonce = $state(0);
  let activeDocumentRequest = 0;

  let hasProjectContext = $derived(!!projectId && showProjectToggle);

  let categories = $derived(() => {
    const cats = new Set<string>();
    $skillLibrary.forEach((skill) => {
      if (skill.category) cats.add(skill.category);
    });
    return Array.from(cats).sort();
  });

  let sortedSkills = $derived(() =>
    [...$skillLibrary].sort((a, b) => a.name.localeCompare(b.name))
  );

  let filteredSkills = $derived(() => {
    let result = sortedSkills();

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
          skill.category?.toLowerCase().includes(query)
      );
    }

    if (filterCategory) {
      result = result.filter((skill) => skill.category === filterCategory);
    }

    if (filterDefaultOnly) {
      result = result.filter((skill) => skill.default_enabled === 1);
    }

    return result;
  });

  let activeSkills = $derived(() =>
    filteredSkills().filter((skill) => isActiveInContext(skill))
  );

  let inactiveSkills = $derived(() =>
    filteredSkills().filter((skill) => !isActiveInContext(skill))
  );

  let showInactiveSection = $derived(
    inactiveExpanded || !!searchQuery.trim() || !!filterCategory || filterDefaultOnly
  );

  let selectedSkill = $derived(
    selectedSkillId
      ? $skillLibrary.find((skill) => skill.id === selectedSkillId) ?? null
      : null
  );

  let selectionKey = $derived(
    selectedSkillId ? `${selectedSkillId}:${selectedScope}:${documentRefreshNonce}` : ""
  );

  let isDirty = $derived(editorContent !== lastLoadedContent);

  onMount(async () => {
    await refreshSkills({ scan: true });
  });

  $effect(() => {
    if ($skillLibrary.length === 0) {
      selectedSkillId = null;
      selectedDocument = null;
      editorContent = "";
      lastLoadedContent = "";
      documentError = null;
      return;
    }

    const currentlySelected = selectedSkillId
      ? $skillLibrary.find((skill) => skill.id === selectedSkillId) ?? null
      : null;
    if (!currentlySelected) {
      const nextSkill = activeSkills()[0] ?? sortedSkills()[0];
      if (nextSkill) {
        selectedSkillId = nextSkill.id;
        selectedScope = getDefaultScope(nextSkill);
      }
      return;
    }

    const availableScopes = getAvailableScopes(currentlySelected);
    if (!availableScopes.includes(selectedScope)) {
      selectedScope = getDefaultScope(currentlySelected);
    }
  });

  $effect(() => {
    const key = selectionKey;
    if (!key || !selectedSkillId) return;
    void loadSelectedDocument(selectedSkillId, selectedScope);
  });

  function requestDocumentRefresh() {
    documentRefreshNonce += 1;
  }

  function isSkillEnabledForProject(skill: Skill): boolean {
    return !!projectId && skill.enabled_projects.includes(projectId);
  }

  function isActiveInContext(skill: Skill): boolean {
    if (hasProjectContext) {
      return skill.enabled_globally || isSkillEnabledForProject(skill);
    }
    return skill.enabled_globally;
  }

  function getAvailableScopes(skill: Skill): SkillDocumentScope[] {
    const scopes: SkillDocumentScope[] = [];
    if (hasProjectContext && isSkillEnabledForProject(skill)) {
      scopes.push("project");
    }
    if (skill.enabled_globally) {
      scopes.push("global");
    }
    scopes.push("library");
    return scopes;
  }

  function getDefaultScope(skill: Skill): SkillDocumentScope {
    return getAvailableScopes(skill)[0] ?? "library";
  }

  function getScopeLabel(scope: SkillDocumentScope): string {
    if (scope === "project") return "Project Copy";
    if (scope === "global") return "Global Copy";
    return "Library Template";
  }

  function getQuickToggleScope(): "project" | "global" {
    return hasProjectContext ? "project" : "global";
  }

  function isQuickToggleEnabled(skill: Skill): boolean {
    if (getQuickToggleScope() === "project") {
      return isSkillEnabledForProject(skill);
    }
    return skill.enabled_globally;
  }

  function getQuickToggleLabel(): string {
    return getQuickToggleScope() === "project" ? "Project" : "Global";
  }

  function getScopeTone(scope: SkillDocumentScope): string {
    if (scope === "project") return "bg-blue-100 text-blue-700";
    if (scope === "global") return "bg-green-100 text-green-700";
    return "bg-gray-100 text-gray-600";
  }

  function confirmDiscardChanges(): boolean {
    if (!isDirty) return true;
    return confirm("Discard unsaved changes to this SKILL.md?");
  }

  function selectSkill(skill: Skill, scope: SkillDocumentScope = getDefaultScope(skill)) {
    if (!confirmDiscardChanges()) return;
    selectedSkillId = skill.id;
    selectedScope = scope;
  }

  function selectScope(scope: SkillDocumentScope) {
    if (scope === selectedScope) return;
    if (!confirmDiscardChanges()) return;
    selectedScope = scope;
  }

  async function refreshSkills(options?: {
    scan?: boolean;
    quiet?: boolean;
    preferredSkillId?: string | null;
    preferredScope?: SkillDocumentScope;
  }) {
    const scan = options?.scan ?? false;
    const quiet = options?.quiet ?? false;
    const preferredSkillId = options?.preferredSkillId ?? selectedSkillId;
    const preferredScope = options?.preferredScope ?? selectedScope;

    if (!quiet) {
      loading = true;
    }
    error = null;

    try {
      if (scan) {
        await skillsApi.scan($currentProject?.path);
      }

      const skills = await skillsApi.list();
      skillLibrary.set(skills);
      showCreateExamples = skills.length === 0;

      if (skills.length === 0) {
        selectedSkillId = null;
        selectedDocument = null;
        editorContent = "";
        lastLoadedContent = "";
        return;
      }

      const nextSkill =
        (preferredSkillId && skills.find((skill) => skill.id === preferredSkillId)) ||
        skills.find((skill) => isActiveInContext(skill)) ||
        [...skills].sort((a, b) => a.name.localeCompare(b.name))[0] ||
        null;

      if (nextSkill) {
        selectedSkillId = nextSkill.id;
        selectedScope = getAvailableScopes(nextSkill).includes(preferredScope)
          ? preferredScope
          : getDefaultScope(nextSkill);
      }

      requestDocumentRefresh();
    } catch (e: any) {
      error = e.message || "Failed to load skills";
    } finally {
      if (!quiet) {
        loading = false;
      }
    }
  }

  async function loadSelectedDocument(skillId: string, scope: SkillDocumentScope) {
    activeDocumentRequest += 1;
    const requestId = activeDocumentRequest;
    documentLoading = true;
    documentError = null;

    try {
      const document = await skillsApi.getDocument(
        skillId,
        scope,
        scope === "project" ? projectId ?? undefined : undefined
      );

      if (requestId !== activeDocumentRequest) return;

      selectedDocument = document;
      editorContent = document.content;
      lastLoadedContent = document.content;
    } catch (e: any) {
      if (requestId !== activeDocumentRequest) return;
      selectedDocument = null;
      editorContent = "";
      lastLoadedContent = "";
      documentError = e.message || "Failed to load SKILL.md";
    } finally {
      if (requestId === activeDocumentRequest) {
        documentLoading = false;
      }
    }
  }

  async function handleCreateExamples() {
    creatingExamples = true;
    try {
      await skillsApi.createExamples();
      await refreshSkills({ preferredSkillId: selectedSkillId, preferredScope: selectedScope });
    } catch (e: any) {
      error = e.message || "Failed to create examples";
    } finally {
      creatingExamples = false;
    }
  }

  async function handleScan() {
    scanning = true;
    try {
      await refreshSkills({
        scan: true,
        preferredSkillId: selectedSkillId,
        preferredScope: selectedScope,
      });
    } finally {
      scanning = false;
    }
  }

  async function handleToggleGlobal(skill: Skill) {
    togglingTarget = `${skill.id}:global`;
    try {
      const nextGlobalState = !skill.enabled_globally;

      if (nextGlobalState) {
        await skillsApi.enableGlobal(skill.id);
      } else {
        await skillsApi.disableGlobal(skill.id);
      }

      skillLibrary.updateEnableStatus(skill.id, nextGlobalState, skill.enabled_projects);

      if (selectedSkillId === skill.id) {
        const nextSkill = { ...skill, enabled_globally: nextGlobalState };
        const nextScope = getAvailableScopes(nextSkill).includes(selectedScope)
          ? selectedScope
          : getDefaultScope(nextSkill);
        selectedScope = nextScope;
      }

      await refreshSkills({
        quiet: true,
        preferredSkillId: skill.id,
        preferredScope: nextGlobalState ? (selectedScope === "library" ? "global" : selectedScope) : undefined,
      });
    } catch (e: any) {
      error = e.message || "Failed to toggle global skill";
    } finally {
      togglingTarget = null;
    }
  }

  async function handleToggleProject(skill: Skill) {
    if (!projectId) return;

    togglingTarget = `${skill.id}:project`;
    try {
      const currentlyEnabled = skill.enabled_projects.includes(projectId);
      const nextProjectIds = currentlyEnabled
        ? skill.enabled_projects.filter((id) => id !== projectId)
        : [...skill.enabled_projects, projectId];

      if (currentlyEnabled) {
        await skillsApi.disableForProject(projectId, skill.id);
      } else {
        await skillsApi.enableForProject(projectId, skill.id);
      }

      skillLibrary.updateEnableStatus(skill.id, skill.enabled_globally, nextProjectIds);

      if (selectedSkillId === skill.id) {
        const nextSkill = { ...skill, enabled_projects: nextProjectIds };
        const nextScope = getAvailableScopes(nextSkill).includes(selectedScope)
          ? selectedScope
          : getDefaultScope(nextSkill);
        selectedScope = nextScope;
      }

      await refreshSkills({
        quiet: true,
        preferredSkillId: skill.id,
        preferredScope: currentlyEnabled ? undefined : "project",
      });
    } catch (e: any) {
      error = e.message || "Failed to toggle project skill";
    } finally {
      togglingTarget = null;
    }
  }

  async function handleQuickToggle(skill: Skill) {
    if (getQuickToggleScope() === "project") {
      await handleToggleProject(skill);
      return;
    }
    await handleToggleGlobal(skill);
  }

  async function handleToggleDefault(skill: Skill) {
    try {
      const enabled = skill.default_enabled !== 1;
      await skillsApi.setDefaultEnabled(skill.id, enabled);
      skillLibrary.update({
        ...skill,
        default_enabled: enabled ? 1 : 0,
      });
    } catch (e: any) {
      error = e.message || "Failed to update default setting";
    }
  }

  async function handleSaveDocument() {
    if (!selectedSkillId) return;

    documentSaving = true;
    documentError = null;

    try {
      const saved = await skillsApi.saveDocument(
        selectedSkillId,
        selectedScope,
        editorContent,
        selectedScope === "project" ? projectId ?? undefined : undefined
      );

      selectedDocument = saved;
      editorContent = saved.content;
      lastLoadedContent = saved.content;

      await refreshSkills({
        quiet: true,
        preferredSkillId: selectedSkillId,
        preferredScope: selectedScope,
      });
    } catch (e: any) {
      documentError = e.message || "Failed to save SKILL.md";
    } finally {
      documentSaving = false;
    }
  }

  async function handleRevertDocument() {
    if (!selectedSkillId || selectedScope === "library") return;

    reverting = true;
    documentError = null;

    try {
      await skillsApi.sync(
        selectedSkillId,
        selectedScope,
        selectedScope === "project" ? projectId ?? undefined : undefined
      );

      await refreshSkills({
        quiet: true,
        preferredSkillId: selectedSkillId,
        preferredScope: selectedScope,
      });
    } catch (e: any) {
      documentError = e.message || "Failed to revert to library template";
    } finally {
      reverting = false;
    }
  }

  async function handleDelete(skill: Skill) {
    if (!confirm(`Delete "${skill.name}"? This will remove the skill from all projects.`)) {
      return;
    }

    try {
      await skillsApi.delete(skill.id);
      skillLibrary.remove(skill.id);

      if (selectedSkillId === skill.id) {
        requestDocumentRefresh();
      }
    } catch (e: any) {
      error = e.message || "Failed to delete skill";
    }
  }

  async function handleExport(skill: Skill) {
    try {
      await skillsApi.exportZip(skill.id, skill.slug);
    } catch (e: any) {
      error = e.message || "Failed to export skill";
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

  async function handleSkillSaved(skill: Skill) {
    await refreshSkills({
      quiet: true,
      preferredSkillId: skill.id,
      preferredScope: getDefaultScope(skill),
    });
  }

  function getDocumentBanner(document: SkillDocument | null): {
    tone: string;
    title: string;
    copy: string;
  } | null {
    if (!document) return null;

    if (document.scope === "library") {
      return {
        tone: "border-gray-200 bg-gray-50 text-gray-600",
        title: "Library template",
        copy: "Editing this file changes the source template. Enabled copies keep their own contents until you revert them from here.",
      };
    }

    if (!document.exists) {
      return {
        tone: "border-amber-200 bg-amber-50 text-amber-700",
        title: "Local copy missing",
        copy: "This enabled copy no longer exists on disk. Revert to restore it from the library template, or paste a replacement SKILL.md and save it.",
      };
    }

    if (document.is_diverged) {
      return {
        tone: "border-amber-200 bg-amber-50 text-amber-700",
        title: "Diverged from template",
        copy: "This local copy differs from the library template. Revert will replace it with the current library version.",
      };
    }

    return {
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      title: "In sync",
      copy: "This local copy currently matches the library template. Saving here creates a local override without changing the template.",
    };
  }

  function hasAnySkills(): boolean {
    return $skillLibrary.length > 0;
  }
</script>

<div class="space-y-4">
  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex flex-1 flex-wrap items-center gap-2">
      <div class="relative min-w-[220px] flex-1 lg:max-w-sm">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search skills..."
          class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm transition-colors focus:border-gray-900 focus:outline-none"
        />
        <svg
          class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
          class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value={null}>All categories</option>
          {#each categories() as category}
            <option value={category}>{category}</option>
          {/each}
        </select>
      {/if}

      <button
        onclick={() => (filterDefaultOnly = !filterDefaultOnly)}
        class="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors {filterDefaultOnly
          ? 'border-purple-300 bg-purple-50 text-purple-700'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
        title="Show only skills enabled by default for new projects"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
        Defaults
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        onclick={handleScan}
        disabled={scanning}
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        title="Scan for skills and filesystem changes"
      >
        <svg
          class="h-4 w-4 {scanning ? 'animate-spin' : ''}"
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
        class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
      >
        Import
      </button>

      <button
        onclick={() => (showMarketplace = true)}
        class="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-600 transition-colors hover:bg-violet-100"
      >
        Marketplace
      </button>

      <button
        onclick={handleCreate}
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
      >
        Create Skill
      </button>
    </div>
  </div>

  {#if error}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
      <button onclick={() => (error = null)} class="ml-2 text-red-500 hover:text-red-700">&times;</button>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <svg class="h-8 w-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else if !hasAnySkills()}
    <div class="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <svg class="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
      <h3 class="mb-2 text-lg font-semibold text-gray-900">No skills yet</h3>
      <p class="mx-auto mb-6 max-w-md text-sm text-gray-500">
        Skills customize how Claude behaves. Start with example skills, import existing ones, or create a new template.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        {#if showCreateExamples}
          <button
            onclick={handleCreateExamples}
            disabled={creatingExamples}
            class="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
          >
            {creatingExamples ? "Adding..." : "Add Example Skills"}
          </button>
        {/if}
        <button
          onclick={() => (showImport = true)}
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          Import
        </button>
        <button
          onclick={handleCreate}
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
        >
          Create Skill
        </button>
      </div>
    </div>
  {:else}
    <div class="grid gap-4 lg:grid-cols-[320px,minmax(0,1fr)]">
      <aside class="flex min-h-[36rem] flex-col rounded-xl border border-gray-200 bg-white">
        <div class="border-b border-gray-100 px-4 py-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Skill Files</h3>
              <p class="text-xs text-gray-500">
                Active skills stay pinned. Inactive ones collapse into the library.
              </p>
            </div>
            <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              {filteredSkills().length}
            </span>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-3">
          <div class="space-y-4">
            <section>
              <div class="mb-2 flex items-center justify-between px-2">
                <span class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Active Skills
                </span>
                <span class="text-xs text-gray-400">{activeSkills().length}</span>
              </div>

              {#if activeSkills().length === 0}
                <div class="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
                  No active skills in this view.
                </div>
              {:else}
                <div class="space-y-1.5">
                  {#each activeSkills() as skill (skill.id)}
                    {@const isSelected = selectedSkillId === skill.id}
                    {@const quickEnabled = isQuickToggleEnabled(skill)}
                    <div
                      role="button"
                      tabindex="0"
                      class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors {isSelected
                        ? 'border-gray-300 bg-gray-100'
                        : 'border-transparent bg-white hover:border-gray-200 hover:bg-gray-50'}"
                      onclick={() => selectSkill(skill)}
                      onkeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectSkill(skill);
                        }
                      }}
                    >
                      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </div>

                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="truncate text-sm font-medium text-gray-900">{skill.name}</span>
                          {#if skill.needs_sync}
                            <span class="h-2 w-2 rounded-full bg-amber-400" title="A local copy diverges from the library template"></span>
                          {/if}
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-1.5">
                          {#if skill.enabled_globally}
                            <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {getScopeTone('global')}">
                              G
                            </span>
                          {/if}
                          {#if hasProjectContext && isSkillEnabledForProject(skill)}
                            <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {getScopeTone('project')}">
                              P
                            </span>
                          {/if}
                          {#if skill.default_enabled === 1}
                            <span class="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                              Default
                            </span>
                          {/if}
                        </div>
                      </div>

                      <button
                        onclick={(event) => {
                          event.stopPropagation();
                          handleQuickToggle(skill);
                        }}
                        disabled={togglingTarget === `${skill.id}:${getQuickToggleScope()}`}
                        class="rounded-md px-2 py-1 text-[11px] font-medium transition-colors {quickEnabled
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
                        title={`Toggle ${getQuickToggleLabel().toLowerCase()} copy`}
                      >
                        {#if togglingTarget === `${skill.id}:${getQuickToggleScope()}`}
                          ...
                        {:else}
                          {getQuickToggleLabel().slice(0, 1)}
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>

            <section>
              <button
                onclick={() => (inactiveExpanded = !inactiveExpanded)}
                class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50"
              >
                <span class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Inactive Skills
                </span>
                <div class="flex items-center gap-2 text-xs text-gray-400">
                  <span>{inactiveSkills().length}</span>
                  <svg
                    class="h-4 w-4 transition-transform {showInactiveSection ? 'rotate-90' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {#if showInactiveSection}
                <div class="mt-2 space-y-1.5">
                  {#each inactiveSkills() as skill (skill.id)}
                    {@const isSelected = selectedSkillId === skill.id}
                    <div
                      role="button"
                      tabindex="0"
                      class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors {isSelected
                        ? 'border-gray-300 bg-gray-100'
                        : 'border-transparent bg-gray-50/70 hover:border-gray-200 hover:bg-gray-100/80'}"
                      onclick={() => selectSkill(skill, "library")}
                      onkeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectSkill(skill, "library");
                        }
                      }}
                    >
                      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </div>

                      <div class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-gray-600">{skill.name}</span>
                        <span class="block truncate text-xs text-gray-400">
                          Library only
                        </span>
                      </div>

                      <button
                        onclick={(event) => {
                          event.stopPropagation();
                          handleQuickToggle(skill);
                        }}
                        disabled={togglingTarget === `${skill.id}:${getQuickToggleScope()}`}
                        class="rounded-md px-2 py-1 text-[11px] font-medium transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200"
                        title={`Enable ${getQuickToggleLabel().toLowerCase()} copy`}
                      >
                        {#if togglingTarget === `${skill.id}:${getQuickToggleScope()}`}
                          ...
                        {:else}
                          +
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>
          </div>
        </div>
      </aside>

      <section class="flex min-h-[36rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        {#if selectedSkill}
          {@const selected = selectedSkill}
          <div class="border-b border-gray-100 px-5 py-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="min-w-0">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="truncate text-lg font-semibold text-gray-900">{selected.name}</h3>
                      <span class="text-xs font-mono text-gray-400">v{selected.version}</span>
                    </div>
                    <p class="mt-0.5 max-w-2xl text-sm text-gray-500">
                      {selected.description}
                    </p>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap items-center gap-3">
                  <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                    <span class="px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Active
                    </span>
                    <button
                      onclick={() => handleToggleGlobal(selected)}
                      disabled={togglingTarget === `${selected.id}:global`}
                      class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selected.enabled_globally
                        ? 'bg-white text-green-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'}"
                    >
                      Global
                    </button>
                    {#if hasProjectContext}
                      <button
                        onclick={() => handleToggleProject(selected)}
                        disabled={togglingTarget === `${selected.id}:project`}
                        class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {isSkillEnabledForProject(selected)
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'}"
                      >
                        Project
                      </button>
                    {/if}
                  </div>

                  <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                    <span class="px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Viewing
                    </span>
                    {#each getAvailableScopes(selected) as scope}
                      <button
                        onclick={() => selectScope(scope)}
                        class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedScope === scope
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'}"
                      >
                        {getScopeLabel(scope)}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {#if selected.default_enabled === 1}
                    <span class="rounded-full bg-purple-50 px-2 py-1 font-medium text-purple-700">
                      Enabled by default
                    </span>
                  {/if}
                  {#if selected.needs_sync}
                    <span class="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
                      At least one local copy diverges
                    </span>
                  {/if}
                  {#if selected.category}
                    <span class="rounded-full bg-gray-100 px-2 py-1 text-gray-500">
                      {selected.category}
                    </span>
                  {/if}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  onclick={() => handleToggleDefault(selected)}
                  class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  {selected.default_enabled === 1 ? "Remove Default" : "Make Default"}
                </button>
                <button
                  onclick={() => handleExport(selected)}
                  class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Export ZIP
                </button>
                <button
                  onclick={() => handleEdit(selected)}
                  class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Advanced
                </button>
                <button
                  onclick={() => handleDelete(selected)}
                  class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>

          {#if documentError}
            <div class="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {documentError}
            </div>
          {/if}

          {#if documentLoading}
            <div class="flex flex-1 items-center justify-center">
              <svg class="h-8 w-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            </div>
          {:else}
            {@const banner = getDocumentBanner(selectedDocument)}
            {#if banner}
              <div class="border-b border-gray-100 px-5 py-3">
                <div class="rounded-lg border px-4 py-3 text-sm {banner.tone}">
                  <p class="font-medium">{banner.title}</p>
                  <p class="mt-1">{banner.copy}</p>
                </div>
              </div>
            {/if}

            <div class="border-b border-gray-100 bg-gray-50/70 px-5 py-3">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                  <p class="truncate text-xs font-mono text-gray-500">
                    {selectedDocument?.path}
                  </p>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>Template v{selectedDocument?.version}</span>
                    {#if selectedDocument?.scope !== "library"}
                      <span>Last synced v{selectedDocument?.last_synced_version}</span>
                    {/if}
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  {#if selectedDocument?.scope !== "library"}
                    <button
                      onclick={handleRevertDocument}
                      disabled={reverting || !selectedDocument}
                      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                    >
                      {reverting ? "Reverting..." : selectedDocument?.exists ? "Revert to Template" : "Restore from Template"}
                    </button>
                  {/if}
                  <button
                    onclick={handleSaveDocument}
                    disabled={!selectedDocument?.editable || !isDirty || documentSaving}
                    class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {documentSaving
                      ? "Saving..."
                      : selectedScope === "library"
                        ? "Save Template"
                        : "Save Local Copy"}
                  </button>
                </div>
              </div>
            </div>

            <div class="flex-1 p-5">
              <textarea
                bind:value={editorContent}
                spellcheck="false"
                placeholder="SKILL.md content"
                class="h-full min-h-[24rem] w-full resize-none rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-4 font-mono text-sm leading-6 text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white"
              ></textarea>
            </div>

            <div class="border-t border-gray-100 px-5 py-4">
              <div class="flex flex-wrap items-start gap-4 text-xs text-gray-500">
                <div class="min-w-[140px]">
                  <p class="font-medium text-gray-700">Allowed tools</p>
                  <p class="mt-1">
                    {#if selected.allowed_tools?.length}
                      {selected.allowed_tools?.join(", ")}
                    {:else}
                      All tools
                    {/if}
                  </p>
                </div>
                <div class="min-w-[140px]">
                  <p class="font-medium text-gray-700">Tags</p>
                  <p class="mt-1">
                    {#if selected.tags?.length}
                      {selected.tags?.join(", ")}
                    {:else}
                      None
                    {/if}
                  </p>
                </div>
                <div class="min-w-[140px]">
                  <p class="font-medium text-gray-700">Mode</p>
                  <p class="mt-1">{getScopeLabel(selectedScope)}</p>
                </div>
              </div>
            </div>
          {/if}
        {:else}
          <div class="flex flex-1 items-center justify-center px-6 text-center">
            <div>
              <p class="text-sm font-medium text-gray-700">Select a skill</p>
              <p class="mt-1 text-sm text-gray-500">
                Choose a skill from the sidebar to inspect or edit its `SKILL.md`.
              </p>
            </div>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<SkillEditor
  open={showEditor}
  onClose={() => (showEditor = false)}
  skill={editingSkill}
  {projectId}
  onSave={handleSkillSaved}
/>

<SkillImport
  open={showImport}
  onClose={() => (showImport = false)}
  onImported={(skill) => {
    selectedSkillId = skill.id;
    selectedScope = "library";
    requestDocumentRefresh();
  }}
/>

<SkillMarketplace
  open={showMarketplace}
  onClose={() => {
    showMarketplace = false;
    requestDocumentRefresh();
  }}
/>
