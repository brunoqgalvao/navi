<script lang="ts">
  /**
   * PreviewWidget - Embeds an iframe preview of a URL
   */
  import type { PreviewWidgetConfig } from "../../types";

  interface Props {
    config: PreviewWidgetConfig;
  }

  let { config }: Props = $props();

  const url = config.url || "";
  const height = config.height || 300;

  let iframeError = $state(false);

  function handleIframeError() {
    iframeError = true;
  }

  function openInNewTab() {
    window.open(url, "_blank");
  }
</script>

<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
  <div class="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
    <span class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{url}</span>
    <button
      onclick={openInNewTab}
      class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      title="Open in new tab"
    >
      ↗
    </button>
  </div>

  {#if !url}
    <div class="p-4 text-center text-sm text-gray-500">
      No URL configured
    </div>
  {:else if iframeError}
    <div class="p-4 text-center">
      <p class="text-sm text-gray-500 mb-2">Unable to load preview</p>
      <button
        onclick={openInNewTab}
        class="text-sm text-accent-600 hover:text-accent-700"
      >
        Open in new tab →
      </button>
    </div>
  {:else}
    <iframe
      src={url}
      title="Preview"
      style="height: {height}px"
      class="w-full border-0"
      onerror={handleIframeError}
      sandbox="allow-scripts allow-same-origin allow-forms"
    ></iframe>
  {/if}
</div>
