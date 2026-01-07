<script lang="ts">
  /**
   * ExtensionSettingsModal - Modal for managing extension visibility and order
   *
   * Features:
   * - Toggle extensions on/off
   * - Drag-and-drop reordering
   * - Visual feedback for enabled/disabled state
   */
  import Modal from "../../../components/Modal.svelte";
  import ExtensionIcon from "./ExtensionIcon.svelte";
  import { projectExtensions, getResolvedExtensionsForProject } from "../stores";
  import type { ResolvedExtension } from "../types";

  interface Props {
    open: boolean;
    onClose: () => void;
    projectId: string;
  }

  let { open, onClose, projectId }: Props = $props();

  // Local state for drag-and-drop
  let extensions = $state<ResolvedExtension[]>([]);
  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // Sync with store when it changes - create store once per projectId
  $effect(() => {
    const store = getResolvedExtensionsForProject(projectId);
    const unsubscribe = store.subscribe((exts) => {
      extensions = [...exts];
    });
    return unsubscribe;
  });

  async function handleToggle(ext: ResolvedExtension) {
    try {
      await projectExtensions.toggle(projectId, ext.id, !ext.enabled);
    } catch (error) {
      console.error("Failed to toggle extension:", error);
    }
  }

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
    if (draggedIndex === null || draggedIndex === dropIndex) {
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
    projectExtensions.reorder(projectId, orderedIds);

    dragOverIndex = null;
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
    dragOverIndex = null;
  }
</script>

<Modal {open} {onClose} title="Manage Extensions" size="md">
  {#snippet children()}
    <p class="text-sm text-gray-500 mb-4">
      Toggle extensions on/off and drag to reorder. Changes are saved automatically.
    </p>

    <div class="space-y-1">
      {#each extensions as ext, index (ext.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, index)}
          ondragend={handleDragEnd}
          class="flex items-center gap-3 p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing
            {draggedIndex === index ? 'opacity-50 bg-gray-100' : ''}
            {dragOverIndex === index ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
            {ext.enabled ? 'bg-white' : 'bg-gray-50'}"
        >
          <!-- Drag handle -->
          <div class="text-gray-300 hover:text-gray-400 shrink-0">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </div>

          <!-- Icon -->
          <div class={ext.enabled ? "text-gray-700" : "text-gray-400"}>
            <ExtensionIcon icon={ext.icon} class="w-5 h-5" />
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class={`font-medium text-sm ${ext.enabled ? "text-gray-900" : "text-gray-500"}`}>
              {ext.name}
            </div>
            <div class="text-xs text-gray-400 truncate">
              {ext.description}
            </div>
          </div>

          <!-- Project-only indicator -->
          {#if ext.requiresProject}
            <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              Project
            </span>
          {/if}

          <!-- Toggle -->
          <button
            onclick={() => handleToggle(ext)}
            class="relative w-10 h-6 rounded-full transition-colors shrink-0
              {ext.enabled ? 'bg-blue-500' : 'bg-gray-200'}"
            title={ext.enabled ? "Disable" : "Enable"}
          >
            <span
              class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform
                {ext.enabled ? 'translate-x-4' : 'translate-x-0'}"
            ></span>
          </button>
        </div>
      {/each}
    </div>

    {#if extensions.length === 0}
      <div class="text-center py-8 text-gray-400">
        No extensions registered
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    <button
      onclick={onClose}
      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
    >
      Done
    </button>
  {/snippet}
</Modal>
