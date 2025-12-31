<script lang="ts">
  import { editorState, markDirty, setEditorContent, loadFileContent, saveFileContent } from "../../stores";

  let content = $state("");
  let loading = $state(false);
  let saving = $state(false);
  let parseError = $state<string | null>(null);

  // Load file content from API
  async function loadContent() {
    if (!$editorState.currentPath) return;

    loading = true;
    try {
      const fileContent = await loadFileContent($editorState.currentPath);
      if (fileContent !== null) {
        content = fileContent;
        setEditorContent(content);
        validateSchema(content);
      }
    } finally {
      loading = false;
    }
  }

  function validateSchema(code: string) {
    parseError = null;

    // Basic validation - check for Input and Output interfaces
    if (!code.includes("interface Input")) {
      parseError = "Missing Input interface";
      return;
    }
    if (!code.includes("interface Output")) {
      parseError = "Missing Output interface";
      return;
    }
  }

  async function handleSave() {
    if (!$editorState.currentPath) return;

    saving = true;
    try {
      await saveFileContent($editorState.currentPath, content);
    } finally {
      saving = false;
    }
  }

  function handleChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    content = target.value;
    validateSchema(content);
    markDirty();
  }

  // Keyboard shortcut for save
  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  }

  $effect(() => {
    if ($editorState.currentPath) {
      loadContent();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full flex flex-col">
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else}
    <!-- Schema info bar -->
    <div class="px-4 py-2 border-b border-gray-100 bg-purple-50 flex items-center gap-2">
      <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span class="text-xs font-medium text-purple-700">TypeScript Schema</span>
      <span class="text-xs text-purple-500">Define Input/Output types for the test harness</span>

      {#if parseError}
        <span class="ml-auto text-xs text-red-600 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {parseError}
        </span>
      {:else}
        <span class="ml-auto text-xs text-green-600 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Valid schema
        </span>
      {/if}

      {#if $editorState.isDirty}
        <button
          onclick={handleSave}
          disabled={saving}
          class="ml-2 px-2 py-1 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      {/if}
    </div>

    <!-- TypeScript editor -->
    <div class="flex-1 overflow-hidden">
      <textarea
        bind:value={content}
        oninput={handleChange}
        class="w-full h-full p-4 text-sm font-mono resize-none focus:outline-none bg-gray-900 text-gray-100"
        placeholder="// Define Input and Output interfaces..."
        spellcheck="false"
      ></textarea>
    </div>
  {/if}
</div>
