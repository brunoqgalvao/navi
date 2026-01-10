<script lang="ts">
  /**
   * WidgetRenderer - Routes to specific widget components
   */
  import type {
    WidgetType,
    WidgetConfig,
    GitLogWidgetConfig,
    PreviewWidgetConfig,
    FileWidgetConfig,
    StatusWidgetConfig,
    SuggestionsWidgetConfig
  } from "../types";
  import GitLogWidget from "./widgets/GitLogWidget.svelte";
  import PreviewWidget from "./widgets/PreviewWidget.svelte";
  import FileWidget from "./widgets/FileWidget.svelte";
  import StatusWidget from "./widgets/StatusWidget.svelte";
  import SuggestionsWidget from "./widgets/SuggestionsWidget.svelte";

  interface Props {
    widget: WidgetType;
    config: WidgetConfig;
    projectPath: string;
    onRefresh: () => void;
  }

  let { widget, config, projectPath, onRefresh }: Props = $props();
</script>

<div class="dashboard-widget">
  {#if widget === "git-log"}
    <GitLogWidget config={config as GitLogWidgetConfig} {projectPath} />
  {:else if widget === "preview"}
    <PreviewWidget config={config as PreviewWidgetConfig} />
  {:else if widget === "file"}
    <FileWidget config={config as FileWidgetConfig} {projectPath} />
  {:else if widget === "status"}
    <StatusWidget config={config as StatusWidgetConfig} />
  {:else if widget === "suggestions"}
    <SuggestionsWidget config={config as SuggestionsWidgetConfig} {projectPath} />
  {:else}
    <div class="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-500">
      Unknown widget type: {widget}
    </div>
  {/if}
</div>
