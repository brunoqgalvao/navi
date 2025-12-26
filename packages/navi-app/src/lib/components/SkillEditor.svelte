<script lang="ts">
  import { skillsApi, type Skill, type CreateSkillInput, type UpdateSkillInput, type SkillFileInfo } from "../api";
  import { skillLibrary } from "../stores";

  interface Props {
    open: boolean;
    onClose: () => void;
    skill?: Skill | null;
    projectId?: string | null;
    onSave?: (skill: Skill) => void;
  }

  let { open, onClose, skill = null, projectId = null, onSave }: Props = $props();

  let name = $state("");
  let description = $state("");
  let body = $state("");
  let allowedTools = $state<string[]>([]);
  let license = $state("");
  let category = $state("");
  let tags = $state<string[]>([]);
  let tagInput = $state("");

  let saving = $state(false);
  let loading = $state(false);
  let error: string | null = $state(null);

  let skillFiles = $state<SkillFileInfo[]>([]);
  let skillPath = $state("");
  let loadingFiles = $state(false);
  let openingEditor = $state(false);

  const availableTools = [
    "Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep",
    "WebFetch", "WebSearch", "TodoWrite", "Task", "TaskOutput", "NotebookEdit"
  ];

  $effect(() => {
    if (open && skill) {
      loadSkill();
      loadFiles();
    } else if (open && !skill) {
      resetForm();
    }
  });

  async function loadSkill() {
    if (!skill) return;
    loading = true;
    try {
      const fullSkill = await skillsApi.get(skill.id);
      name = fullSkill.name;
      description = fullSkill.description;
      body = fullSkill.body || "";
      allowedTools = fullSkill.allowed_tools || [];
      license = fullSkill.license || "";
      category = fullSkill.category || "";
      tags = fullSkill.tags || [];
    } catch (e: any) {
      error = e.message || "Failed to load skill";
    } finally {
      loading = false;
    }
  }

  async function loadFiles() {
    if (!skill) {
      skillFiles = [];
      skillPath = "";
      return;
    }
    loadingFiles = true;
    try {
      const result = await skillsApi.getFiles(skill.id);
      skillFiles = result.files;
      skillPath = result.path;
    } catch (e: any) {
      console.error("Failed to load files:", e);
      skillFiles = [];
    } finally {
      loadingFiles = false;
    }
  }

  function resetForm() {
    name = "";
    description = "";
    body = `# Instructions

Write clear instructions for Claude here.

## When to Use

Describe when this skill should be activated.

## Guidelines

- Guideline 1
- Guideline 2
`;
    allowedTools = [];
    license = "";
    category = "";
    tags = [];
    tagInput = "";
    error = null;
    skillFiles = [];
    skillPath = "";
  }

  function toggleTool(tool: string) {
    if (allowedTools.includes(tool)) {
      allowedTools = allowedTools.filter((t) => t !== tool);
    } else {
      allowedTools = [...allowedTools, tool];
    }
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (tag && !tags.includes(tag)) {
      tags = [...tags, tag];
    }
    tagInput = "";
  }

  function removeTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
  }

  async function handleSave() {
    if (!name.trim()) {
      error = "Name is required";
      return;
    }
    if (!description.trim()) {
      error = "Description is required";
      return;
    }

    saving = true;
    error = null;

    try {
      let savedSkill: Skill;

      if (skill) {
        const updates: UpdateSkillInput = {
          name: name.trim(),
          description: description.trim(),
          body: body.trim(),
          allowed_tools: allowedTools.length > 0 ? allowedTools : undefined,
          license: license.trim() || undefined,
          category: category.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        };
        savedSkill = await skillsApi.update(skill.id, updates);
        skillLibrary.update(savedSkill);
      } else {
        const input: CreateSkillInput = {
          name: name.trim(),
          description: description.trim(),
          body: body.trim(),
          allowed_tools: allowedTools.length > 0 ? allowedTools : undefined,
          license: license.trim() || undefined,
          category: category.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        };
        savedSkill = await skillsApi.create(input);
        
        if (projectId) {
          await skillsApi.enableForProject(projectId, savedSkill.id);
          savedSkill = { ...savedSkill, enabled_projects: [projectId] };
        }
        
        skillLibrary.add(savedSkill);
      }

      onSave?.(savedSkill);
      onClose();
    } catch (e: any) {
      error = e.message || "Failed to save skill";
    } finally {
      saving = false;
    }
  }

  async function handleOpenInEditor(editor: "code" | "cursor" | "zed" | "finder") {
    if (!skill) return;
    openingEditor = true;
    try {
      await skillsApi.openInEditor(skill.id, editor);
    } catch (e: any) {
      error = e.message || "Failed to open editor";
    } finally {
      openingEditor = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleClickOutsideMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (showEditorMenu && !target.closest('.editor-menu-container')) {
      showEditorMenu = false;
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  let hasExtraFiles = $derived(skillFiles.filter(f => f.path !== "SKILL.md").length > 0);
  let showEditorMenu = $state(false);
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
    onclick={(e) => { handleBackdropClick(e); handleClickOutsideMenu(e); }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onclick={handleClickOutsideMenu}
    >
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-amber-100 rounded-lg">
            <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-lg text-gray-900">
              {skill ? "Edit Skill" : "Create New Skill"}
            </h3>
            {#if skill && skillPath}
              <p class="text-xs text-gray-400 font-mono truncate max-w-md">{skillPath}</p>
            {/if}
          </div>
        </div>
        <div class="flex items-center gap-2">
          {#if skill}
            <div class="relative editor-menu-container">
              <button
                onclick={() => showEditorMenu = !showEditorMenu}
                disabled={openingEditor}
                class="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                title="Open in editor"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.583 2.624l-4.066 3.876-5.76-4.5L0 7.322v9.356l7.757 5.322 5.76-4.5 4.066 3.876L24 17.5V6.5l-6.417-3.876zM7.5 15.5l-4.5-3.5 4.5-3.5v7zm9-7l4.5 3.5-4.5 3.5v-7z"/>
                </svg>
                {openingEditor ? "Opening..." : "Open in..."}
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {#if showEditorMenu}
                <div 
                  class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-36"
                >
                  <button
                    onclick={() => { showEditorMenu = false; handleOpenInEditor("code"); }}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.583 2.624l-4.066 3.876-5.76-4.5L0 7.322v9.356l7.757 5.322 5.76-4.5 4.066 3.876L24 17.5V6.5l-6.417-3.876zM7.5 15.5l-4.5-3.5 4.5-3.5v7zm9-7l4.5 3.5-4.5 3.5v-7z"/>
                    </svg>
                    VS Code
                  </button>
                  <button
                    onclick={() => { showEditorMenu = false; handleOpenInEditor("cursor"); }}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Cursor
                  </button>
                  <button
                    onclick={() => { showEditorMenu = false; handleOpenInEditor("zed"); }}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Zed
                  </button>
                  <div class="border-t border-gray-100 my-1"></div>
                  <button
                    onclick={() => { showEditorMenu = false; handleOpenInEditor("finder"); }}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Reveal in Finder
                  </button>
                </div>
              {/if}
            </div>
          {/if}
          <button
            onclick={onClose}
            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        {#if loading}
          <div class="flex items-center justify-center h-full">
            <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        {:else}
          <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  bind:value={name}
                  placeholder="My Skill"
                  class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  bind:value={category}
                  placeholder="coding, testing, etc."
                  class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                bind:value={description}
                placeholder="A brief description of what this skill does"
                class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Instructions (SKILL.md body)</label>
              <textarea
                bind:value={body}
                rows="10"
                placeholder="# Instructions&#10;&#10;Write clear instructions for Claude here..."
                class="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors resize-none"
              ></textarea>
            </div>

            {#if skill && skillFiles.length > 0}
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Skill Files</label>
                {#if hasExtraFiles}
                  <p class="text-xs text-amber-600 mb-2">
                    This skill has additional files. Use VS Code to edit scripts, templates, or references.
                  </p>
                {/if}
                <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <div class="divide-y divide-gray-100">
                    {#each skillFiles as file}
                      <div class="flex items-center gap-3 px-3 py-2 text-sm {file.type === 'directory' ? 'bg-gray-100/50' : ''}">
                        {#if file.type === "directory"}
                          <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        {:else}
                          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        {/if}
                        <span class="font-mono text-gray-700 {file.path === 'SKILL.md' ? 'font-medium' : ''}">{file.path}</span>
                        {#if file.size !== undefined}
                          <span class="text-xs text-gray-400 ml-auto">{formatSize(file.size)}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Allowed Tools</label>
              <p class="text-xs text-gray-500 mb-3">Select which tools Claude can use when this skill is active. Leave empty to allow all tools.</p>
              <div class="flex flex-wrap gap-2">
                {#each availableTools as tool}
                  <button
                    type="button"
                    onclick={() => toggleTool(tool)}
                    class="px-3 py-1.5 text-sm rounded-lg border transition-colors {allowedTools.includes(tool)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}"
                  >
                    {tool}
                  </button>
                {/each}
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">License</label>
                <input
                  type="text"
                  bind:value={license}
                  placeholder="MIT, Apache-2.0, etc."
                  class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={tagInput}
                    placeholder="Add tag"
                    class="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
                    onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  />
                  <button
                    type="button"
                    onclick={addTag}
                    class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {#if tags.length > 0}
                  <div class="flex flex-wrap gap-1 mt-2">
                    {#each tags as tag}
                      <span class="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        #{tag}
                        <button onclick={() => removeTag(tag)} class="text-gray-400 hover:text-gray-600">&times;</button>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            {#if error}
              <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleSave}
          disabled={saving || loading}
          class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : skill ? "Save Changes" : "Create Skill"}
        </button>
      </div>
    </div>
  </div>
{/if}
