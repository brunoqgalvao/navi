<script lang="ts">
  /**
   * DashboardRenderer - Renders parsed dashboard blocks
   *
   * Routes blocks to appropriate renderers (markdown, actions, widgets)
   */
  import type { Dashboard, DashboardBlock } from "../types";
  import MarkdownBlock from "./MarkdownBlock.svelte";
  import ActionsBlock from "./ActionsBlock.svelte";
  import WidgetRenderer from "./WidgetRenderer.svelte";

  interface Props {
    dashboard: Dashboard;
    projectPath: string;
    onRefresh: () => void;
  }

  let { dashboard, projectPath, onRefresh }: Props = $props();
</script>

<div class="p-6 max-w-4xl mx-auto space-y-6">
  {#if dashboard.error}
    <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
      <p class="text-sm text-yellow-700 dark:text-yellow-300">
        ⚠️ Dashboard parse warning: {dashboard.error}
      </p>
    </div>
  {/if}

  {#each dashboard.blocks as block, i (i)}
    {#if block.type === "markdown"}
      <MarkdownBlock content={block.content} />
    {:else if block.type === "actions"}
      <ActionsBlock actions={block.actions} {projectPath} />
    {:else if block.type === "widget"}
      <WidgetRenderer
        widget={block.widget}
        config={block.config}
        {projectPath}
        {onRefresh}
      />
    {/if}
  {/each}

  <!-- Edit dashboard link -->
  <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
    <p class="text-xs text-gray-400 dark:text-gray-500">
      Edit this dashboard at <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded">.claude/dashboard.md</code>
      or ask Claude to customize it for you.
    </p>
  </div>
</div>
