<script lang="ts">
  import { ZOOM_LIMITS } from "../constants";

  interface Props {
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitView: () => void;
    onResetPositions: () => void;
    onClose: () => void;
  }

  let { zoom, onZoomIn, onZoomOut, onFitView, onResetPositions, onClose }: Props = $props();

  const zoomPercent = $derived(Math.round(zoom * 100));
</script>

<div class="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
  <!-- Left side: Title and stats -->
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg border border-gray-200 dark:border-gray-700">
      <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
      <span class="font-semibold text-gray-800 dark:text-gray-100">Canvas Mode</span>
      <span class="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
        Experimental
      </span>
    </div>
  </div>

  <!-- Center: Zoom controls -->
  <div class="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg border border-gray-200 dark:border-gray-700">
    <button
      onclick={onZoomOut}
      disabled={zoom <= ZOOM_LIMITS.min}
      class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Zoom out"
    >
      <svg class="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
      </svg>
    </button>

    <span class="text-xs font-medium text-gray-600 dark:text-gray-300 w-12 text-center">
      {zoomPercent}%
    </span>

    <button
      onclick={onZoomIn}
      disabled={zoom >= ZOOM_LIMITS.max}
      class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Zoom in"
    >
      <svg class="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>

    <div class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></div>

    <button
      onclick={onFitView}
      class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title="Fit view (show all)"
    >
      <svg class="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
      </svg>
    </button>

    <button
      onclick={onResetPositions}
      class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title="Reset positions"
    >
      <svg class="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Right side: Close button and keyboard hint -->
  <div class="flex items-center gap-3">
    <span class="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
      <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">Esc</kbd>
      to close
    </span>

    <button
      onclick={onClose}
      class="p-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      title="Close canvas (Esc)"
    >
      <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</div>

<!-- Bottom left: Legend -->
<div class="absolute bottom-4 left-4 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-gray-200 dark:border-gray-700">
  <div class="flex items-center gap-4 text-xs">
    <span class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded bg-slate-300 dark:bg-slate-600"></span>
      <span class="text-gray-600 dark:text-gray-400">Workspace</span>
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded bg-blue-300 dark:bg-blue-600"></span>
      <span class="text-gray-600 dark:text-gray-400">Project</span>
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded bg-emerald-300 dark:bg-emerald-600"></span>
      <span class="text-gray-600 dark:text-gray-400">Session</span>
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded bg-purple-300 dark:bg-purple-600"></span>
      <span class="text-gray-600 dark:text-gray-400">Agent</span>
    </span>
  </div>
</div>

<!-- Bottom right: Instructions -->
<div class="absolute bottom-4 right-4 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-gray-200 dark:border-gray-700">
  <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
    <span>Drag nodes to reposition</span>
    <span class="text-gray-300 dark:text-gray-600">|</span>
    <span>Scroll to zoom</span>
    <span class="text-gray-300 dark:text-gray-600">|</span>
    <span>Double-click to open</span>
  </div>
</div>
