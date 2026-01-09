<script lang="ts">
  import type { BoardSession, BoardColumn as BoardColumnType } from "../types";
  import SessionCard from "./SessionCard.svelte";

  interface Props {
    column: BoardColumnType;
    sessions: BoardSession[];
    showProject?: boolean;
    onSessionClick?: (session: BoardSession) => void;
  }

  let { column, sessions, showProject = false, onSessionClick }: Props = $props();

  const columnHeaderColors: Record<string, string> = {
    working: "text-green-600",
    needs_approval: "text-amber-600",
    needs_review: "text-blue-600",
    idle: "text-gray-500",
  };

  const columnBgColors: Record<string, string> = {
    working: "bg-green-50",
    needs_approval: "bg-amber-50",
    needs_review: "bg-blue-50",
    idle: "bg-gray-50",
  };
</script>

<div class="flex flex-col min-w-[280px] max-w-[320px] flex-1">
  <div class="flex items-center justify-between mb-3 px-1">
    <div class="flex items-center gap-2">
      <span class={`w-2 h-2 rounded-full ${column.color.replace('text-', 'bg-')}`}></span>
      <h3 class="text-sm font-semibold {columnHeaderColors[column.type]}">{column.label}</h3>
    </div>
    <span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      {sessions.length}
    </span>
  </div>

  <div class="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)] pr-1 {columnBgColors[column.type]} rounded-lg p-2">
    {#if sessions.length === 0}
      <div class="text-xs text-gray-400 text-center py-4 bg-white/50 rounded-lg border border-dashed border-gray-200">
        No sessions
      </div>
    {:else}
      {#each sessions as session (session.id)}
        <SessionCard
          {session}
          {showProject}
          onclick={() => onSessionClick?.(session)}
        />
      {/each}
    {/if}
  </div>
</div>
