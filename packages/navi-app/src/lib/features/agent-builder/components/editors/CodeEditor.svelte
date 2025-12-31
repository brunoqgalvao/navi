<script lang="ts">
  import { editorState, markDirty, setEditorContent, loadFileContent, saveFileContent } from "../../stores";

  let content = $state("");
  let loading = $state(false);
  let saving = $state(false);
  let language = $state("typescript");
  let lineNumbers = $state<number[]>([]);

  // Detect language from file extension
  function detectLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
    };
    return langMap[ext || ""] || "plaintext";
  }

  // Update line numbers
  function updateLineNumbers() {
    const lines = content.split("\n").length;
    lineNumbers = Array.from({ length: lines }, (_, i) => i + 1);
  }

  // Load file content from API
  async function loadContent() {
    if (!$editorState.currentPath) return;

    loading = true;
    try {
      language = detectLanguage($editorState.currentPath);

      const fileContent = await loadFileContent($editorState.currentPath);
      if (fileContent !== null) {
        content = fileContent;
        setEditorContent(content);
        updateLineNumbers();
      }
    } finally {
      loading = false;
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
    updateLineNumbers();
    markDirty();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Cmd/Ctrl+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
      return;
    }

    // Tab key inserts spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      content = content.substring(0, start) + "  " + content.substring(end);
      updateLineNumbers();

      // Move cursor
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });

      markDirty();
    }
  }

  $effect(() => {
    if ($editorState.currentPath) {
      loadContent();
    }
  });
</script>

<div class="h-full flex flex-col bg-gray-900">
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else}
    <!-- Language indicator -->
    <div class="px-4 py-1.5 border-b border-gray-700 bg-gray-800 flex items-center gap-2">
      <span class="text-xs font-medium text-gray-400">{language}</span>
      <div class="flex-1"></div>
      {#if $editorState.isDirty}
        <button
          onclick={handleSave}
          disabled={saving}
          class="text-xs text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save (⌘S)"}
        </button>
      {/if}
    </div>

    <!-- Code editor with line numbers -->
    <div class="flex-1 overflow-auto flex">
      <!-- Line numbers -->
      <div class="py-4 px-2 text-right text-xs font-mono text-gray-600 select-none bg-gray-800 border-r border-gray-700">
        {#each lineNumbers as num}
          <div class="leading-5">{num}</div>
        {/each}
      </div>

      <!-- Editor -->
      <textarea
        bind:value={content}
        oninput={handleChange}
        onkeydown={handleKeyDown}
        class="flex-1 p-4 text-sm font-mono resize-none focus:outline-none bg-gray-900 text-gray-100 leading-5"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
      ></textarea>
    </div>
  {/if}
</div>
