<script lang="ts">
  /**
   * AgentCard
   *
   * Unified agent card that renders type-specific variants based on
   * the inferred agent type. Falls back to generic display.
   */
  import type { ChatMessage } from "$lib/stores";
  import type { ContentBlock, ToolUseBlock } from "$lib/claude";
  import {
    inferSubagentType,
    extractDisplayInfo,
    getSubagentConfig,
    ACTIVITY_LABELS,
    type SubagentType,
  } from "$lib/core";

  import BrowserAgentCard from "./BrowserAgentCard.svelte";
  import CodingAgentCard from "./CodingAgentCard.svelte";
  import DoodlePulse from "../DoodlePulse.svelte";

  interface Props {
    toolUseId: string;
    description: string;
    subagentType: string;
    prompt?: string;
    updates: ChatMessage[];
    isActive: boolean;
    elapsedTime?: number;
    onExpand?: () => void;
  }

  let {
    toolUseId,
    description,
    subagentType,
    prompt = "",
    updates,
    isActive,
    elapsedTime,
    onExpand,
  }: Props = $props();

  // Extract tool calls from updates
  function getToolCalls(): ToolUseBlock[] {
    const tools: ToolUseBlock[] = [];
    for (const update of updates) {
      if (update.role === "assistant" && Array.isArray(update.content)) {
        for (const block of update.content as ContentBlock[]) {
          if (block.type === "tool_use") {
            tools.push(block as ToolUseBlock);
          }
        }
      }
    }
    return tools;
  }

  // Reactive computed values
  const tools = $derived(getToolCalls());
  const displayInfo = $derived(extractDisplayInfo(subagentType, prompt, tools, !isActive));
  const inferredType = $derived(displayInfo.type);
  const config = $derived(getSubagentConfig(inferredType));

  // Extract browser-specific info
  const visitedUrls = $derived.by(() => {
    const urls: string[] = [];
    for (const tool of tools) {
      if (tool.name === "WebFetch" && tool.input?.url) {
        urls.push(String(tool.input.url));
      }
    }
    return urls;
  });

  // Extract coding-specific info
  interface FileChange {
    name: string;
    action: "read" | "write" | "edit" | "create";
    linesAdded?: number;
    linesRemoved?: number;
  }

  const fileChanges = $derived.by(() => {
    const changes: FileChange[] = [];
    for (const tool of tools) {
      if (["Read", "Write", "Edit"].includes(tool.name) && tool.input?.file_path) {
        const name = String(tool.input.file_path).split("/").pop() || "";
        const action = tool.name.toLowerCase() as "read" | "write" | "edit";
        // Could parse actual line changes from tool results in the future
        changes.push({ name, action });
      }
    }
    return changes;
  });

  // Determine which card variant to show
  const shouldShowBrowserCard = $derived(inferredType === "browser");
  const shouldShowCodingCard = $derived(inferredType === "coding");
</script>

{#if shouldShowBrowserCard}
  <BrowserAgentCard
    {description}
    currentUrl={displayInfo.currentUrl}
    {visitedUrls}
    {isActive}
    {elapsedTime}
    activity={displayInfo.activity}
    {onExpand}
  />
{:else if shouldShowCodingCard}
  <CodingAgentCard
    {description}
    activeFiles={displayInfo.activeFiles}
    {fileChanges}
    {isActive}
    {elapsedTime}
    activity={displayInfo.activity}
    toolCount={tools.length}
    {onExpand}
  />
{:else}
  <!-- Generic agent card (fallback) -->
  <div class="rounded-xl border-2 {config.borderColor} {config.bgColor} shadow-sm overflow-hidden group">
    <button
      onclick={() => onExpand?.()}
      class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-opacity-70 transition-colors"
    >
      <!-- Icon based on type -->
      <div class="w-8 h-8 rounded-lg bg-{config.color}-100 flex items-center justify-center shrink-0">
        {#if inferredType === "research"}
          <svg class="w-5 h-5 {config.accentColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" stroke-width="1.5"/>
            <path stroke-linecap="round" stroke-width="1.5" d="m21 21-4.35-4.35"/>
          </svg>
        {:else if inferredType === "runner"}
          <svg class="w-5 h-5 {config.accentColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        {:else if inferredType === "reviewer"}
          <svg class="w-5 h-5 {config.accentColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
        {:else}
          <svg class="w-5 h-5 {config.accentColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        {/if}
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-900">{config.label}</span>
          <span class="text-xs {config.accentColor} font-medium">{ACTIVITY_LABELS[displayInfo.activity]}</span>
        </div>
        <div class="text-xs text-gray-600 truncate mt-0.5">{description}</div>
      </div>

      <!-- Stats & Status -->
      <div class="flex items-center gap-3 shrink-0">
        {#if tools.length > 0}
          <span class="text-[10px] text-gray-400">{tools.length} tools</span>
        {/if}

        {#if isActive}
          <div class="flex items-center gap-1.5 px-2.5 py-1 bg-{config.color}-100 rounded-full">
            <DoodlePulse size={8} />
            <span class="text-xs font-medium {config.accentColor}">
              {elapsedTime ? `${elapsedTime}s` : "working"}
            </span>
          </div>
        {:else}
          <div class="w-6 h-6 rounded-full bg-{config.color}-100 flex items-center justify-center">
            <svg class="w-4 h-4 {config.accentColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        {/if}
      </div>
    </button>

    <!-- Activity summary -->
    {#if displayInfo.currentCommand}
      <div class="px-4 py-2 border-t border-{config.color}-100 bg-white/40">
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 {config.accentColor} shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3"/>
          </svg>
          <code class="text-xs text-gray-700 truncate font-mono">{displayInfo.currentCommand}</code>
        </div>
      </div>
    {/if}
  </div>
{/if}
