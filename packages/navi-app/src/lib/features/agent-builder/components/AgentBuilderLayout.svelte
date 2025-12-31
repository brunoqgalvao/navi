<script lang="ts">
  import FileNavigator from "./FileNavigator.svelte";
  import EditorArea from "./EditorArea.svelte";
  import TestHarness from "./TestHarness.svelte";
  import {
    currentAgent,
    editorState,
    rightPanelCollapsed,
    canShowTestHarness,
  } from "../stores";

  interface Props {
    onBack?: () => void;
  }

  let { onBack }: Props = $props();

  let leftWidth = $state(260);
  let rightWidth = $state(320);
  let isResizingLeft = $state(false);
  let isResizingRight = $state(false);

  function startResizeLeft(e: MouseEvent) {
    isResizingLeft = true;
    e.preventDefault();
  }

  function startResizeRight(e: MouseEvent) {
    isResizingRight = true;
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (isResizingLeft) {
      leftWidth = Math.max(200, Math.min(400, e.clientX));
    }
    if (isResizingRight) {
      rightWidth = Math.max(280, Math.min(500, window.innerWidth - e.clientX));
    }
  }

  function handleMouseUp() {
    isResizingLeft = false;
    isResizingRight = false;
  }

  $effect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  });
</script>

<div class="h-full flex flex-col bg-gray-50">
  <!-- Header -->
  <div class="h-12 border-b border-gray-200 bg-white flex items-center px-4 gap-3 shrink-0">
    {#if onBack}
      <button
        onclick={onBack}
        class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    {/if}

    <div class="flex items-center gap-2">
      {#if $currentAgent?.type === "skill"}
        <div class="p-1.5 bg-amber-100 rounded-lg">
          <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      {:else}
        <div class="p-1.5 bg-indigo-100 rounded-lg">
          <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      {/if}
      <div>
        <h1 class="text-sm font-semibold text-gray-900">
          {$currentAgent?.name || "Agent Builder"}
        </h1>
        {#if $currentAgent?.path}
          <p class="text-xs text-gray-400 font-mono truncate max-w-md">{$currentAgent.path}</p>
        {/if}
      </div>
    </div>

    <div class="flex-1"></div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      {#if $editorState.isDirty}
        <span class="text-xs text-amber-600 font-medium">Unsaved changes</span>
      {/if}
      <button
        class="px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
      >
        Save All
      </button>
    </div>
  </div>

  <!-- Main content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left sidebar: File Navigator -->
    <div
      class="shrink-0 bg-white border-r border-gray-200 overflow-hidden"
      style="width: {leftWidth}px"
    >
      <FileNavigator />
    </div>

    <!-- Left resize handle -->
    <div
      class="w-1 bg-gray-200 hover:bg-indigo-400 cursor-col-resize transition-colors shrink-0"
      onmousedown={startResizeLeft}
      role="separator"
      aria-orientation="vertical"
    ></div>

    <!-- Editor area -->
    <div class="flex-1 min-w-0 overflow-hidden">
      <EditorArea />
    </div>

    <!-- Right panel: Test Harness -->
    {#if $canShowTestHarness && !$rightPanelCollapsed}
      <!-- Right resize handle -->
      <div
        class="w-1 bg-gray-200 hover:bg-indigo-400 cursor-col-resize transition-colors shrink-0"
        onmousedown={startResizeRight}
        role="separator"
        aria-orientation="vertical"
      ></div>

      <div
        class="shrink-0 bg-white border-l border-gray-200 overflow-hidden"
        style="width: {rightWidth}px"
      >
        <TestHarness />
      </div>
    {/if}

    <!-- Collapse/expand button for test harness -->
    {#if $canShowTestHarness}
      <button
        onclick={() => rightPanelCollapsed.update((v) => !v)}
        class="absolute right-0 top-1/2 -translate-y-1/2 p-1 bg-gray-200 hover:bg-gray-300 rounded-l-lg transition-colors z-10"
        title={$rightPanelCollapsed ? "Show test harness" : "Hide test harness"}
      >
        <svg
          class="w-4 h-4 text-gray-600 transition-transform {$rightPanelCollapsed ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    {/if}
  </div>
</div>
