<script lang="ts">
  import { editorState, markDirty, setEditorContent, loadFileContent, saveFileContent } from "../../stores";
  import { AVAILABLE_TOOLS } from "../../types";

  let content = $state("");
  let loading = $state(false);
  let saving = $state(false);
  let selectedTools = $state<string[]>([]);
  let skillName = $state("");
  let skillDescription = $state("");

  // Load file content from API
  async function loadContent() {
    if (!$editorState.currentPath) return;

    loading = true;
    try {
      // Extract skill name from path
      const pathParts = $editorState.currentPath.split("/");
      const fileName = pathParts.pop() || "";
      skillName = fileName.replace(".md", "").replace("SKILL", "");

      const fileContent = await loadFileContent($editorState.currentPath);
      if (fileContent !== null) {
        content = fileContent;
        setEditorContent(content);

        // Try to extract tools from content (simple parsing)
        const toolsMatch = content.match(/tools?:\s*\n((?:\s*-\s*.+\n?)+)/i);
        if (toolsMatch) {
          selectedTools = toolsMatch[1]
            .split("\n")
            .map(line => line.replace(/^\s*-\s*/, "").trim())
            .filter(Boolean);
        }
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

  function handleContentChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    content = target.value;
    markDirty();
  }

  function toggleTool(tool: string) {
    if (selectedTools.includes(tool)) {
      selectedTools = selectedTools.filter((t) => t !== tool);
    } else {
      selectedTools = [...selectedTools, tool];
    }
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
    <!-- Skill metadata -->
    <div class="px-4 py-3 border-b border-gray-100 bg-amber-50 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span class="text-xs font-medium text-amber-700">Skill Editor</span>
        </div>
        {#if $editorState.isDirty}
          <button
            onclick={handleSave}
            disabled={saving}
            class="px-2 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        {/if}
      </div>

      <div>
        <span class="block text-xs font-medium text-gray-600 mb-1">Required Tools</span>
        <div class="flex flex-wrap gap-1">
          {#each AVAILABLE_TOOLS as tool}
            <button
              onclick={() => toggleTool(tool)}
              class="px-2 py-0.5 text-xs rounded border transition-colors {selectedTools.includes(tool)
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}"
            >
              {tool}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Markdown editor -->
    <div class="flex-1 overflow-hidden">
      <textarea
        bind:value={content}
        oninput={handleContentChange}
        class="w-full h-full p-4 text-sm font-mono resize-none focus:outline-none bg-white"
        placeholder="# Skill Name

## When to Use

...

## Instructions

..."
        spellcheck="false"
      ></textarea>
    </div>
  {/if}
</div>
