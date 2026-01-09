<script lang="ts">
  /**
   * QuickSessionsPanel - Quick access to sessions by status
   *
   * Shows sessions grouped by:
   * - Working (running)
   * - Waiting Approval (permission requests)
   * - Idle (recently active, last 8h, max 10)
   */
  import { attentionItems } from "../stores";
  import type { Session } from "../api";
  import SessionStatusBadge from "./SessionStatusBadge.svelte";
  import RelativeTime from "./RelativeTime.svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
    onSelectSession: (session: Session) => void;
  }

  let { open, onClose, onSelectSession }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  function selectAndClose(session: Session) {
    onSelectSession(session);
    onClose();
  }

  let hasAnyContent = $derived(
    $attentionItems.runningSessions.length > 0 ||
    $attentionItems.needsApproval.length > 0 ||
    $attentionItems.needsReviewSessions.length > 0 ||
    $attentionItems.idleSessions.length > 0
  );
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
    onclick={onClose}
    aria-label="Close panel"
  ></button>

  <!-- Panel -->
  <div
    class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 z-[101] overflow-hidden flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label="Quick Sessions"
  >
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <h2 class="text-sm font-semibold text-gray-800">Quick Sessions</h2>
      </div>
      <button
        onclick={onClose}
        class="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Close"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-2">
      {#if !hasAnyContent}
        <div class="py-12 text-center text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="text-sm">No active sessions</p>
          <p class="text-xs text-gray-300 mt-1">Start a chat to see it here</p>
        </div>
      {:else}
        <!-- Working Section -->
        {#if $attentionItems.runningSessions.length > 0}
          <div class="mb-3">
            <div class="flex items-center gap-2 px-2 py-1.5 mb-1">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span class="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Working</span>
              <span class="text-[10px] text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                {$attentionItems.totalRunning}
              </span>
            </div>
            <div class="space-y-1">
              {#each $attentionItems.runningSessions as item}
                <button
                  onclick={() => selectAndClose(item.session)}
                  class="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors group flex items-center gap-2"
                >
                  <SessionStatusBadge status="running" size="sm" />
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-700 truncate group-hover:text-indigo-700">
                      {item.session.title}
                    </div>
                    {#if item.session.project_name}
                      <div class="text-[10px] text-gray-400 truncate">{item.session.project_name}</div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Waiting Approval Section -->
        {#if $attentionItems.needsApproval.length > 0}
          <div class="mb-3">
            <div class="flex items-center gap-2 px-2 py-1.5 mb-1">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span class="text-xs font-semibold text-amber-600 uppercase tracking-wide">Waiting Approval</span>
              <span class="text-[10px] text-amber-400 bg-amber-50 px-1.5 py-0.5 rounded-full">
                {$attentionItems.totalNeedsApproval}
              </span>
            </div>
            <div class="space-y-1">
              {#each $attentionItems.needsApproval as item}
                <button
                  onclick={() => selectAndClose(item.session)}
                  class="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors group flex items-center gap-2"
                >
                  <SessionStatusBadge status="permission" size="sm" />
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-700 truncate group-hover:text-amber-700">
                      {item.session.title}
                    </div>
                    <div class="flex items-center gap-1.5">
                      {#if item.session.project_name}
                        <span class="text-[10px] text-gray-400 truncate">{item.session.project_name}</span>
                        <span class="text-[10px] text-gray-300">·</span>
                      {/if}
                      <span class="text-[10px] text-amber-500 font-medium">Needs approval</span>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Needs Review Section -->
        {#if $attentionItems.needsReviewSessions.length > 0}
          <div class="mb-3">
            <div class="flex items-center gap-2 px-2 py-1.5 mb-1">
              <span class="h-2 w-2 rounded-full bg-blue-500"></span>
              <span class="text-xs font-semibold text-blue-600 uppercase tracking-wide">Needs Review</span>
              <span class="text-[10px] text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded-full">
                {$attentionItems.totalNeedsReview}
              </span>
            </div>
            <div class="space-y-1">
              {#each $attentionItems.needsReviewSessions as item}
                <button
                  onclick={() => selectAndClose(item.session)}
                  class="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors group flex items-center gap-2"
                >
                  <span class="h-2 w-2 rounded-full bg-blue-400 shrink-0"></span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-700 truncate group-hover:text-blue-700">
                      {item.session.title}
                    </div>
                    <div class="flex items-center gap-1.5">
                      {#if item.session.project_name}
                        <span class="text-[10px] text-gray-400 truncate">{item.session.project_name}</span>
                        <span class="text-[10px] text-gray-300">·</span>
                      {/if}
                      <span class="text-[10px] text-blue-500 font-medium">Marked for review</span>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Idle Section -->
        {#if $attentionItems.idleSessions.length > 0}
          <div>
            <div class="flex items-center gap-2 px-2 py-1.5 mb-1">
              <span class="h-2 w-2 rounded-full bg-gray-300"></span>
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Idle</span>
              <span class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {$attentionItems.idleSessions.length}{$attentionItems.totalIdle > 10 ? '+' : ''}
              </span>
              <span class="text-[10px] text-gray-300 ml-auto">last 8h</span>
            </div>
            <div class="space-y-1">
              {#each $attentionItems.idleSessions as item}
                <button
                  onclick={() => selectAndClose(item.session)}
                  class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group flex items-center gap-2"
                >
                  <span class="h-2 w-2 rounded-full bg-gray-200 shrink-0"></span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-gray-600 truncate group-hover:text-gray-800">
                      {item.session.title}
                    </div>
                    <div class="flex items-center gap-1.5">
                      {#if item.session.project_name}
                        <span class="text-[10px] text-gray-400 truncate">{item.session.project_name}</span>
                        <span class="text-[10px] text-gray-300">·</span>
                      {/if}
                      <span class="text-[10px] text-gray-400">
                        <RelativeTime timestamp={item.session.updated_at} />
                      </span>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Footer hint -->
    <div class="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
      <div class="flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
        <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">Esc</kbd>
        <span>to close</span>
        <span class="mx-1">·</span>
        <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">⌘</kbd>
        <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">J</kbd>
        <span>to toggle</span>
      </div>
    </div>
  </div>
{/if}
