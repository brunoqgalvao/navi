<script lang="ts">
  import { editorState, currentAgent, markDirty, setEditorContent } from "../stores";
  import PromptEditor from "./editors/PromptEditor.svelte";
  import SchemaEditor from "./editors/SchemaEditor.svelte";
  import SkillEditor from "./editors/SkillEditor.svelte";
  import CodeEditor from "./editors/CodeEditor.svelte";

  // Get the file name from path
  function getFileName(path: string | null): string {
    if (!path) return "";
    return path.split("/").pop() || "";
  }

  // Get breadcrumb parts
  function getBreadcrumbs(path: string | null): string[] {
    if (!path || !$currentAgent) return [];
    const agentPath = $currentAgent.path;
    const relativePath = path.replace(agentPath, "").replace(/^\//, "");
    return relativePath.split("/").filter(Boolean);
  }
</script>

<div class="h-full flex flex-col bg-white">
  {#if !$editorState.currentPath}
    <!-- Empty state -->
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 class="text-sm font-medium text-gray-900 mb-1">Select a file to edit</h3>
        <p class="text-xs text-gray-500">Choose a file from the navigator on the left</p>
      </div>
    </div>
  {:else}
    <!-- Editor header with breadcrumbs -->
    <div class="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
      <div class="flex items-center gap-1 text-sm">
        {#each getBreadcrumbs($editorState.currentPath) as part, i}
          {#if i > 0}
            <span class="text-gray-300">/</span>
          {/if}
          <span class="text-gray-500 hover:text-gray-700 cursor-pointer">{part}</span>
        {/each}
      </div>

      {#if $editorState.isDirty}
        <span class="ml-2 w-2 h-2 bg-amber-400 rounded-full" title="Unsaved changes"></span>
      {/if}

      <div class="flex-1"></div>

      <!-- Editor actions -->
      <div class="flex items-center gap-1">
        <button
          class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Format"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
        <button
          class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Save"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Editor content -->
    <div class="flex-1 overflow-hidden">
      {#if $editorState.editorType === "prompt"}
        <PromptEditor />
      {:else if $editorState.editorType === "schema"}
        <SchemaEditor />
      {:else if $editorState.editorType === "skill"}
        <SkillEditor />
      {:else if $editorState.editorType === "code" || $editorState.editorType === "agent"}
        <CodeEditor />
      {:else}
        <!-- Fallback: show raw content -->
        <div class="p-4">
          <p class="text-sm text-gray-500">
            Unknown editor type: {$editorState.editorType}
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
