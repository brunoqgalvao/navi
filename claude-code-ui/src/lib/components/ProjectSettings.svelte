<script lang="ts">
  import { api, type Project, type PermissionSettings } from "../api";
  import { onMount } from "svelte";
  import { availableModels, type ModelInfo } from "../stores";
  import { marked } from "marked";
  import SkillLibrary from "./SkillLibrary.svelte";

  interface Props {
    project: Project;
    onClose: () => void;
  }

  let { project, onClose }: Props = $props();

  type Tab = "instructions" | "model" | "permissions" | "skills";
  let activeTab: Tab = $state("instructions");

  let claudeMd = $state("");
  let claudeMdExists = $state(false);
  let claudeMdDraft = $state("");
  let isEditing = $state(false);
  let saving = $state(false);
  let loading = $state(true);

  let defaultModel = $state("");
  let savingModel = $state(false);
  let models = $state<ModelInfo[]>([]);

  let permissionSettings = $state<PermissionSettings | null>(null);
  let defaultTools = $state<string[]>([]);
  let dangerousTools = $state<string[]>([]);
  let savingPermissions = $state(false);

  let showPreview = $state(false);
  let previewHtml = $derived(claudeMdDraft ? marked(claudeMdDraft) : "");

  onMount(async () => {
    loading = true;
    try {
      const [claudeMdResult, perms] = await Promise.all([
        api.claudeMd.getProject(project.path),
        api.permissions.get(),
      ]);

      claudeMd = claudeMdResult.content || "";
      claudeMdExists = claudeMdResult.exists;
      claudeMdDraft = claudeMd;

      permissionSettings = perms.global;
      defaultTools = perms.defaults.tools;
      dangerousTools = perms.defaults.dangerous;
      
      availableModels.subscribe(m => {
        models = m;
      })();
    } catch (e) {
      console.error("Failed to load project settings:", e);
    } finally {
      loading = false;
    }
  });

  function startEditing() {
    claudeMdDraft = claudeMd;
    isEditing = true;
  }

  function cancelEditing() {
    claudeMdDraft = claudeMd;
    isEditing = false;
    showPreview = false;
  }

  async function saveClaudeMd() {
    saving = true;
    try {
      await api.claudeMd.setProject(project.path, claudeMdDraft);
      claudeMd = claudeMdDraft;
      claudeMdExists = true;
      isEditing = false;
      showPreview = false;
    } catch (e) {
      console.error("Failed to save CLAUDE.md:", e);
    } finally {
      saving = false;
    }
  }

  async function deleteClaudeMd() {
    if (!confirm("Delete CLAUDE.md from this project?")) return;
    saving = true;
    try {
      await api.claudeMd.deleteProject(project.path);
      claudeMd = "";
      claudeMdExists = false;
      claudeMdDraft = "";
      isEditing = false;
    } catch (e) {
      console.error("Failed to delete CLAUDE.md:", e);
    } finally {
      saving = false;
    }
  }

  async function createFromTemplate() {
    saving = true;
    try {
      const result = await api.claudeMd.initProject(project.path);
      if (result.created || result.exists) {
        const claudeMdResult = await api.claudeMd.getProject(project.path);
        claudeMd = claudeMdResult.content || "";
        claudeMdExists = true;
        claudeMdDraft = claudeMd;
        isEditing = true;
      }
    } catch (e) {
      console.error("Failed to create CLAUDE.md:", e);
    } finally {
      saving = false;
    }
  }

  async function saveModel() {
    savingModel = true;
    try {
      // TODO: Implement project-specific model settings API
      console.log("Model setting saved locally:", defaultModel);
    } catch (e) {
      console.error("Failed to save model setting:", e);
    } finally {
      savingModel = false;
    }
  }

  async function savePermissions() {
    if (!permissionSettings) return;
    savingPermissions = true;
    try {
      await api.permissions.set(permissionSettings);
    } catch (e) {
      console.error("Failed to save permissions:", e);
    } finally {
      savingPermissions = false;
    }
  }

  function toggleAutoAccept() {
    if (!permissionSettings) return;
    permissionSettings = { ...permissionSettings, autoAcceptAll: !permissionSettings.autoAcceptAll };
    savePermissions();
  }

  function toggleAllowedTool(tool: string) {
    if (!permissionSettings) return;
    const current = permissionSettings.allowedTools;
    if (current.includes(tool)) {
      permissionSettings = { 
        ...permissionSettings, 
        allowedTools: current.filter(t => t !== tool),
        requireConfirmation: permissionSettings.requireConfirmation.filter(t => t !== tool)
      };
    } else {
      permissionSettings = { ...permissionSettings, allowedTools: [...current, tool] };
    }
    savePermissions();
  }

  function toggleRequireConfirmation(tool: string) {
    if (!permissionSettings) return;
    const current = permissionSettings.requireConfirmation;
    if (current.includes(tool)) {
      permissionSettings = { ...permissionSettings, requireConfirmation: current.filter(t => t !== tool) };
    } else {
      permissionSettings = { ...permissionSettings, requireConfirmation: [...current, tool] };
    }
    savePermissions();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (isEditing) {
        cancelEditing();
      } else {
        onClose();
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "s" && isEditing) {
      e.preventDefault();
      saveClaudeMd();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 z-50 bg-white flex flex-col">
  <header class="border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-4">
      <button
        onclick={onClose}
        class="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>
      <div>
        <h1 class="text-lg font-semibold text-gray-900">Workspace Settings</h1>
        <p class="text-sm text-gray-500 truncate max-w-md" title={project.path}>{project.name}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if isEditing}
        <button
          onclick={cancelEditing}
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={saveClaudeMd}
          disabled={saving}
          class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      {/if}
    </div>
  </header>

  <div class="flex flex-1 min-h-0">
    <nav class="w-56 border-r border-gray-100 bg-gray-50/50 p-4 shrink-0">
      <div class="space-y-1">
        <button
          onclick={() => activeTab = "instructions"}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {activeTab === 'instructions' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Instructions
        </button>
        <button
          onclick={() => activeTab = "model"}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {activeTab === 'model' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Model
        </button>
        <button
          onclick={() => activeTab = "permissions"}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {activeTab === 'permissions' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Permissions
        </button>
        <button
          onclick={() => activeTab = "skills"}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {activeTab === 'skills' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Skills
        </button>
      </div>

      <div class="mt-8 pt-6 border-t border-gray-200">
        <p class="text-xs text-gray-400 px-3">Future settings</p>
        <div class="mt-2 space-y-1 opacity-50">
          <div class="flex items-center gap-3 px-3 py-2 text-sm text-gray-400">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Integrations
          </div>
          <div class="flex items-center gap-3 px-3 py-2 text-sm text-gray-400">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Skills
          </div>
        </div>
      </div>
    </nav>

    <main class="flex-1 overflow-hidden">
      {#if loading}
        <div class="flex items-center justify-center h-full">
          <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

      {:else if activeTab === "instructions"}
        <div class="h-full flex flex-col">
          {#if isEditing}
            <div class="border-b border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
              <div class="flex items-center gap-4">
                <span class="text-sm font-medium text-gray-700">CLAUDE.md</span>
                <span class="text-xs text-gray-400">{project.path}/CLAUDE.md</span>
              </div>
              <div class="flex items-center gap-2">
                <button
                  onclick={() => showPreview = !showPreview}
                  class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors {showPreview ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}"
                >
                  {showPreview ? "Hide Preview" : "Show Preview"}
                </button>
              </div>
            </div>
            
            <div class="flex-1 flex min-h-0">
              <div class="flex-1 flex flex-col min-w-0 {showPreview ? 'border-r border-gray-200' : ''}">
                <textarea
                  bind:value={claudeMdDraft}
                  class="flex-1 w-full p-6 font-mono text-sm text-gray-800 bg-white resize-none focus:outline-none"
                  placeholder="# Project Instructions

Write instructions for Claude here. This file tells Claude:
- Project context and goals
- Coding conventions to follow
- Important files and directories
- Testing and build commands
- Any other project-specific guidance"
                  spellcheck="false"
                ></textarea>
              </div>
              
              {#if showPreview}
                <div class="flex-1 overflow-y-auto p-6 bg-gray-50 prose prose-sm max-w-none">
                  {@html previewHtml}
                </div>
              {/if}
            </div>

          {:else}
            <div class="h-full overflow-y-auto">
              <div class="max-w-3xl mx-auto p-8">
                <div class="flex items-center justify-between mb-6">
                  <div>
                    <h2 class="text-xl font-semibold text-gray-900">CLAUDE.md</h2>
                    <p class="text-sm text-gray-500 mt-1">Project instructions that Claude reads when working on this codebase</p>
                  </div>
                  {#if claudeMdExists}
                    <div class="flex items-center gap-2">
                      <button
                        onclick={deleteClaudeMd}
                        disabled={saving}
                        class="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onclick={startEditing}
                        class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  {/if}
                </div>

                {#if claudeMdExists && claudeMd}
                  <div class="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                    <div class="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
                      <code class="text-xs text-gray-500 font-mono">{project.path}/CLAUDE.md</code>
                      <span class="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                    <div class="p-6 prose prose-sm max-w-none">
                      {@html marked(claudeMd)}
                    </div>
                  </div>
                {:else}
                  <div class="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                    <svg class="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No CLAUDE.md file</h3>
                    <p class="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                      Create a CLAUDE.md file to give Claude context about this project, coding conventions, and specific instructions.
                    </p>
                    <div class="flex items-center justify-center gap-3">
                      <button
                        onclick={createFromTemplate}
                        disabled={saving}
                        class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50"
                      >
                        {saving ? "Creating..." : "Create from Template"}
                      </button>
                      <button
                        onclick={() => { claudeMdDraft = ""; isEditing = true; }}
                        class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
                      >
                        Start from Scratch
                      </button>
                    </div>
                  </div>
                {/if}

                <div class="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 class="text-sm font-medium text-blue-900 mb-2">What to include in CLAUDE.md</h4>
                  <ul class="text-sm text-blue-700 space-y-1">
                    <li>- Project overview and goals</li>
                    <li>- Tech stack and architecture decisions</li>
                    <li>- Coding conventions and style guides</li>
                    <li>- Important directories and files</li>
                    <li>- Build, test, and deploy commands</li>
                    <li>- Common gotchas or edge cases</li>
                  </ul>
                </div>
              </div>
            </div>
          {/if}
        </div>

      {:else if activeTab === "model"}
        <div class="h-full overflow-y-auto">
          <div class="max-w-2xl mx-auto p-8">
            <div class="mb-6">
              <h2 class="text-xl font-semibold text-gray-900">Default Model</h2>
              <p class="text-sm text-gray-500 mt-1">Choose the default model for new conversations in this project</p>
            </div>

            <div class="bg-gray-50 rounded-xl border border-gray-200 p-6">
              <label class="block text-sm font-medium text-gray-700 mb-3">Model</label>
              <select
                bind:value={defaultModel}
                onchange={saveModel}
                disabled={savingModel}
                class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors disabled:opacity-50"
              >
                <option value="">Use global default</option>
                {#each models as model}
                  <option value={model.value}>{model.displayName}</option>
                {/each}
              </select>
              <p class="text-xs text-gray-500 mt-2">
                This setting will be used when starting new chats in this project.
              </p>
            </div>

            <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p class="text-sm text-amber-700">
                <strong>Note:</strong> Model selection is still in development. For now, models are selected per-session.
              </p>
            </div>
          </div>
        </div>

      {:else if activeTab === "permissions"}
        <div class="h-full overflow-y-auto">
          <div class="max-w-2xl mx-auto p-8">
            <div class="mb-6">
              <h2 class="text-xl font-semibold text-gray-900">Tool Permissions</h2>
              <p class="text-sm text-gray-500 mt-1">Control which tools Claude can use in this project</p>
            </div>

            {#if permissionSettings}
              <div class="space-y-6">
                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <div class="flex items-center justify-between">
                    <div>
                      <h5 class="font-medium text-gray-900">Auto-accept all tools</h5>
                      <p class="text-sm text-gray-500">Skip confirmation for all tool uses (not recommended)</p>
                    </div>
                    <button
                      onclick={toggleAutoAccept}
                      disabled={savingPermissions}
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {permissionSettings.autoAcceptAll ? 'bg-amber-500' : 'bg-gray-300'}"
                    >
                      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {permissionSettings.autoAcceptAll ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                  </div>
                </div>

                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-5">
                  <div>
                    <h5 class="font-medium text-gray-900 mb-1">Allowed Tools</h5>
                    <p class="text-sm text-gray-500 mb-4">Which tools Claude is allowed to use</p>
                    <div class="grid grid-cols-2 gap-2">
                      {#each defaultTools as tool}
                        <label class="flex items-center gap-3 cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-300 transition-colors">
                          <input
                            type="checkbox"
                            checked={permissionSettings.allowedTools.includes(tool)}
                            onchange={() => toggleAllowedTool(tool)}
                            disabled={savingPermissions}
                            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span class="text-sm text-gray-900">{tool}</span>
                        </label>
                      {/each}
                    </div>
                  </div>
                </div>

                {#if !permissionSettings.autoAcceptAll}
                  <div class="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-5">
                    <div>
                      <h5 class="font-medium text-amber-900 mb-1">Require Confirmation</h5>
                      <p class="text-sm text-amber-700 mb-4">These tools will show a confirmation dialog before executing</p>
                      <div class="grid grid-cols-2 gap-2">
                        {#each defaultTools as tool}
                          {@const isAllowed = permissionSettings.allowedTools.includes(tool)}
                          {@const isDangerous = dangerousTools.includes(tool)}
                          <label class="flex items-center gap-3 cursor-pointer bg-white border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-300 transition-colors {!isAllowed ? 'opacity-50' : ''}">
                            <input
                              type="checkbox"
                              checked={permissionSettings.requireConfirmation.includes(tool)}
                              onchange={() => toggleRequireConfirmation(tool)}
                              disabled={savingPermissions || !isAllowed}
                              class="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span class="text-sm text-gray-900">{tool}</span>
                            {#if isDangerous}
                              <span class="text-xs text-amber-600 ml-auto">!</span>
                            {/if}
                          </label>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <p class="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    Tools marked with <span class="font-bold">!</span> are potentially dangerous. When a tool requires confirmation, you'll see a dialog before it executes.
                  </p>
                {/if}
              </div>

              <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p class="text-sm text-blue-700">
                  <strong>Note:</strong> These settings currently apply globally. Project-specific permissions are coming soon.
                </p>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === "skills"}
        <div class="space-y-6">
          <div>
            <h4 class="text-lg font-semibold text-gray-900 mb-1">Project Skills</h4>
            <p class="text-sm text-gray-500">Enable skills for this project. Skills are copied to <code class="bg-gray-200 px-1 rounded text-xs">.claude/skills/</code> in your project.</p>
          </div>

          <SkillLibrary projectId={project.id} showProjectToggle={true} />
        </div>
      {/if}
    </main>
  </div>
</div>
