<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { BoardData, BoardGroup, BoardSession, BoardColumnType } from "../types";
  import { BOARD_COLUMNS } from "../types";
  import * as api from "../api";
  import BoardColumn from "./BoardColumn.svelte";

  interface Props {
    /** If provided, shows project scope. Otherwise shows global scope. */
    projectId?: string;
    /** Project name for header display */
    projectName?: string;
    /** Callback when a session card is clicked */
    onSessionSelect?: (session: BoardSession) => void;
    /** Callback to close the dashboard */
    onClose?: () => void;
    /** Poll interval in ms for real-time updates (default: 2000) */
    pollInterval?: number;
  }

  let { projectId, projectName, onSessionSelect, onClose, pollInterval = 2000 }: Props = $props();

  let boardData = $state<BoardData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // View mode: "board" shows columns, "grouped" shows by project (only for global)
  let viewMode = $state<"board" | "grouped">("board");

  // For global view, whether to expand project groups
  let expandedGroups = $state<Set<string>>(new Set());

  // Is this project scope or global?
  let isProjectScope = $derived(!!projectId);

  // Get current group for project scope
  let currentGroup = $derived(
    boardData?.groups.find((g) => g.projectId === projectId) || null
  );

  // Display name for header
  let displayName = $derived(
    currentGroup?.projectName || projectName || "All Sessions"
  );

  async function fetchData() {
    try {
      boardData = await api.getBoardData(projectId);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load sessions";
    } finally {
      loading = false;
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchData, pollInterval);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function toggleGroup(groupProjectId: string) {
    if (expandedGroups.has(groupProjectId)) {
      expandedGroups.delete(groupProjectId);
    } else {
      expandedGroups.add(groupProjectId);
    }
    expandedGroups = new Set(expandedGroups);
  }

  function handleSessionClick(session: BoardSession) {
    onSessionSelect?.(session);
  }

  // Flatten all sessions from all groups into column buckets for board view
  let flatColumns = $derived.by(() => {
    if (!boardData) return null;
    const result: Record<BoardColumnType, BoardSession[]> = {
      working: [],
      needs_approval: [],
      needs_review: [],
      idle: [],
    };
    for (const group of boardData.groups) {
      for (const col of Object.keys(group.columns) as BoardColumnType[]) {
        result[col].push(...group.columns[col]);
      }
    }
    // Sort by last activity
    for (const col of Object.values(result)) {
      col.sort((a, b) => b.lastActivity - a.lastActivity);
    }
    return result;
  });

  onMount(() => {
    fetchData();
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

<div class="h-full flex flex-col bg-white dark:bg-gray-900">
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
    <div class="flex items-center gap-4">
      <!-- Title with scope indicator -->
      <div class="flex items-center gap-2">
        {#if isProjectScope}
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        {:else}
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        {/if}
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {displayName}
        </h2>
      </div>

      <!-- Stats -->
      {#if boardData}
        <div class="flex items-center gap-3 text-xs">
          {#if boardData.totals.working > 0}
            <span class="flex items-center gap-1.5 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {boardData.totals.working} working
            </span>
          {/if}
          {#if boardData.totals.needs_approval > 0}
            <span class="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">
              <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              {boardData.totals.needs_approval} need approval
            </span>
          {/if}
          {#if boardData.totals.needs_review > 0}
            <span class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              {boardData.totals.needs_review} to review
            </span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-3">
      <!-- View toggle (only for global view) -->
      {#if !isProjectScope}
        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors {viewMode === 'board' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}"
            onclick={() => viewMode = "board"}
          >
            Board
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors {viewMode === 'grouped' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}"
            onclick={() => viewMode = "grouped"}
          >
            By Project
          </button>
        </div>
      {/if}

      <!-- Keyboard hint -->
      <span class="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">⌘D to close</span>

      {#if onClose}
        <button
          onclick={onClose}
          class="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Close (⌘D)"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden p-6">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="text-gray-400 dark:text-gray-500">Loading sessions...</div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center h-full">
        <div class="text-red-500">{error}</div>
      </div>
    {:else if !boardData || boardData.groups.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <svg class="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>No sessions found</p>
        <p class="text-sm text-gray-300 dark:text-gray-600 mt-1">Start a chat to see it here</p>
      </div>
    {:else if isProjectScope && currentGroup}
      <!-- Project scope view: columns for single project -->
      <div class="flex gap-4 overflow-x-auto h-full">
        {#each BOARD_COLUMNS as column (column.type)}
          <BoardColumn
            {column}
            sessions={currentGroup.columns[column.type]}
            onSessionClick={handleSessionClick}
          />
        {/each}
      </div>
    {:else if isProjectScope && !currentGroup}
      <!-- Project scope but no sessions yet -->
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <svg class="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>No sessions in this project</p>
        <p class="text-sm text-gray-300 dark:text-gray-600 mt-1">Start a chat to see it here</p>
      </div>
    {:else if viewMode === "board" && flatColumns}
      <!-- Global board view: all sessions in columns -->
      <div class="flex gap-4 overflow-x-auto h-full">
        {#each BOARD_COLUMNS as column (column.type)}
          <BoardColumn
            {column}
            sessions={flatColumns[column.type]}
            showProject={true}
            onSessionClick={handleSessionClick}
          />
        {/each}
      </div>
    {:else}
      <!-- Grouped view: by project -->
      <div class="flex flex-col gap-4 overflow-y-auto h-full">
        {#each boardData.groups as group (group.projectId)}
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <button
              class="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onclick={() => toggleGroup(group.projectId)}
            >
              <div class="flex items-center gap-3">
                <svg
                  class="w-4 h-4 text-gray-400 transition-transform {expandedGroups.has(group.projectId) ? 'rotate-90' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <div class="text-left">
                  <h3 class="text-sm font-medium text-gray-800 dark:text-gray-100">{group.projectName}</h3>
                  <p class="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[400px]">{group.projectPath}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 text-xs">
                {#if group.columns.working.length > 0}
                  <span class="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    {group.columns.working.length}
                  </span>
                {/if}
                {#if group.columns.needs_approval.length > 0}
                  <span class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    {group.columns.needs_approval.length}
                  </span>
                {/if}
                {#if group.columns.needs_review.length > 0}
                  <span class="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    {group.columns.needs_review.length}
                  </span>
                {/if}
                <span class="text-gray-400 dark:text-gray-500">{group.sessionCount} total</span>
              </div>
            </button>

            {#if expandedGroups.has(group.projectId)}
              <div class="flex gap-4 overflow-x-auto p-4 pt-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
                {#each BOARD_COLUMNS as column (column.type)}
                  <BoardColumn
                    {column}
                    sessions={group.columns[column.type]}
                    onSessionClick={handleSessionClick}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
