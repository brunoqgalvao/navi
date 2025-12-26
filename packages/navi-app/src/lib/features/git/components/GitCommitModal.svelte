<script lang="ts">
  import type { GitStatus } from "../types";
  import { STATUS_COLORS } from "../types";
  import * as gitApi from "../api";

  interface Props {
    rootPath: string;
    status: GitStatus;
    onClose: () => void;
    onCommit: () => void;
  }

  let { rootPath, status, onClose, onCommit }: Props = $props();

  let commitMessage = $state("");
  let committing = $state(false);
  let generating = $state(false);
  let error = $state("");

  function getFileName(path: string): string {
    const parts = path.split("/");
    if (parts.length <= 2) return path;
    return parts.slice(-2).join("/");
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    committing = true;
    error = "";
    try {
      await gitApi.commit(rootPath, commitMessage.trim());
      onCommit();
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Commit failed";
    } finally {
      committing = false;
    }
  }

  async function handleGenerate() {
    generating = true;
    error = "";
    try {
      const message = await gitApi.generateCommitMessage(rootPath);
      commitMessage = message;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to generate message";
    } finally {
      generating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleCommit();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-900">Create Commit</h2>
      <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 rounded">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6 space-y-4">
      <!-- Commit Message Input -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-gray-700">Commit Message</label>
          <button
            onclick={handleGenerate}
            disabled={generating || status.staged.length === 0}
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {#if generating}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span>Generating...</span>
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Generate with AI</span>
            {/if}
          </button>
        </div>
        <textarea
          bind:value={commitMessage}
          placeholder="Describe your changes..."
          class="w-full h-32 px-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
          disabled={committing || generating}
        ></textarea>
        <p class="text-xs text-gray-400 mt-1">Tip: Use conventional commits format (feat:, fix:, refactor:, etc.)</p>
      </div>

      <!-- Staged Files -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-gray-700">Staged Changes ({status.staged.length})</label>
        </div>
        {#if status.staged.length === 0}
          <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-sm text-yellow-700">No files staged. Stage some files first.</p>
          </div>
        {:else}
          <div class="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {#each status.staged as file}
              <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <span class="text-[10px] font-mono px-1 rounded {STATUS_COLORS[file.status]}">{file.status}</span>
                <span class="text-sm text-gray-700 truncate" title={file.path}>{getFileName(file.path)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Error -->
      {#if error}
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-700">{error}</p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
      <p class="text-xs text-gray-500">
        <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">⌘</kbd> + <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">Enter</kbd> to commit
      </p>
      <div class="flex items-center gap-3">
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleCommit}
          disabled={!commitMessage.trim() || committing || status.staged.length === 0}
          class="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {#if committing}
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Committing...
            </span>
          {:else}
            Commit Changes
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
