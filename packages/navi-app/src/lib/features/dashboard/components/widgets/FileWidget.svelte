<script lang="ts">
  /**
   * FileWidget - Displays content of a file inline
   */
  import { onMount } from "svelte";
  import type { FileWidgetConfig } from "../../types";
  import { getFileContent } from "../../api";
  import { marked } from "marked";

  interface Props {
    config: FileWidgetConfig;
    projectPath: string;
  }

  let { config, projectPath }: Props = $props();

  let loading = $state(true);
  let content = $state("");
  let error = $state<string | null>(null);
  let collapsed = $state(false);

  const filePath = config.path || "";
  const collapsible = config.collapsible ?? false;
  const isMarkdown = filePath.endsWith(".md");
  const fileName = filePath.split("/").pop() || filePath;

  async function loadFile() {
    if (!filePath) {
      error = "No file path configured";
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const result = await getFileContent(projectPath, filePath);
      if (result.error) {
        error = result.error;
        content = "";
      } else {
        content = result.content;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load file";
      content = "";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadFile();
  });

  let renderedContent = $derived(
    isMarkdown ? (marked.parse(content) as string) : content
  );
</script>

<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
  <div class="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
    <div class="flex items-center gap-2">
      {#if collapsible}
        <button
          onclick={() => (collapsed = !collapsed)}
          class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {collapsed ? "▶" : "▼"}
        </button>
      {/if}
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{fileName}</span>
    </div>
    <button
      onclick={loadFile}
      class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      title="Refresh"
    >
      ↻
    </button>
  </div>

  {#if !collapsed}
    {#if loading}
      <div class="p-4 text-center">
        <span class="text-sm text-gray-500">Loading...</span>
      </div>
    {:else if error}
      <div class="p-4 text-center">
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if isMarkdown}
      <div class="p-4 prose prose-sm dark:prose-invert max-w-none">
        {@html renderedContent}
      </div>
    {:else}
      <pre class="p-4 text-sm text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">{content}</pre>
    {/if}
  {/if}
</div>
