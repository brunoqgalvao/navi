<script lang="ts">
  import { marketplaceApi, skillsApi, type MarketplaceSkill, type Skill } from "../api";
  import { skillLibrary, currentProject } from "../stores";
  import { showSuccess, showError } from "../errorHandler";

  interface Props {
    open: boolean;
    onClose: () => void;
    installTarget?: "global" | "project";
    projectId?: string | null;
    projectPath?: string | null;
    onInstalled?: (skill: Skill | null, scope: "global" | "project") => void;
  }

  let {
    open,
    onClose,
    installTarget = "global",
    projectId = null,
    projectPath = null,
    onInstalled,
  }: Props = $props();

  let searchQuery = $state("");
  let searching = $state(false);
  let results: MarketplaceSkill[] = $state([]);
  let installing = $state<string | null>(null);
  let error: string | null = $state(null);
  let activeTab: "search" | "trending" = $state("trending");
  let modalTitle = $derived(
    installTarget === "project" ? "Workspace Marketplace" : "Skills Marketplace"
  );
  let modalDescription = $derived(
    installTarget === "project"
      ? "Browse and install skills from skills.sh directly into this workspace."
      : "Browse and install skills from skills.sh."
  );
  let installButtonLabel = $derived(
    installTarget === "project" ? "Install to Workspace" : "Install"
  );

  // Load trending on mount
  $effect(() => {
    if (open && activeTab === "trending" && results.length === 0) {
      loadTrending();
    }
  });

  async function loadTrending() {
    searching = true;
    error = null;
    try {
      const res = await marketplaceApi.trending();
      results = res.skills;
    } catch (e: any) {
      error = e.message || "Failed to load trending skills";
    } finally {
      searching = false;
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      if (activeTab === "search") {
        results = [];
      }
      return;
    }

    activeTab = "search";
    searching = true;
    error = null;
    try {
      const res = await marketplaceApi.search(searchQuery);
      results = res.skills;
    } catch (e: any) {
      error = e.message || "Search failed";
    } finally {
      searching = false;
    }
  }

  function getProjectPath(): string | undefined {
    const trimmedPropPath = projectPath?.trim();
    if (trimmedPropPath) {
      return trimmedPropPath;
    }
    return $currentProject?.path;
  }

  function normalizeLookupKey(value: string | null | undefined): string {
    return value?.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/\/+$/, "") ?? "";
  }

  function findInstalledSkill(
    skills: Skill[],
    existingSlugs: Set<string>,
    requestedSkill?: string | null
  ): Skill | null {
    const lookupCandidates = new Set<string>();
    const normalizedRequestedSkill = normalizeLookupKey(requestedSkill);

    if (normalizedRequestedSkill) {
      lookupCandidates.add(normalizedRequestedSkill);
      const trailingSegment = normalizedRequestedSkill.split("/").filter(Boolean).pop();
      if (trailingSegment) {
        lookupCandidates.add(trailingSegment);
      }
    }

    if (lookupCandidates.size > 0) {
      const matched = skills.find((candidate) => {
        const slug = normalizeLookupKey(candidate.slug);
        const name = normalizeLookupKey(candidate.name);
        return lookupCandidates.has(slug) || lookupCandidates.has(name);
      });
      if (matched) {
        return matched;
      }
    }

    const newSkills = skills.filter((candidate) => !existingSlugs.has(candidate.slug));
    return newSkills.length === 1 ? newSkills[0] : null;
  }

  async function handleInstall(skill: MarketplaceSkill) {
    const source = skill.owner && skill.repo
      ? `${skill.owner}/${skill.repo}/${skill.id}`
      : skill.id;
    const installProjectPath = installTarget === "project" ? getProjectPath() : undefined;

    if (installTarget === "project" && !projectId) {
      error = "Workspace installs require an active workspace.";
      return;
    }

    if (installTarget === "project" && !installProjectPath) {
      error = "Workspace installs require a project path.";
      return;
    }

    installing = skill.id;
    error = null;
    const existingSlugs = new Set($skillLibrary.map((librarySkill) => librarySkill.slug));

    try {
      const result = await marketplaceApi.install(
        source,
        installTarget === "global",
        installProjectPath
      );

      await skillsApi.scan(installProjectPath);

      let skills = await skillsApi.list();
      let installedSkill = findInstalledSkill(skills, existingSlugs, result.requestedSkill);

      if (installedSkill) {
        if (installTarget === "global" && !installedSkill.enabled_globally) {
          await skillsApi.enableGlobal(installedSkill.id);
          skills = await skillsApi.list();
          installedSkill = skills.find((candidate) => candidate.id === installedSkill?.id) ?? installedSkill;
        }

        if (
          installTarget === "project" &&
          projectId &&
          !installedSkill.enabled_projects.includes(projectId)
        ) {
          await skillsApi.enableForProject(projectId, installedSkill.id);
          skills = await skillsApi.list();
          installedSkill = skills.find((candidate) => candidate.id === installedSkill?.id) ?? installedSkill;
        }
      }

      skillLibrary.set(skills);

      const installedLabel = installedSkill?.name || result.requestedSkill || skill.name;
      showSuccess(
        "Skill installed",
        installTarget === "project"
          ? `${installedLabel} is now available in this workspace`
          : `${installedLabel} has been installed globally`
      );
      onInstalled?.(installedSkill ?? null, installTarget);
    } catch (e: any) {
      error = e.message || "Install failed";
      showError({
        title: "Install failed",
        message: e.message || "Failed to install skill",
      });
    } finally {
      installing = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      handleSearch();
    }
    if (e.key === "Escape") {
      onClose();
    }
  }

  function formatInstalls(count: number): string {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return String(count);
  }
</script>

{#if open}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <div
      class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{modalTitle}</h2>
              <p class="text-sm text-gray-500">
                {modalDescription}
                {" "}
                <a href="https://skills.sh" target="_blank" rel="noopener" class="text-violet-600 hover:underline">skills.sh</a>
              </p>
            </div>
          </div>
          <button
            onclick={onClose}
            aria-label="Close marketplace"
            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Search -->
        <div class="relative">
          <input
            type="text"
            bind:value={searchQuery}
            onkeydown={handleKeydown}
            placeholder="Search skills (e.g., react, testing, docker...)"
            class="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all"
          />
          <svg
            class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {#if searchQuery}
            <button
              onclick={() => { searchQuery = ""; activeTab = "trending"; loadTrending(); }}
              aria-label="Clear search"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>

        <!-- Tabs -->
        <div class="flex gap-4 mt-4 border-b border-gray-100 -mb-px">
          <button
            onclick={() => { activeTab = "trending"; if (results.length === 0) loadTrending(); }}
            class="pb-3 text-sm font-medium transition-colors relative {activeTab === 'trending' ? 'text-violet-600' : 'text-gray-500 hover:text-gray-700'}"
          >
            Trending
            {#if activeTab === "trending"}
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-full"></div>
            {/if}
          </button>
          <button
            onclick={() => { activeTab = "search"; handleSearch(); }}
            class="pb-3 text-sm font-medium transition-colors relative {activeTab === 'search' ? 'text-violet-600' : 'text-gray-500 hover:text-gray-700'}"
          >
            Search Results
            {#if activeTab === "search"}
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-full"></div>
            {/if}
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if error}
          <div class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            {error}
            <button onclick={() => (error = null)} class="ml-2 text-red-500 hover:text-red-700">&times;</button>
          </div>
        {/if}

        {#if searching}
          <div class="flex items-center justify-center py-12">
            <svg class="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        {:else if results.length === 0}
          <div class="text-center py-12">
            <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p class="text-gray-500">
              {activeTab === "search" ? "No skills found. Try a different search." : "Loading trending skills..."}
            </p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each results as skill (skill.id + (skill.owner || '') + (skill.repo || ''))}
              <div class="group bg-white border border-gray-200 rounded-xl p-4 hover:border-violet-300 hover:shadow-md transition-all">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center shrink-0 group-hover:from-violet-100 group-hover:to-violet-200 transition-colors">
                    <svg class="w-6 h-6 text-gray-500 group-hover:text-violet-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-semibold text-gray-900 truncate">{skill.name}</h3>
                      {#if skill.version}
                        <span class="text-xs text-gray-400 font-mono">v{skill.version}</span>
                      {/if}
                    </div>

                    <p class="text-sm text-gray-500 line-clamp-2 mb-2">{skill.description || "No description"}</p>

                    <div class="flex items-center gap-4 text-xs text-gray-400">
                      {#if skill.owner && skill.repo}
                        <span class="flex items-center gap-1">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          {skill.owner}/{skill.repo}
                        </span>
                      {:else if skill.author}
                        <span class="flex items-center gap-1">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {skill.author}
                        </span>
                      {/if}

                      {#if skill.installs > 0}
                        <span class="flex items-center gap-1">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          {formatInstalls(skill.installs)} installs
                        </span>
                      {/if}

                      {#if skill.stars && skill.stars > 0}
                        <span class="flex items-center gap-1 text-amber-500">
                          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                          {skill.stars}
                        </span>
                      {/if}

                      {#if skill.category}
                        <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{skill.category}</span>
                      {/if}
                    </div>
                  </div>

                  <button
                    onclick={() => handleInstall(skill)}
                    disabled={installing === skill.id}
                    class="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
                  >
                    {#if installing === skill.id}
                      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                      Installing...
                    {:else}
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                      {installButtonLabel}
                    {/if}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div class="flex items-center justify-between text-sm text-gray-500">
          <span>
            {results.length} skill{results.length !== 1 ? "s" : ""} {activeTab === "search" && searchQuery ? `for "${searchQuery}"` : "trending"}
          </span>
          <a
            href="https://skills.sh"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1 text-violet-600 hover:text-violet-700"
          >
            View all on skills.sh
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  </div>
{/if}
