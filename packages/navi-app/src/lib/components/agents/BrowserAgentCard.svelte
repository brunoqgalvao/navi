<script lang="ts">
  /**
   * BrowserAgentCard
   *
   * Specialized display for browser/research agents.
   * Shows URL bar, visited pages, and findings.
   */
  import { SUBAGENT_CONFIGS, ACTIVITY_LABELS } from "$lib/core";
  import type { SubagentActivityType } from "$lib/core";
  import DoodlePulse from "../DoodlePulse.svelte";
  import DoodleThinking from "../DoodleThinking.svelte";

  interface Props {
    description: string;
    currentUrl?: string;
    visitedUrls?: string[];
    findings?: string;
    isActive: boolean;
    elapsedTime?: number;
    activity: SubagentActivityType;
    onExpand?: () => void;
  }

  let {
    description,
    currentUrl,
    visitedUrls = [],
    findings,
    isActive,
    elapsedTime,
    activity,
    onExpand,
  }: Props = $props();

  const config = SUBAGENT_CONFIGS.browser;

  function formatUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
    } catch {
      return url.length > 40 ? url.slice(0, 37) + "..." : url;
    }
  }
</script>

<div class="rounded-xl border-2 {config.borderColor} {config.bgColor} shadow-sm overflow-hidden group">
  <!-- Header -->
  <button
    onclick={() => onExpand?.()}
    class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-cyan-100/50 transition-colors"
  >
    <!-- Browser icon -->
    <div class="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
      <svg class="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke-width="1.5"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-gray-900">{config.label}</span>
        <span class="text-xs {config.accentColor} font-medium">{ACTIVITY_LABELS[activity]}</span>
      </div>
      <div class="text-xs text-gray-600 truncate mt-0.5">{description}</div>
    </div>

    <!-- Status -->
    <div class="flex items-center gap-2 shrink-0">
      {#if isActive}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-100 rounded-full">
          <DoodlePulse size={8} color="rgb(6 182 212)" />
          <span class="text-xs font-medium text-cyan-700">
            {elapsedTime ? `${elapsedTime}s` : "browsing"}
          </span>
        </div>
      {:else}
        <div class="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center">
          <svg class="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
      {/if}
    </div>
  </button>

  <!-- URL Bar (when active) -->
  {#if currentUrl}
    <div class="px-4 py-2 bg-white/60 border-t border-cyan-100">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-cyan-200">
        <svg class="w-3.5 h-3.5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/>
        </svg>
        <span class="text-xs text-gray-700 truncate font-mono">{formatUrl(currentUrl)}</span>
        {#if isActive}
          <div class="ml-auto">
            <DoodleThinking size="sm" />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Visited URLs (collapsed view) -->
  {#if visitedUrls.length > 0}
    <div class="px-4 py-2 border-t border-cyan-100 bg-white/40">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[10px] text-gray-500 uppercase font-medium">Visited:</span>
        {#each visitedUrls.slice(0, 3) as url}
          <span class="text-[10px] px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full truncate max-w-[120px]">
            {formatUrl(url)}
          </span>
        {/each}
        {#if visitedUrls.length > 3}
          <span class="text-[10px] text-gray-400">+{visitedUrls.length - 3} more</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Findings preview -->
  {#if findings && !isActive}
    <div class="px-4 py-2 border-t border-cyan-100 bg-white/40">
      <div class="text-xs text-gray-700 line-clamp-2">
        <span class="font-medium text-cyan-600">Finding:</span> {findings}
      </div>
    </div>
  {/if}
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
