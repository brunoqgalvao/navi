<script lang="ts">
  /**
   * CodingAgentCard
   *
   * Specialized display for coding/development agents.
   * Shows files being edited, changes summary, and code activity.
   */
  import { SUBAGENT_CONFIGS, ACTIVITY_LABELS } from "$lib/core";
  import type { SubagentActivityType } from "$lib/core";
  import DoodlePulse from "../DoodlePulse.svelte";
  import DoodleThinking from "../DoodleThinking.svelte";

  interface FileChange {
    name: string;
    action: "read" | "write" | "edit" | "create";
    linesAdded?: number;
    linesRemoved?: number;
  }

  interface Props {
    description: string;
    activeFiles?: string[];
    fileChanges?: FileChange[];
    isActive: boolean;
    elapsedTime?: number;
    activity: SubagentActivityType;
    toolCount?: number;
    onExpand?: () => void;
  }

  let {
    description,
    activeFiles = [],
    fileChanges = [],
    isActive,
    elapsedTime,
    activity,
    toolCount = 0,
    onExpand,
  }: Props = $props();

  const config = SUBAGENT_CONFIGS.coding;

  // Aggregate stats
  const totalAdded = $derived(fileChanges.reduce((sum, f) => sum + (f.linesAdded || 0), 0));
  const totalRemoved = $derived(fileChanges.reduce((sum, f) => sum + (f.linesRemoved || 0), 0));
  const uniqueFiles = $derived(new Set(fileChanges.map(f => f.name)).size);

  const actionIcons: Record<string, string> = {
    read: "📄",
    write: "✏️",
    edit: "🔧",
    create: "➕",
  };

  const actionColors: Record<string, string> = {
    read: "text-blue-600 bg-blue-50",
    write: "text-emerald-600 bg-emerald-50",
    edit: "text-amber-600 bg-amber-50",
    create: "text-purple-600 bg-purple-50",
  };
</script>

<div class="rounded-xl border-2 {config.borderColor} {config.bgColor} shadow-sm overflow-hidden group">
  <!-- Header -->
  <button
    onclick={() => onExpand?.()}
    class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-100/50 transition-colors"
  >
    <!-- Code icon -->
    <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
      <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
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

    <!-- Status & Stats -->
    <div class="flex items-center gap-3 shrink-0">
      <!-- Change stats -->
      {#if totalAdded > 0 || totalRemoved > 0}
        <div class="flex items-center gap-1.5 text-xs">
          {#if totalAdded > 0}
            <span class="text-emerald-600 font-medium">+{totalAdded}</span>
          {/if}
          {#if totalRemoved > 0}
            <span class="text-red-500 font-medium">-{totalRemoved}</span>
          {/if}
        </div>
      {/if}

      <!-- Tool count -->
      {#if toolCount > 0}
        <span class="text-[10px] text-gray-400">{toolCount} ops</span>
      {/if}

      <!-- Status indicator -->
      {#if activity === "complete"}
        <!-- Truly complete -->
        <div class="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
      {:else if isActive}
        <!-- Actively receiving progress events -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 rounded-full">
          <DoodlePulse size={8} color="rgb(16 185 129)" />
          <span class="text-xs font-medium text-emerald-700">
            {elapsedTime ? `${elapsedTime}s` : "coding"}
          </span>
        </div>
      {:else}
        <!-- Still working but no active progress events -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100/60 rounded-full">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="text-xs font-medium text-emerald-700">working</span>
        </div>
      {/if}
    </div>
  </button>

  <!-- Active files bar -->
  {#if activeFiles.length > 0}
    <div class="px-4 py-2 bg-white/60 border-t border-emerald-100">
      <div class="flex items-center gap-2">
        <svg class="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <div class="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {#each activeFiles as file}
            <span class="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-mono truncate max-w-[150px]">
              {file}
            </span>
          {/each}
        </div>
        {#if isActive}
          <div class="shrink-0">
            <DoodleThinking size="sm" />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- File changes mini-list (show when complete) -->
  {#if fileChanges.length > 0 && activity === "complete"}
    <div class="px-4 py-2 border-t border-emerald-100 bg-white/40 space-y-1">
      {#each fileChanges.slice(0, 3) as change}
        <div class="flex items-center gap-2 text-xs">
          <span class="w-5 text-center">{actionIcons[change.action]}</span>
          <span class="font-mono text-gray-700 truncate flex-1">{change.name}</span>
          {#if change.linesAdded || change.linesRemoved}
            <span class="text-emerald-600">+{change.linesAdded || 0}</span>
            <span class="text-red-500">-{change.linesRemoved || 0}</span>
          {/if}
        </div>
      {/each}
      {#if fileChanges.length > 3}
        <div class="text-[10px] text-gray-400 pl-7">
          +{fileChanges.length - 3} more files
        </div>
      {/if}
    </div>
  {/if}

  <!-- Summary when complete -->
  {#if activity === "complete" && uniqueFiles > 0}
    <div class="px-4 py-2 border-t border-emerald-100 bg-emerald-50/50">
      <div class="flex items-center gap-3 text-xs">
        <span class="text-gray-600">
          <span class="font-medium text-gray-900">{uniqueFiles}</span> file{uniqueFiles !== 1 ? 's' : ''} modified
        </span>
        {#if totalAdded > 0}
          <span class="text-emerald-600 font-medium">+{totalAdded} lines</span>
        {/if}
        {#if totalRemoved > 0}
          <span class="text-red-500 font-medium">-{totalRemoved} lines</span>
        {/if}
      </div>
    </div>
  {/if}
</div>
