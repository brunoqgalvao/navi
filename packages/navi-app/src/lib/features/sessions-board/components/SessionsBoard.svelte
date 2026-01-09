<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { BoardData, BoardGroup, BoardSession, BoardColumnType } from "../types";
  import { BOARD_COLUMNS } from "../types";
  import * as api from "../api";
  import BoardColumn from "./BoardColumn.svelte";

  interface Props {
    /** If provided, shows workspace view for a single project. Otherwise shows global view. */
    projectId?: string;
    /** Callback when a session card is clicked */
    onSessionSelect?: (session: BoardSession) => void;
    /** Callback to close the dashboard */
    onClose?: () => void;
    /** Poll interval in ms for real-time updates (default: 2000) */
    pollInterval?: number;
  }

  let { projectId, onSessionSelect, onClose, pollInterval = 2000 }: Props = $props();

  let boardData = $state<BoardData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // View mode: "board" shows columns, "grouped" shows by project
  let viewMode = $state<"board" | "grouped">("board");

  // For global view, whether to expand project groups
  let expandedGroups = $state<Set<string>>(new Set());

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

  function toggleGroup(projectId: string) {
    if (expandedGroups.has(projectId)) {
      expandedGroups.delete(projectId);
    } else {
      expandedGroups.add(projectId);
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

  // Is this showing a single project or global?
  let isWorkspaceView = $derived(!!projectId);
  let currentGroup = $derived(
    boardData?.groups.find((g) => g.projectId === projectId) || null
  );

  onMount(() => {
    fetchData();
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });

  // Re-fetch when projectId changes
  $effect(() => {
    if (projectId !== undefined) {
      loading = true;
      fetchData();
    }
  });
</script>

<div class="h-full flex flex-col bg-white">
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <h2 class="text-lg font-semibold text-gray-800">
          {#if isWorkspaceView && currentGroup}
            {currentGroup.projectName}
          {:else}
            Sessions Dashboard
          {/if}
        </h2>
      </div>

      {#if boardData}
        <div class="flex items-center gap-3 text-xs">
          {#if boardData.totals.working > 0}
            <span class="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {boardData.totals.working} working
            </span>
          {/if}
          {#if boardData.totals.needs_approval > 0}
            <span class="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              {boardData.totals.needs_approval} need approval
            </span>
          {/if}
          {#if boardData.totals.needs_review > 0}
            <span class="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              {boardData.totals.needs_review} to review
            </span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-3">
      <!-- View toggle (only for global view) -->
      {#if !isWorkspaceView}
        <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors {viewMode === 'board' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
            onclick={() => viewMode = "board"}
          >
            Board
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors {viewMode === 'grouped' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
            onclick={() => viewMode = "grouped"}
          >
            By Project
          </button>
        </div>
      {/if}

      {#if onClose}
        <button
          onclick={onClose}
          class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Close"
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
        <div class="text-gray-400">Loading sessions...</div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center h-full">
        <div class="text-red-500">{error}</div>
      </div>
    {:else if !boardData || boardData.groups.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-gray-400">
        <svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>No sessions found</p>
        <p class="text-sm text-gray-300 mt-1">Start a chat to see it here</p>
      </div>
    {:else if isWorkspaceView && currentGroup}
      <!-- Workspace view: columns for single project -->
      <div class="flex gap-4 overflow-x-auto h-full">
        {#each BOARD_COLUMNS as column (column.type)}
          <BoardColumn
            {column}
            sessions={currentGroup.columns[column.type]}
            onSessionClick={handleSessionClick}
          />
        {/each}
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
          <div class="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
            <button
              class="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-colors"
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
                  <h3 class="text-sm font-medium text-gray-800">{group.projectName}</h3>
                  <p class="text-xs text-gray-400 truncate max-w-[400px]">{group.projectPath}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 text-xs">
                {#if group.columns.working.length > 0}
                  <span class="flex items-center gap-1 text-green-600">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    {group.columns.working.length}
                  </span>
                {/if}
                {#if group.columns.needs_approval.length > 0}
                  <span class="flex items-center gap-1 text-amber-600">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    {group.columns.needs_approval.length}
                  </span>
                {/if}
                {#if group.columns.needs_review.length > 0}
                  <span class="flex items-center gap-1 text-blue-600">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    {group.columns.needs_review.length}
                  </span>
                {/if}
                <span class="text-gray-400">{group.sessionCount} total</span>
              </div>
            </button>

            {#if expandedGroups.has(group.projectId)}
              <div class="flex gap-4 overflow-x-auto p-4 pt-0 bg-white border-t border-gray-100">
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
