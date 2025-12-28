<script lang="ts">
  import { onMount } from "svelte";
  import { skillsApi, agentsApi, type Skill, type Agent } from "../api";
  import { skillLibrary } from "../stores";
  import SkillCard from "./SkillCard.svelte";
  import SkillEditor from "./SkillEditor.svelte";
  import SkillImport from "./SkillImport.svelte";
  import AgentEditor from "./AgentEditor.svelte";

  interface Props {
    projectId?: string | null;
    showProjectToggle?: boolean;
  }

  let { projectId = null, showProjectToggle = false }: Props = $props();

  // Tab state
  let activeTab = $state<"all" | "skills" | "agents">("all");

  // Skills state
  let loadingSkills = $state(true);
  let skillsError: string | null = $state(null);
  let showSkillEditor = $state(false);
  let editingSkill: Skill | null = $state(null);
  let showCreateExamples = $state(false);
  let creatingExamples = $state(false);
  let scanningSkills = $state(false);
  let showImport = $state(false);

  // Agents state
  let agents = $state<Agent[]>([]);
  let loadingAgents = $state(true);
  let agentsError: string | null = $state(null);
  let showAgentEditor = $state(false);
  let editingAgent: Agent | null = $state(null);

  // Search
  let searchQuery = $state("");

  // Help panel
  let showHelp = $state(false);

  // Filtered lists
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
    return result;
  });

  let filteredAgents = $derived(() => {
    let result = agents;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      );
    }
    return result;
  });

  // Combined and sorted
  type ItemType = { type: "skill"; item: Skill } | { type: "agent"; item: Agent };

  let allItems = $derived((): ItemType[] => {
    const items: ItemType[] = [];

    if (activeTab === "all" || activeTab === "skills") {
      for (const skill of filteredSkills()) {
        items.push({ type: "skill", item: skill });
      }
    }

    if (activeTab === "all" || activeTab === "agents") {
      for (const agent of filteredAgents()) {
        items.push({ type: "agent", item: agent });
      }
    }

    // Sort alphabetically
    return items.sort((a, b) => a.item.name.localeCompare(b.item.name));
  });

  onMount(async () => {
    await Promise.all([loadSkills(), loadAgents()]);
  });

  async function loadSkills() {
    loadingSkills = true;
    skillsError = null;
    try {
      await skillsApi.syncGlobal();
      const skills = await skillsApi.list();
      skillLibrary.set(skills);
      showCreateExamples = skills.length === 0;
    } catch (e: any) {
      skillsError = e.message || "Failed to load skills";
    } finally {
      loadingSkills = false;
    }
  }

  async function loadAgents() {
    loadingAgents = true;
    agentsError = null;
    try {
      if (projectId) {
        agents = await agentsApi.listForProject(projectId);
      } else {
        agents = await agentsApi.list();
      }
    } catch (e: any) {
      agentsError = e.message || "Failed to load agents";
    } finally {
      loadingAgents = false;
    }
  }

  async function handleCreateExamples() {
    creatingExamples = true;
    try {
      await skillsApi.createExamples();
      await loadSkills();
    } catch (e: any) {
      skillsError = e.message || "Failed to create examples";
    } finally {
      creatingExamples = false;
    }
  }

  async function handleScanSkills() {
    scanningSkills = true;
    try {
      await skillsApi.syncGlobal();
      await skillsApi.scan();
      await loadSkills();
    } catch (e: any) {
      skillsError = e.message || "Scan failed";
    } finally {
      scanningSkills = false;
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
      skillsError = e.message || "Failed to toggle skill";
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
      skillsError = e.message || "Failed to toggle skill";
    }
  }

  async function handleDeleteSkill(skill: Skill) {
    if (!confirm(`Delete "${skill.name}"? This will remove the skill from all projects.`)) return;
    try {
      await skillsApi.delete(skill.id);
      skillLibrary.remove(skill.id);
    } catch (e: any) {
      skillsError = e.message || "Failed to delete skill";
    }
  }

  async function handleDeleteAgent(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    try {
      await agentsApi.delete(agent.id);
      agents = agents.filter((a) => a.id !== agent.id);
    } catch (e: any) {
      agentsError = e.message || "Failed to delete agent";
    }
  }

  async function handleSyncSkill(skill: Skill) {
    try {
      if (skill.enabled_globally) {
        await skillsApi.sync(skill.id, "global");
      }
      for (const projId of skill.enabled_projects) {
        await skillsApi.sync(skill.id, "project", projId);
      }
      await loadSkills();
    } catch (e: any) {
      skillsError = e.message || "Sync failed";
    }
  }

  function handleEditSkill(skill: Skill) {
    editingSkill = skill;
    showSkillEditor = true;
  }

  function handleCreateSkill() {
    editingSkill = null;
    showSkillEditor = true;
  }

  function handleEditAgent(agent: Agent) {
    editingAgent = agent;
    showAgentEditor = true;
  }

  function handleCreateAgent() {
    editingAgent = null;
    showAgentEditor = true;
  }

  function handleAgentSaved(agent: Agent) {
    const idx = agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      agents[idx] = agent;
      agents = [...agents];
    } else {
      agents = [...agents, agent];
    }
  }

  const isLoading = $derived(loadingSkills || loadingAgents);
  const error = $derived(skillsError || agentsError);
</script>

<div class="space-y-4">
  <!-- Header with tabs and actions -->
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-4">
      <!-- Tabs -->
      <div class="flex bg-gray-100 rounded-lg p-0.5">
        <button
          onclick={() => (activeTab = "all")}
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {activeTab === 'all'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'}"
        >
          All
        </button>
        <button
          onclick={() => (activeTab = "skills")}
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 {activeTab === 'skills'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'}"
        >
          <span class="text-amber-500">📄</span>
          Skills
          <span class="text-xs bg-gray-200 px-1.5 rounded">{filteredSkills().length}</span>
        </button>
        <button
          onclick={() => (activeTab = "agents")}
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 {activeTab === 'agents'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'}"
        >
          <span class="text-indigo-500">🤖</span>
          Agents
          <span class="text-xs bg-gray-200 px-1.5 rounded">{filteredAgents().length}</span>
        </button>
      </div>

      <!-- Search -->
      <div class="relative flex-1 max-w-xs">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search..."
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
    </div>

    <div class="flex items-center gap-2">
      <!-- Help button -->
      <button
        onclick={() => (showHelp = !showHelp)}
        class="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors {showHelp ? 'bg-blue-50 text-blue-600' : ''}"
        title="Show help"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      <!-- Scan button (for skills) -->
      {#if activeTab !== "agents"}
        <button
          onclick={handleScanSkills}
          disabled={scanningSkills}
          class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          title="Scan for changes on disk"
        >
          <svg
            class="w-4 h-4 {scanningSkills ? 'animate-spin' : ''}"
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
      {/if}

      <!-- Import button (for skills) -->
      {#if activeTab !== "agents"}
        <button
          onclick={() => (showImport = true)}
          class="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import
        </button>
      {/if}

      <!-- Create dropdown -->
      <div class="relative group">
        <button
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
          <button
            onclick={handleCreateSkill}
            class="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <span class="text-amber-500">📄</span>
            New Skill
          </button>
          <button
            onclick={handleCreateAgent}
            class="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <span class="text-indigo-500">🤖</span>
            New Agent
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Help panel -->
  {#if showHelp}
    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
      <div class="flex items-start gap-4">
        <div class="shrink-0">
          <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-900 mb-3">Skills vs Agents</h3>
          <div class="grid md:grid-cols-2 gap-4 text-sm">
            <div class="bg-white/60 rounded-lg p-3">
              <div class="flex items-center gap-2 font-medium text-amber-700 mb-2">
                <span>📄</span> Skills
              </div>
              <ul class="space-y-1 text-gray-600">
                <li>• Instructions injected into Claude's context</li>
                <li>• Shared context with main conversation</li>
                <li>• Sequential execution</li>
                <li>• Use for: coding conventions, API patterns, project knowledge</li>
              </ul>
              <p class="text-xs text-gray-400 mt-2">Location: <code class="bg-gray-100 px-1 rounded">.claude/skills/</code></p>
            </div>
            <div class="bg-white/60 rounded-lg p-3">
              <div class="flex items-center gap-2 font-medium text-indigo-700 mb-2">
                <span>🤖</span> Agents
              </div>
              <ul class="space-y-1 text-gray-600">
                <li>• Isolated task executors via Task tool</li>
                <li>• Separate context from main agent</li>
                <li>• Can run in parallel</li>
                <li>• Use for: code reviews, multi-file analysis, sandboxed tasks</li>
              </ul>
              <p class="text-xs text-gray-400 mt-2">Location: <code class="bg-gray-100 px-1 rounded">.claude/agents/</code></p>
            </div>
          </div>
        </div>
        <button
          onclick={() => (showHelp = false)}
          class="p-1 text-gray-400 hover:text-gray-600"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Error display -->
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
      {error}
      <button onclick={() => { skillsError = null; agentsError = null; }} class="ml-2 text-red-500 hover:text-red-700">&times;</button>
    </div>
  {/if}

  <!-- Loading -->
  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else if allItems().length === 0}
    <!-- Empty state -->
    <div class="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <div class="w-16 h-16 bg-gradient-to-br from-amber-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span class="text-2xl">{activeTab === "agents" ? "🤖" : activeTab === "skills" ? "📄" : "✨"}</span>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        {#if activeTab === "agents"}
          No agents yet
        {:else if activeTab === "skills"}
          No skills yet
        {:else}
          No skills or agents yet
        {/if}
      </h3>
      <p class="text-gray-500 mb-6 max-w-md mx-auto">
        {#if activeTab === "agents"}
          Agents are isolated task executors that Claude can spawn for specialized work.
        {:else if activeTab === "skills"}
          Skills customize how Claude behaves in your projects.
        {:else}
          Skills inject instructions, Agents run as isolated workers.
        {/if}
      </p>
      <div class="flex items-center justify-center gap-3">
        {#if activeTab !== "agents" && showCreateExamples}
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
              <span>⚡</span>
            {/if}
            Add Example Skills
          </button>
        {/if}
        {#if activeTab !== "agents"}
          <button
            onclick={handleCreateSkill}
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <span>📄</span>
            Create Skill
          </button>
        {/if}
        {#if activeTab !== "skills"}
          <button
            onclick={handleCreateAgent}
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <span>🤖</span>
            Create Agent
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Items list -->
    <div class="grid gap-3">
      {#each allItems() as { type, item } (type + '-' + item.id)}
        {#if type === "skill"}
          {@const skill = item as Skill}
          <SkillCard
            {skill}
            {projectId}
            onEdit={() => handleEditSkill(skill)}
            onDelete={() => handleDeleteSkill(skill)}
            onToggleGlobal={() => handleToggleGlobal(skill)}
            onToggleProject={showProjectToggle && projectId ? () => handleToggleProject(skill) : undefined}
            onSync={() => handleSyncSkill(skill)}
            needsSync={skill.needs_sync}
          />
        {:else}
          {@const agent = item as Agent}
          <!-- Agent Card -->
          <div class="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors group">
            <div class="flex items-start gap-3">
              <div class="p-2 bg-indigo-100 rounded-lg shrink-0">
                <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="font-medium text-gray-900">{agent.name}</h3>
                  <span class="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">Agent</span>
                  {#if agent.model}
                    <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{agent.model}</span>
                  {/if}
                  {#if agent.scope === "project"}
                    <span class="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">Project</span>
                  {:else}
                    <span class="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">Global</span>
                  {/if}
                </div>
                <p class="text-sm text-gray-500 mt-1 line-clamp-2">{agent.description}</p>
                {#if agent.tools && agent.tools.length > 0}
                  <div class="flex flex-wrap gap-1 mt-2">
                    {#each agent.tools.slice(0, 5) as tool}
                      <span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tool}</span>
                    {/each}
                    {#if agent.tools.length > 5}
                      <span class="text-xs text-gray-400">+{agent.tools.length - 5} more</span>
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onclick={() => handleEditAgent(agent)}
                  class="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                  title="Edit"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onclick={() => handleDeleteAgent(agent)}
                  class="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                  title="Delete"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<!-- Editors -->
<SkillEditor
  open={showSkillEditor}
  onClose={() => (showSkillEditor = false)}
  skill={editingSkill}
  {projectId}
/>

<AgentEditor
  open={showAgentEditor}
  onClose={() => (showAgentEditor = false)}
  agent={editingAgent}
  {projectId}
  onSave={handleAgentSaved}
/>

<SkillImport
  open={showImport}
  onClose={() => (showImport = false)}
/>
