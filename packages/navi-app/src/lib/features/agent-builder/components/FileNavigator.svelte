<script lang="ts">
  import {
    currentAgent,
    agentFileTree,
    editorState,
    selectFile,
  } from "../stores";
  import type { AgentFileNode, EditorType } from "../types";
  import FileIcon from "../../../components/FileIcon.svelte";

  let expandedPaths = $state<Set<string>>(new Set());

  // Determine editor type from file
  function getEditorType(node: AgentFileNode): EditorType {
    if (node.type === "directory") return "config";

    const name = node.name.toLowerCase();
    const ext = node.extension?.toLowerCase();

    // Main agent/skill prompt
    if (name === "agent.md" || name === "skill.md") return "prompt";

    // Schema file
    if (name === "schema.ts") return "schema";

    // Skills folder
    if (node.path.includes("/skills/") && ext === "md") return "skill";

    // Sub-agents
    if (node.path.includes("/sub-agents/") && name === "agent.md") return "agent";

    // Scripts
    if (node.path.includes("/scripts/")) return "code";

    // Code files
    if (["ts", "js", "py", "sh", "bash"].includes(ext || "")) return "code";

    return "config";
  }

  function toggleExpand(path: string) {
    expandedPaths = new Set(expandedPaths);
    if (expandedPaths.has(path)) {
      expandedPaths.delete(path);
    } else {
      expandedPaths.add(path);
    }
  }

  function handleFileClick(node: AgentFileNode) {
    if (node.type === "directory") {
      toggleExpand(node.path);
    } else {
      const editorType = getEditorType(node);
      selectFile(node.path, editorType);
    }
  }

  function isSelected(path: string): boolean {
    return $editorState.currentPath === path;
  }

  // Get icon for node
  function getNodeIcon(node: AgentFileNode): { icon: string; color: string } {
    if (node.type === "directory") {
      const name = node.name.toLowerCase();
      if (name === "skills") return { icon: "⚡", color: "text-amber-500" };
      if (name === "sub-agents") return { icon: "🤖", color: "text-indigo-500" };
      if (name === "scripts") return { icon: "📜", color: "text-green-500" };
      return { icon: "📁", color: "text-gray-400" };
    }

    const editorType = getEditorType(node);
    switch (editorType) {
      case "prompt": return { icon: "📝", color: "text-blue-500" };
      case "schema": return { icon: "🔷", color: "text-purple-500" };
      case "skill": return { icon: "⚡", color: "text-amber-500" };
      case "agent": return { icon: "🤖", color: "text-indigo-500" };
      case "code": return { icon: "💻", color: "text-green-500" };
      default: return { icon: "📄", color: "text-gray-400" };
    }
  }

  // Render a single node
  function renderNode(node: AgentFileNode, depth: number = 0): void {
    // This is handled in the template below
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="px-3 py-2 border-b border-gray-100">
    <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Files</h2>
  </div>

  <!-- File tree -->
  <div class="flex-1 overflow-y-auto py-2">
    {#if $agentFileTree}
      {@render treeNode($agentFileTree, 0)}
    {:else if $currentAgent}
      <!-- Show a default structure if no file tree loaded yet -->
      <div class="px-3 py-8 text-center">
        <div class="text-gray-400 text-sm">Loading files...</div>
      </div>
    {:else}
      <div class="px-3 py-8 text-center">
        <div class="text-gray-400 text-sm">No agent selected</div>
      </div>
    {/if}
  </div>

  <!-- Actions -->
  <div class="px-3 py-2 border-t border-gray-100 space-y-1">
    <button
      class="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      New Skill
    </button>
    <button
      class="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      New Script
    </button>
    <button
      class="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      New Sub-Agent
    </button>
  </div>
</div>

{#snippet treeNode(node: AgentFileNode, depth: number)}
  {@const isExpanded = expandedPaths.has(node.path)}
  {@const { icon, color } = getNodeIcon(node)}
  {@const selected = isSelected(node.path)}

  <div
    class="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-100 transition-colors {selected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}"
    style="padding-left: {12 + depth * 16}px"
    onclick={() => handleFileClick(node)}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && handleFileClick(node)}
  >
    {#if node.type === "directory"}
      <svg
        class="w-3 h-3 text-gray-400 transition-transform {isExpanded ? 'rotate-90' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    {:else}
      <span class="w-3"></span>
    {/if}

    <span class="text-sm {color}">{icon}</span>
    <span class="text-sm truncate {selected ? 'font-medium' : ''}">{node.name}</span>
  </div>

  {#if node.type === "directory" && isExpanded && node.children}
    {#each node.children as child}
      {@render treeNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}
