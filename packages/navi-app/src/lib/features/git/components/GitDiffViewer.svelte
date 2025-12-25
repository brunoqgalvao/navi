<script lang="ts">
  import { html as diff2html } from "diff2html";
  import type { GitCommit } from "../types";

  interface Props {
    diff: string | null;
    loading: boolean;
    selectedCommit?: GitCommit | null;
    selectedFile?: string | null;
  }

  let { diff, loading, selectedCommit, selectedFile }: Props = $props();

  function getDiffHtml(diffStr: string): string {
    if (!diffStr) return "";
    return diff2html(diffStr, {
      drawFileList: false,
      outputFormat: "line-by-line",
      matching: "lines",
    });
  }
</script>

<div class="h-full overflow-y-auto bg-gray-50">
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <svg class="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else if diff}
    <div class="diff-viewer text-xs">
      {#if selectedCommit}
        <div class="p-3 border-b border-gray-200 bg-white sticky top-0">
          <p class="font-medium text-gray-900">{selectedCommit.message}</p>
          <p class="text-gray-500 text-xs mt-1">
            {selectedCommit.author} · {selectedCommit.date}
          </p>
        </div>
      {/if}
      {#if selectedFile}
        <div class="p-2 border-b border-gray-200 bg-white sticky top-0">
          <p class="text-xs font-mono text-gray-600 truncate" title={selectedFile}>{selectedFile}</p>
        </div>
      {/if}
      {@html getDiffHtml(diff)}
    </div>
  {:else}
    <div class="flex items-center justify-center h-full text-sm text-gray-400">
      Select a file or commit to view diff
    </div>
  {/if}
</div>

<style>
  :global(.diff-viewer) {
    overflow: hidden;
  }
  :global(.diff-viewer .d2h-wrapper) {
    margin: 0;
  }
  :global(.diff-viewer .d2h-file-wrapper) {
    border: none;
    margin: 0;
  }
  :global(.diff-viewer .d2h-file-header) {
    background: #f9fafb;
    padding: 8px 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  :global(.diff-viewer .d2h-file-name) {
    font-size: 12px;
  }
  :global(.diff-viewer .d2h-diff-table) {
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    width: 100%;
    table-layout: fixed;
  }
  :global(.diff-viewer .d2h-code-line) {
    padding: 0 8px;
  }
  :global(.diff-viewer .d2h-code-line-ctn) {
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
  }
  :global(.diff-viewer .d2h-ins) {
    background-color: #dcfce7;
  }
  :global(.diff-viewer .d2h-del) {
    background-color: #fee2e2;
  }
  :global(.diff-viewer .d2h-ins .d2h-code-line-ctn) {
    background-color: #bbf7d0;
  }
  :global(.diff-viewer .d2h-del .d2h-code-line-ctn) {
    background-color: #fecaca;
  }
  :global(.diff-viewer .d2h-code-linenumber) {
    width: 36px;
    min-width: 36px;
    max-width: 36px;
    color: #9ca3af;
    background-color: #f9fafb;
    border-right: 1px solid #e5e7eb;
  }
  :global(.diff-viewer .d2h-ins .d2h-code-linenumber) {
    background-color: #bbf7d0;
    color: #166534;
  }
  :global(.diff-viewer .d2h-del .d2h-code-linenumber) {
    background-color: #fecaca;
    color: #991b1b;
  }
  :global(.diff-viewer .d2h-info) {
    background-color: #eff6ff;
    color: #2563eb;
    padding: 4px 8px;
    font-size: 11px;
  }
</style>
