<script lang="ts">
  import type { GitStatus } from "../types";
  import { STATUS_COLORS } from "../types";
  import * as gitApi from "../api";

  interface Props {
    rootPath: string;
    status: GitStatus | null;
    selectedFile: string | null;
    onSelectFile: (file: string, staged: boolean) => void;
    onRefresh: () => void;
  }

  let { rootPath, status, selectedFile, onSelectFile, onRefresh }: Props = $props();

  let expandedSections = $state<Set<string>>(new Set(["staged", "modified", "untracked"]));
  let commitMessage = $state("");
  let committing = $state(false);
  let commitError = $state("");
  let generating = $state(false);

  function toggleSection(section: string) {
    if (expandedSections.has(section)) {
      expandedSections.delete(section);
    } else {
      expandedSections.add(section);
    }
    expandedSections = new Set(expandedSections);
  }

  function getFileName(path: string): string {
    const parts = path.split("/");
    if (parts.length <= 2) return path;
    return parts.slice(-2).join("/");
  }

  async function stageFile(file: string) {
    try {
      await gitApi.stageFiles(rootPath, [file]);
      onRefresh();
    } catch (e) {
      console.error("Failed to stage:", e);
    }
  }

  async function unstageFile(file: string) {
    try {
      await gitApi.unstageFiles(rootPath, [file]);
      onRefresh();
    } catch (e) {
      console.error("Failed to unstage:", e);
    }
  }

  async function handleCommit() {
    if (!commitMessage.trim() || !status?.staged.length) return;
    committing = true;
    commitError = "";
    try {
      await gitApi.commit(rootPath, commitMessage.trim());
      commitMessage = "";
      onRefresh();
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Commit failed";
    } finally {
      committing = false;
    }
  }

  async function handleGenerateMessage() {
    if (!status?.staged.length) return;
    generating = true;
    commitError = "";
    try {
      const message = await gitApi.generateCommitMessage(rootPath);
      commitMessage = message;
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Failed to generate message";
    } finally {
      generating = false;
    }
  }

  async function handleStageAll() {
    try {
      await gitApi.stageAll(rootPath);
      onRefresh();
    } catch (e) {
      console.error("Failed to stage all:", e);
    }
  }
</script>

<div class="h-full flex flex-col">
  <!-- Commit Form -->
  {#if status && status.staged.length > 0}
    <div class="px-3 py-2 border-b border-gray-200 bg-white shrink-0">
      <div class="flex gap-1.5">
        <input
          type="text"
          bind:value={commitMessage}
          placeholder="Commit message..."
          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          onkeydown={(e) => e.key === "Enter" && handleCommit()}
          disabled={committing || generating}
        />
        <button
          onclick={handleGenerateMessage}
          disabled={generating || committing}
          class="px-2 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Generate commit message with AI"
        >
          {#if generating}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          {/if}
        </button>
        <button
          onclick={handleCommit}
          disabled={!commitMessage.trim() || committing || generating}
          class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {committing ? "..." : "Commit"}
        </button>
      </div>
      {#if commitError}
        <p class="text-xs text-red-500 mt-1">{commitError}</p>
      {/if}
    </div>
  {/if}

  <!-- Stage All button -->
  {#if status && (status.modified.length > 0 || status.untracked.length > 0) && status.staged.length === 0}
    <div class="px-3 py-2 border-b border-gray-200 bg-white shrink-0">
      <button
        onclick={handleStageAll}
        class="w-full px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
      >
        Stage All Changes
      </button>
    </div>
  {/if}

  <!-- File List -->
  <div class="flex-1 overflow-y-auto p-2 space-y-1">
    {#if status}
      <!-- Staged Changes -->
      {#if status.staged.length > 0}
        <div>
          <button
            onclick={() => toggleSection("staged")}
            class="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded"
          >
            <svg class="w-3 h-3 transition-transform {expandedSections.has('staged') ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-green-600">Staged</span>
            <span class="text-gray-400">({status.staged.length})</span>
          </button>
          {#if expandedSections.has("staged")}
            <div class="ml-4 space-y-px">
              {#each status.staged as file}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => onSelectFile(file.path, true)}
                  ondblclick={() => onSelectFile(file.path, true)}
                  class="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded group cursor-pointer {selectedFile === file.path ? 'bg-blue-50' : ''}"
                >
                  <span class="px-1 text-[10px] font-mono rounded {STATUS_COLORS[file.status] || 'text-gray-600 bg-gray-50'}">
                    {file.status}
                  </span>
                  <span class="truncate flex-1 text-left text-gray-700" title={file.path}>{getFileName(file.path)}</span>
                  <button
                    onclick={(e) => { e.stopPropagation(); unstageFile(file.path); }}
                    class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600"
                    title="Unstage"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Modified Files -->
      {#if status.modified.length > 0}
        <div>
          <button
            onclick={() => toggleSection("modified")}
            class="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded"
          >
            <svg class="w-3 h-3 transition-transform {expandedSections.has('modified') ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-yellow-600">Changes</span>
            <span class="text-gray-400">({status.modified.length})</span>
          </button>
          {#if expandedSections.has("modified")}
            <div class="ml-4 space-y-px">
              {#each status.modified as file}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => onSelectFile(file.path, false)}
                  ondblclick={() => onSelectFile(file.path, false)}
                  class="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded group cursor-pointer {selectedFile === file.path ? 'bg-blue-50' : ''}"
                >
                  <span class="px-1 text-[10px] font-mono rounded {STATUS_COLORS[file.status] || 'text-gray-600 bg-gray-50'}">
                    {file.status}
                  </span>
                  <span class="truncate flex-1 text-left text-gray-700" title={file.path}>{getFileName(file.path)}</span>
                  <button
                    onclick={(e) => { e.stopPropagation(); stageFile(file.path); }}
                    class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600"
                    title="Stage"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Untracked Files -->
      {#if status.untracked.length > 0}
        <div>
          <button
            onclick={() => toggleSection("untracked")}
            class="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded"
          >
            <svg class="w-3 h-3 transition-transform {expandedSections.has('untracked') ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-gray-500">Untracked</span>
            <span class="text-gray-400">({status.untracked.length})</span>
          </button>
          {#if expandedSections.has("untracked")}
            <div class="ml-4 space-y-px">
              {#each status.untracked as file}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => onSelectFile(file.path, false)}
                  ondblclick={() => onSelectFile(file.path, false)}
                  class="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded group cursor-pointer {selectedFile === file.path ? 'bg-blue-50' : ''}"
                >
                  <span class="px-1 text-[10px] font-mono rounded text-gray-500 bg-gray-50">?</span>
                  <span class="truncate flex-1 text-left text-gray-600" title={file.path}>{getFileName(file.path)}</span>
                  <button
                    onclick={(e) => { e.stopPropagation(); stageFile(file.path); }}
                    class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600"
                    title="Stage"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if status.staged.length === 0 && status.modified.length === 0 && status.untracked.length === 0}
        <div class="text-center py-8 text-sm text-gray-400">
          <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Working tree clean
        </div>
      {/if}
    {/if}
  </div>
</div>
