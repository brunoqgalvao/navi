<script lang="ts">
  import { onMount } from "svelte";
  import {
    skillsApi,
    type Skill,
    type SkillDocument,
    type SkillDocumentScope,
    type SkillFileInfo,
  } from "../api";
  import { skillLibrary, currentProject } from "../stores";
  import SkillEditor from "./SkillEditor.svelte";
  import SkillCommandInstall from "./SkillCommandInstall.svelte";
  import SkillImport from "./SkillImport.svelte";
  import SkillMarketplace from "./SkillMarketplace.svelte";
  import Markdown from "./Markdown.svelte";

  interface Props {
    projectId?: string | null;
    projectPath?: string | null;
    showProjectToggle?: boolean;
  }

  let { projectId = null, projectPath = null, showProjectToggle = false }: Props = $props();

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
  let showCommandInstall = $state(false);
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

  // New state for expanded view
  let viewMode = $state<"view" | "code">("view");
  let expandedSkillFiles = $state<Record<string, SkillFileInfo[]>>({});
  let loadingFiles = $state<string | null>(null);
  let expandedSkills = $state<Set<string>>(new Set());

  let hasProjectContext = $derived(!!projectId && showProjectToggle);
  let commandInstallTarget = $derived<"global" | "project">(
    hasProjectContext ? "project" : "global"
  );

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

  // Parse markdown body (strip YAML frontmatter)
  let markdownBody = $derived(() => {
    const content = editorContent;
    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match ? match[1].trim() : content;
  });

  onMount(async () => {
    if ($skillLibrary.length > 0) {
      loading = false;
      await refreshSkills({ quiet: true });
      return;
    }

    await refreshSkills();
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

  function getScanProjectPath(): string | undefined {
    return projectPath ?? $currentProject?.path;
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

  function getSkillIcon(skill: Skill): string {
    // Return different icons based on skill type or category
    if (skill.source_url) return "📦"; // Remote/GitHub skills
    if (skill.category === "integration") return "🔌";
    if (skill.category === "deployment") return "🚀";
    return "📄"; // Default file icon
  }

  async function toggleSkillFiles(skill: Skill) {
    const isExpanded = expandedSkills.has(skill.id);

    if (isExpanded) {
      expandedSkills.delete(skill.id);
      expandedSkills = new Set(expandedSkills);
      return;
    }

    // Load files if not already cached
    if (!expandedSkillFiles[skill.id]) {
      loadingFiles = skill.id;
      try {
        const result = await skillsApi.getFiles(skill.id);
        expandedSkillFiles[skill.id] = result.files;
      } catch (e: any) {
        console.error("Failed to load skill files:", e);
      } finally {
        loadingFiles = null;
      }
    }

    expandedSkills.add(skill.id);
    expandedSkills = new Set(expandedSkills);
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
        await skillsApi.scan(getScanProjectPath());
      }

      let skills = await skillsApi.list();
      if (!scan && skills.length === 0) {
        await skillsApi.scan(getScanProjectPath());
        skills = await skillsApi.list();
      }

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

{#if error}
  <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
        onclick={() => (showCommandInstall = true)}
        class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
      >
        Paste Command
      </button>
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
  <div class="flex h-[calc(100vh-12rem)] gap-4">
    <!-- Left Sidebar -->
    <aside class="flex w-80 flex-col rounded-lg border border-gray-200 bg-white">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-gray-900">Skills</h2>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {filteredSkills().length} available
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            onclick={handleScan}
            disabled={scanning}
            class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
            title="Refresh skills"
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
            onclick={handleCreate}
            class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100"
            title="Create new skill"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="border-b border-gray-200 p-3">
        <div class="relative">
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
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Filter skills"
            class="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm transition-colors focus:border-gray-400 focus:outline-none"
          />
        </div>
      </div>

      <!-- Paste URL/Path -->
      <div class="border-b border-gray-200 p-3">
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="Paste path, GitHub URL, or skills."
            class="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm transition-colors focus:border-gray-400 focus:outline-none"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                showImport = true;
              }
            }}
          />
          <button
            onclick={() => (showImport = true)}
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black"
          >
            Add
          </button>
        </div>
      </div>

      <!-- Extra actions -->
      <div class="flex items-center gap-1.5 border-b border-gray-200 px-3 py-2">
        <button
          onclick={() => (showMarketplace = true)}
          class="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-100"
        >
          Marketplace
        </button>
        <button
          onclick={() => (showCommandInstall = true)}
          class="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
        >
          Paste Command
        </button>
      </div>

      <!-- Skills List -->
      <div class="flex-1 overflow-y-auto p-2">
        <div class="space-y-1">
          {#each filteredSkills() as skill (skill.id)}
            {@const isSelected = selectedSkillId === skill.id}
            {@const isExpanded = expandedSkills.has(skill.id)}
            {@const isActive = isActiveInContext(skill)}
            <div>
              <div
                role="button"
                tabindex="0"
                onclick={() => selectSkill(skill)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectSkill(skill);
                  }
                }}
                class="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors {isSelected
                  ? 'bg-gray-100'
                  : 'hover:bg-gray-50'}"
              >
                <span class="text-base">{getSkillIcon(skill)}</span>
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{skill.name}</span>
                <div class="flex items-center gap-1">
                  {#if skill.enabled_globally}
                    <span class="rounded bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-700">G</span>
                  {/if}
                  {#if hasProjectContext && isSkillEnabledForProject(skill)}
                    <span class="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700">P</span>
                  {/if}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      toggleSkillFiles(skill);
                    }}
                    class="rounded p-0.5 transition-colors hover:bg-gray-200"
                    title="Show files"
                  >
                    <svg
                      class="h-3 w-3 text-gray-500 transition-transform {isExpanded ? 'rotate-90' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {#if isExpanded}
                <div class="ml-6 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
                  {#if loadingFiles === skill.id}
                    <div class="py-2 text-xs text-gray-400">Loading...</div>
                  {:else if expandedSkillFiles[skill.id]}
                    {#each expandedSkillFiles[skill.id] as file}
                      <div class="flex items-center gap-1.5 py-0.5 text-xs text-gray-600">
                        <span class="text-gray-400">{file.type === 'directory' ? '📁' : '📄'}</span>
                        <span class="truncate">{file.name}</span>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </aside>

    <!-- Right Detail Pane -->
    <section class="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-gray-200 bg-white">
      {#if selectedSkill}
        {@const selected = selectedSkill}

        <!-- Skill Header -->
        <div class="border-b border-gray-200 p-6">
          <h1 class="text-2xl font-semibold text-gray-900">{selected.name}</h1>
          <p class="mt-2 text-sm text-gray-600">{selected.description}</p>

          {#if selected.source_url}
            <div class="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Remote GitHub skills are read-only. Fork or import locally to edit them.
            </div>
          {/if}
        </div>

        <!-- Metadata Section -->
        <div class="space-y-3 border-b border-gray-200 px-6 py-4">
          {#if selected.source_url}
            <div class="flex items-baseline gap-4">
              <span class="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">Source</span>
              <div class="flex items-center gap-2 text-sm text-gray-900">
                <svg class="h-4 w-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <a href={selected.source_url} target="_blank" rel="noopener noreferrer" class="hover:underline">
                  {selected.source_url.replace('https://github.com/', '')}
                </a>
              </div>
            </div>
          {/if}

          <div class="flex items-baseline gap-4">
            <span class="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">Pin</span>
            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-900">
              <span class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">v{selected.version}</span>
              {#if selectedDocument?.scope !== "library"}
                <span class="text-xs text-gray-500">synced v{selectedDocument?.last_synced_version}</span>
              {/if}
              {#if selected.needs_sync}
                <span class="text-xs text-amber-600">Diverged</span>
              {:else if selectedDocument?.scope !== "library"}
                <span class="text-xs text-green-600">Up to date</span>
              {/if}
              <span class="text-xs text-gray-400">|</span>
              <span class="text-xs font-medium text-gray-700">
                {selectedDocument?.editable ? 'Editable' : 'Read only'}
              </span>
            </div>
          </div>

          <div class="flex items-baseline gap-4">
            <span class="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">Used by</span>
            <div class="flex flex-wrap items-center gap-2 text-sm text-gray-900">
              {#if selected.enabled_globally}
                <span class="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Global</span>
              {/if}
              {#if hasProjectContext && isSkillEnabledForProject(selected)}
                <span class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{$currentProject?.name ?? 'Project'}</span>
              {/if}
              {#if !selected.enabled_globally && !(hasProjectContext && isSkillEnabledForProject(selected))}
                <span class="text-xs text-gray-500">Not enabled</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Action bar -->
        <div class="flex items-center gap-2 border-b border-gray-200 px-6 py-2">
          <div class="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
            <button
              onclick={() => handleToggleGlobal(selected)}
              disabled={togglingTarget === `${selected.id}:global`}
              class="rounded px-2.5 py-1 text-xs font-medium transition-colors {selected.enabled_globally
                ? 'bg-green-100 text-green-800'
                : 'text-gray-500 hover:bg-gray-100'}"
            >
              {togglingTarget === `${selected.id}:global` ? '...' : 'Global'}
            </button>
            {#if hasProjectContext}
              <button
                onclick={() => handleToggleProject(selected)}
                disabled={togglingTarget === `${selected.id}:project`}
                class="rounded px-2.5 py-1 text-xs font-medium transition-colors {isSkillEnabledForProject(selected)
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-gray-500 hover:bg-gray-100'}"
              >
                {togglingTarget === `${selected.id}:project` ? '...' : 'Project'}
              </button>
            {/if}
          </div>

          {#if getAvailableScopes(selected).length > 1}
            <div class="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
              {#each getAvailableScopes(selected) as scope}
                <button
                  onclick={() => selectScope(scope)}
                  class="rounded px-2.5 py-1 text-xs font-medium transition-colors {selectedScope === scope
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-100'}"
                >
                  {getScopeLabel(scope)}
                </button>
              {/each}
            </div>
          {/if}

          <div class="flex-1"></div>

          <button
            onclick={() => handleToggleDefault(selected)}
            class="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            title={selected.default_enabled === 1 ? "Remove from defaults" : "Make default for new projects"}
          >
            {selected.default_enabled === 1 ? "Default" : "Make default"}
          </button>
          <button
            onclick={() => handleExport(selected)}
            class="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            Export
          </button>
          <button
            onclick={() => handleEdit(selected)}
            class="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            Advanced
          </button>
          <button
            onclick={() => handleDelete(selected)}
            class="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        </div>

        {#if documentError}
          <div class="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          <!-- SKILL.md Section -->
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="flex items-center justify-between border-b border-gray-200 px-6 py-3">
              <span class="font-mono text-sm text-gray-900">SKILL.md</span>
              <div class="flex rounded-md border border-gray-200 bg-gray-50">
                <button
                  onclick={() => (viewMode = 'view')}
                  class="flex items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors {viewMode === 'view'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'}"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View
                </button>
                <button
                  onclick={() => (viewMode = 'code')}
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors {viewMode === 'code'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'}"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Code
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-6">
              {#if viewMode === 'view'}
                <div class="prose prose-sm max-w-none text-gray-800">
                  <Markdown content={markdownBody()} />
                </div>
              {:else}
                <textarea
                  bind:value={editorContent}
                  spellcheck="false"
                  placeholder="SKILL.md content"
                  class="h-full min-h-[32rem] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm leading-6 text-gray-800 outline-none transition-colors focus:border-gray-400 focus:bg-white"
                ></textarea>
              {/if}
            </div>

            {#if viewMode === 'code'}
              <div class="border-t border-gray-200 px-6 py-3">
                <div class="flex items-center justify-between">
                  <div class="text-xs text-gray-500">
                    {#if isDirty}
                      <span class="text-amber-600">Unsaved changes</span>
                    {:else}
                      No changes
                    {/if}
                  </div>
                  <div class="flex gap-2">
                    {#if selectedDocument?.scope !== "library"}
                      <button
                        onclick={handleRevertDocument}
                        disabled={reverting || !selectedDocument}
                        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        {reverting ? "Reverting..." : "Revert"}
                      </button>
                    {/if}
                    <button
                      onclick={handleSaveDocument}
                      disabled={!selectedDocument?.editable || !isDirty || documentSaving}
                      class="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {documentSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <p class="text-sm font-medium text-gray-700">Select a skill</p>
            <p class="mt-1 text-sm text-gray-500">
              Choose a skill from the sidebar to inspect or edit its SKILL.md.
            </p>
          </div>
        </div>
      {/if}
    </section>
  </div>
{/if}

<SkillEditor
  open={showEditor}
  onClose={() => (showEditor = false)}
  skill={editingSkill}
  {projectId}
  onSave={handleSkillSaved}
/>

<SkillCommandInstall
  open={showCommandInstall}
  onClose={() => (showCommandInstall = false)}
  installTarget={commandInstallTarget}
  {projectId}
  {projectPath}
  onInstalled={(skill, scope) => {
    if (!skill) {
      requestDocumentRefresh();
      return;
    }

    selectedSkillId = skill.id;
    selectedScope = scope;
    requestDocumentRefresh();
  }}
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
  installTarget={commandInstallTarget}
  {projectId}
  {projectPath}
  onClose={() => {
    showMarketplace = false;
    requestDocumentRefresh();
  }}
  onInstalled={(skill, scope) => {
    if (!skill) {
      requestDocumentRefresh();
      return;
    }

    selectedSkillId = skill.id;
    selectedScope = scope;
    requestDocumentRefresh();
  }}
/>
