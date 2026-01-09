<script lang="ts">
  /**
   * ExtensionTabs - Draggable extension tabs for the right panel header
   *
   * Features:
   * - Displays enabled extensions as tabs
   * - Drag-and-drop reordering (click, hold, drag)
   * - Settings button to open extension manager
   * - Overflow handling for many extensions
   */
  import ExtensionIcon from "./ExtensionIcon.svelte";
  import { projectExtensions, getEnabledExtensionsForProject } from "../stores";
  import type { ResolvedExtension } from "../types";

  interface Props {
    projectId: string | null;
    currentMode: string;
    onModeChange: (mode: string) => void;
    onOpenSettings: () => void;
  }

  let { projectId, currentMode, onModeChange, onOpenSettings }: Props = $props();

  // Local state for drag-and-drop
  let extensions = $state<ResolvedExtension[]>([]);
  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // Sync with store when it changes - create store once per projectId
  $effect(() => {
    const store = getEnabledExtensionsForProject(projectId);
    const unsubscribe = store.subscribe((exts) => {
      extensions = [...exts];
    });
    return unsubscribe;
  });

  function handleDragStart(e: DragEvent, index: number) {
    draggedIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      dragOverIndex = index;
    }
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(e: DragEvent, dropIndex: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex || !projectId) {
      dragOverIndex = null;
      draggedIndex = null;
      return;
    }

    // Reorder locally
    const newExtensions = [...extensions];
    const [removed] = newExtensions.splice(draggedIndex, 1);
    newExtensions.splice(dropIndex, 0, removed);
    extensions = newExtensions;

    // Save to backend
    const orderedIds = newExtensions.map((ext) => ext.id);
    console.log("[ExtensionTabs] Reordering:", orderedIds);
    projectExtensions.reorder(projectId, orderedIds).catch(err => {
      console.error("[ExtensionTabs] Reorder failed:", err);
    });

    dragOverIndex = null;
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
    dragOverIndex = null;
  }

  // Check if current mode matches extension (handling files/preview as same)
  function isActive(ext: ResolvedExtension): boolean {
    if (ext.panelMode === "files" && (currentMode === "files" || currentMode === "preview")) {
      return true;
    }
    return currentMode === ext.panelMode;
  }
</script>

<div class="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
  {#each extensions as ext, index (ext.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <button
      draggable={projectId !== null}
      ondragstart={(e) => handleDragStart(e, index)}
      ondragover={(e) => handleDragOver(e, index)}
      ondragleave={handleDragLeave}
      ondrop={(e) => handleDrop(e, index)}
      ondragend={handleDragEnd}
      onclick={() => onModeChange(ext.panelMode)}
      class="px-3 py-1 text-xs font-medium rounded transition-all flex items-center gap-1.5 shrink-0
        {draggedIndex === index ? 'opacity-50' : ''}
        {dragOverIndex === index ? 'ring-2 ring-blue-400' : ''}
        {isActive(ext)
          ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
        {projectId ? 'cursor-grab active:cursor-grabbing' : ''}"
      title={ext.description}
    >
      <ExtensionIcon icon={ext.icon} class="w-3 h-3" />
      {ext.name}
    </button>
  {/each}

  <!-- Settings button -->
  {#if projectId}
    <button
      onclick={onOpenSettings}
      class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors shrink-0 ml-1"
      title="Manage extensions"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
  {/if}
</div>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
