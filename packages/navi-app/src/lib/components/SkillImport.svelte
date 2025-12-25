<script lang="ts">
  import { skillsApi, type Skill } from "../api";
  import { skillLibrary } from "../stores";

  interface Props {
    open: boolean;
    onClose: () => void;
    onImported?: (skill: Skill) => void;
  }

  let { open, onClose, onImported }: Props = $props();

  type ImportMode = "file" | "url";
  let mode: ImportMode = $state("file");

  let fileInput: HTMLInputElement | null = $state(null);
  let selectedFile: File | null = $state(null);
  let urlInput = $state("");
  let useAi = $state(false);
  let importing = $state(false);
  let error: string | null = $state(null);

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      selectedFile = input.files[0];
      error = null;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      selectedFile = e.dataTransfer.files[0];
      error = null;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleImport() {
    error = null;
    importing = true;

    try {
      let skill: Skill;

      if (mode === "file") {
        if (!selectedFile) {
          error = "Please select a file";
          return;
        }
        skill = await skillsApi.importFile(selectedFile, useAi);
      } else {
        if (!urlInput.trim()) {
          error = "Please enter a URL";
          return;
        }
        skill = await skillsApi.importUrl(urlInput.trim(), useAi);
      }

      skillLibrary.add(skill);
      onImported?.(skill);
      resetForm();
      onClose();
    } catch (e: any) {
      error = e.message || "Import failed";
    } finally {
      importing = false;
    }
  }

  function resetForm() {
    selectedFile = null;
    urlInput = "";
    useAi = false;
    error = null;
    if (fileInput) fileInput.value = "";
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      resetForm();
    }
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-100 rounded-lg">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          </div>
          <h3 class="font-semibold text-lg text-gray-900">Import Skill</h3>
        </div>
        <button
          onclick={onClose}
          class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-6 space-y-5">
        <div class="flex gap-2 p-1 bg-gray-100 rounded-lg">
          <button
            onclick={() => (mode = "file")}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors {mode ===
            'file'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            From File
          </button>
          <button
            onclick={() => (mode = "url")}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors {mode ===
            'url'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            From URL
          </button>
        </div>

        {#if mode === "file"}
          <div
            class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
            ondrop={handleDrop}
            ondragover={handleDragOver}
            onclick={() => fileInput?.click()}
            role="button"
            tabindex="0"
          >
            <input
              bind:this={fileInput}
              type="file"
              accept=".md,.txt,.json,.zip"
              onchange={handleFileSelect}
              class="hidden"
            />

            {#if selectedFile}
              <div class="flex items-center justify-center gap-3">
                <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div class="text-left">
                  <p class="font-medium text-gray-900">{selectedFile.name}</p>
                  <p class="text-sm text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            {:else}
              <svg class="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p class="text-gray-600 mb-1">Drop a file here or click to browse</p>
              <p class="text-sm text-gray-400">Supports .md, .txt, .json, .zip files</p>
            {/if}
          </div>
        {:else}
          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">GitHub/GitLab URL</label>
            <input
              type="url"
              bind:value={urlInput}
              placeholder="https://github.com/user/repo/blob/main/skill.md"
              class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
            />
            <p class="text-xs text-gray-500">
              Paste a link to a SKILL.md, README, or any markdown file from GitHub, GitLab, or Gist.
            </p>
          </div>
        {/if}

        <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <input
            type="checkbox"
            id="useAi"
            bind:checked={useAi}
            class="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
          />
          <label for="useAi" class="flex-1 cursor-pointer">
            <span class="block text-sm font-medium text-amber-900">Use AI to convert</span>
            <span class="block text-xs text-amber-700 mt-0.5">
              If the file isn't already in SKILL.md format, use Claude Haiku to convert it into proper skill
              instructions. Requires API key.
            </span>
          </label>
        </div>

        {#if error}
          <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleImport}
          disabled={importing || (mode === "file" && !selectedFile) || (mode === "url" && !urlInput.trim())}
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50"
        >
          {#if importing}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            {useAi ? "Converting..." : "Importing..."}
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import Skill
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
