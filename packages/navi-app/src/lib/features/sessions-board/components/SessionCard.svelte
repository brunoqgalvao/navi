<script lang="ts">
  import type { BoardSession, BoardColumnType } from "../types";
  import { relativeTime } from "../../../utils/formatting";

  interface Props {
    session: BoardSession;
    showProject?: boolean;
    onclick?: () => void;
  }

  let { session, showProject = false, onclick }: Props = $props();

  const columnColors: Record<BoardColumnType, string> = {
    working: "border-l-green-500",
    needs_approval: "border-l-amber-500",
    needs_review: "border-l-blue-500",
    idle: "border-l-gray-300",
  };

  const statusIndicators: Record<BoardColumnType, { bg: string; animate?: string }> = {
    working: { bg: "bg-green-500", animate: "animate-pulse" },
    needs_approval: { bg: "bg-amber-500", animate: "animate-pulse" },
    needs_review: { bg: "bg-blue-500" },
    idle: { bg: "bg-gray-400" },
  };

  let timeAgo = $derived(relativeTime(session.lastActivity));

  let formattedCost = $derived(
    session.costUsd > 0 ? `$${session.costUsd.toFixed(2)}` : ""
  );
</script>

<button
  class="w-full text-left bg-white hover:bg-gray-50 rounded-lg p-3 border border-gray-200 border-l-4 {columnColors[session.columnType]} transition-colors cursor-pointer shadow-sm hover:shadow"
  onclick={onclick}
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span
          class="w-2 h-2 rounded-full {statusIndicators[session.columnType].bg} {statusIndicators[session.columnType].animate || ''}"
        ></span>
        <h4 class="text-sm font-medium text-gray-800 truncate">{session.title}</h4>
      </div>

      {#if showProject}
        <p class="text-xs text-gray-500 mt-1 truncate">
          {session.projectName}
        </p>
      {/if}

      {#if session.worktreeBranch}
        <div class="flex items-center gap-1 mt-1">
          <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span class="text-xs text-gray-500 truncate">{session.worktreeBranch}</span>
        </div>
      {/if}
    </div>

    <div class="flex flex-col items-end gap-1 text-xs text-gray-400">
      <span>{timeAgo}</span>
      {#if formattedCost}
        <span class="text-gray-500">{formattedCost}</span>
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
    <span class="flex items-center gap-1">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {session.messageCount} msgs
    </span>

    {#if session.model}
      <span class="truncate max-w-[80px]" title={session.model}>
        {session.model.split("-").pop()}
      </span>
    {/if}

    {#if session.isUntilDoneMode}
      <span class="flex items-center gap-1 text-purple-500" title="Until Done mode">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {#if session.untilDoneIteration}
          #{session.untilDoneIteration}
        {/if}
      </span>
    {/if}
  </div>
</button>
