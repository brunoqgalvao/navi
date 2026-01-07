<script lang="ts">
  /**
   * ExtensionToolbar - Compact toolbar for the chat header with overflow menu
   *
   * Shows first N extensions as buttons, with remaining in a "more" dropdown
   */
  import ExtensionIcon from "./ExtensionIcon.svelte";
  import { getEnabledExtensionsForProject } from "../stores";
  import type { ResolvedExtension } from "../types";

  interface Props {
    projectId: string | null;
    currentMode: string | null;
    maxVisible?: number;
    onExtensionClick: (mode: string) => void;
    onOpenSettings?: () => void;
  }

  let {
    projectId,
    currentMode,
    maxVisible = 4,
    onExtensionClick,
    onOpenSettings,
  }: Props = $props();

  // Track extensions from the store
  let allExtensions = $state<ResolvedExtension[]>([]);

  // Sync with the store when it changes - create store once per projectId
  $effect(() => {
    const store = getEnabledExtensionsForProject(projectId);
    const unsubscribe = store.subscribe((exts) => {
      allExtensions = exts;
    });
    return unsubscribe;
  });

  // Split into visible and overflow
  let visibleExtensions = $derived(allExtensions.slice(0, maxVisible));
  let overflowExtensions = $derived(allExtensions.slice(maxVisible));

  let showOverflowMenu = $state(false);
  let menuRef = $state<HTMLDivElement | null>(null);

  function handleClickOutside(e: MouseEvent) {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      showOverflowMenu = false;
    }
  }

  $effect(() => {
    if (showOverflowMenu) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });

  function isActive(ext: ResolvedExtension): boolean {
    if (ext.panelMode === "files" && (currentMode === "files" || currentMode === "preview")) {
      return true;
    }
    return currentMode === ext.panelMode;
  }

  function handleExtensionClick(ext: ResolvedExtension) {
    onExtensionClick(ext.panelMode);
    showOverflowMenu = false;
  }
</script>

<div class="flex gap-1">
  <!-- Visible extension buttons -->
  {#each visibleExtensions as ext (ext.id)}
    <button
      onclick={() => handleExtensionClick(ext)}
      class="p-2 border rounded-lg shadow-sm transition-all group
        {isActive(ext)
          ? 'bg-gray-100 border-gray-300'
          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}"
      title={ext.name}
    >
      <span class="text-gray-400 group-hover:text-gray-600">
        <ExtensionIcon icon={ext.icon} class="w-4 h-4" />
      </span>
    </button>
  {/each}

  <!-- Overflow menu (three dots) -->
  {#if overflowExtensions.length > 0 || onOpenSettings}
    <div class="relative" bind:this={menuRef}>
      <button
        onclick={() => showOverflowMenu = !showOverflowMenu}
        class="p-2 border rounded-lg shadow-sm transition-all group
          {showOverflowMenu
            ? 'bg-gray-100 border-gray-300'
            : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}"
        title="More extensions"
      >
        <svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="6" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="18" r="2" />
        </svg>
      </button>

      {#if showOverflowMenu}
        <div class="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <!-- Overflow extensions -->
          {#each overflowExtensions as ext (ext.id)}
            <button
              onclick={() => handleExtensionClick(ext)}
              class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors
                {isActive(ext) ? 'bg-gray-50 text-gray-900' : 'text-gray-700'}"
            >
              <ExtensionIcon icon={ext.icon} class="w-4 h-4 text-gray-400" />
              {ext.name}
            </button>
          {/each}

          <!-- Settings option -->
          {#if onOpenSettings}
            {#if overflowExtensions.length > 0}
              <hr class="my-1 border-gray-100" />
            {/if}
            <button
              onclick={() => { onOpenSettings(); showOverflowMenu = false; }}
              class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors text-gray-700"
            >
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage Extensions
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
