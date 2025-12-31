<script lang="ts">
  import {
    editorState,
    currentAgent,
    markDirty,
    setEditorContent,
    loadFileContent,
    saveFileContent,
  } from "../../stores";
  import { AVAILABLE_TOOLS } from "../../types";
  import type { AgentFrontmatter } from "../../types";

  let content = $state("");
  let frontmatter = $state<AgentFrontmatter | null>(null);
  let bodyContent = $state("");
  let loading = $state(false);
  let saving = $state(false);
  let selectedTools = $state<string[]>([]);

  // Parse frontmatter from markdown
  function parseFrontmatter(md: string): { frontmatter: AgentFrontmatter | null; body: string } {
    const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: null, body: md };
    }

    try {
      const yamlContent = match[1];
      const fm: AgentFrontmatter = {};
      let currentKey = "";
      let inArray = false;
      const arrayValues: string[] = [];

      for (const line of yamlContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("- ") && inArray) {
          arrayValues.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
          continue;
        }

        if (inArray && currentKey) {
          (fm as any)[currentKey] = [...arrayValues];
          arrayValues.length = 0;
          inArray = false;
        }

        const colonIndex = trimmed.indexOf(":");
        if (colonIndex > 0) {
          const key = trimmed.slice(0, colonIndex).trim();
          let value = trimmed.slice(colonIndex + 1).trim();

          currentKey = key;

          if (value === "" || value === "|") {
            inArray = true;
          } else {
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            (fm as any)[key] = value;
          }
        }
      }

      if (inArray && currentKey && arrayValues.length > 0) {
        (fm as any)[currentKey] = [...arrayValues];
      }

      return { frontmatter: fm as AgentFrontmatter, body: match[2].trim() };
    } catch {
      return { frontmatter: null, body: md };
    }
  }

  // Generate frontmatter string
  function generateFrontmatter(fm: AgentFrontmatter): string {
    const lines = ["---"];

    if (fm.name) lines.push(`name: "${fm.name}"`);
    if (fm.description) lines.push(`description: "${fm.description}"`);
    if (fm.model) lines.push(`model: ${fm.model}`);

    if (fm.tools && fm.tools.length > 0) {
      lines.push("tools:");
      for (const tool of fm.tools) {
        lines.push(`  - ${tool}`);
      }
    }

    if (fm.skills && fm.skills.length > 0) {
      lines.push("skills:");
      for (const skill of fm.skills) {
        lines.push(`  - ${skill}`);
      }
    }

    if (fm.subAgents && fm.subAgents.length > 0) {
      lines.push("subAgents:");
      for (const agent of fm.subAgents) {
        lines.push(`  - ${agent}`);
      }
    }

    if (fm.scripts && fm.scripts.length > 0) {
      lines.push("scripts:");
      for (const script of fm.scripts) {
        lines.push(`  - ${script}`);
      }
    }

    lines.push("---");
    return lines.join("\n");
  }

  // Load file content from API
  async function loadContent() {
    if (!$editorState.currentPath) return;

    loading = true;
    try {
      const fileContent = await loadFileContent($editorState.currentPath);
      if (fileContent !== null) {
        content = fileContent;
        const { frontmatter: fm, body } = parseFrontmatter(content);
        frontmatter = fm;
        bodyContent = body;
        selectedTools = fm?.tools || [];
        setEditorContent(content);
      }
    } finally {
      loading = false;
    }
  }

  // Save file
  async function handleSave() {
    if (!$editorState.currentPath) return;

    saving = true;
    try {
      // Rebuild content with updated frontmatter
      const updatedFm: AgentFrontmatter = {
        ...frontmatter,
        tools: selectedTools,
      };
      const newContent = generateFrontmatter(updatedFm) + "\n" + bodyContent;

      const success = await saveFileContent($editorState.currentPath, newContent);
      if (success) {
        content = newContent;
      }
    } finally {
      saving = false;
    }
  }

  function handleBodyChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    bodyContent = target.value;
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
    <!-- Tools selector -->
    <div class="px-4 py-3 border-b border-gray-100 bg-gray-50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-gray-600">Enabled Tools</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">{selectedTools.length} selected</span>
          {#if $editorState.isDirty}
            <button
              onclick={handleSave}
              disabled={saving}
              class="px-2 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          {/if}
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5">
        {#each AVAILABLE_TOOLS as tool}
          <button
            onclick={() => toggleTool(tool)}
            class="px-2 py-1 text-xs rounded-md border transition-colors {selectedTools.includes(tool)
              ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}"
          >
            {tool}
          </button>
        {/each}
      </div>
    </div>

    <!-- Markdown editor -->
    <div class="flex-1 overflow-hidden">
      <textarea
        bind:value={bodyContent}
        oninput={handleBodyChange}
        class="w-full h-full p-4 text-sm font-mono resize-none focus:outline-none bg-white"
        placeholder="# Agent Instructions

Write your agent's prompt here..."
        spellcheck="false"
      ></textarea>
    </div>
  {/if}
</div>
