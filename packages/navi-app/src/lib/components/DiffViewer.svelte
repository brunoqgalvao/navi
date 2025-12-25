<script lang="ts">
  import { createPatch } from 'diff';
  import { html as diff2html } from 'diff2html';

  interface Props {
    oldText: string;
    newText: string;
    fileName?: string;
    outputFormat?: 'line-by-line' | 'side-by-side';
    showHeader?: boolean;
  }

  let { 
    oldText = '', 
    newText = '', 
    fileName = 'file',
    outputFormat = 'line-by-line',
    showHeader = false
  }: Props = $props();

  const diffHtml = $derived.by(() => {
    if (oldText === newText) return null;
    
    const patch = createPatch(
      fileName,
      oldText,
      newText,
      '',
      '',
      { context: 3 }
    );
    
    return diff2html(patch, {
      drawFileList: false,
      outputFormat,
      matching: 'lines',
      renderNothingWhenEmpty: true,
    });
  });

  const stats = $derived.by(() => {
    const oldLines = oldText ? oldText.split('\n').length : 0;
    const newLines = newText ? newText.split('\n').length : 0;
    const added = Math.max(0, newLines - oldLines);
    const removed = Math.max(0, oldLines - newLines);
    return { added, removed, oldLines, newLines };
  });
</script>

{#if diffHtml}
  <div class="diff-viewer">
    {#if showHeader}
      <div class="diff-header">
        <span class="diff-stat added">+{stats.added}</span>
        <span class="diff-stat removed">-{stats.removed}</span>
      </div>
    {/if}
    <div class="diff-content">
      {@html diffHtml}
    </div>
  </div>
{:else}
  <div class="text-xs text-gray-400 italic">No changes</div>
{/if}

<style>
  .diff-viewer {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 6px;
    overflow: hidden;
  }

  .diff-header {
    display: flex;
    gap: 8px;
    padding: 4px 8px;
    background: #f6f8fa;
    border-bottom: 1px solid #e1e4e8;
  }

  .diff-stat {
    font-size: 11px;
    font-weight: 500;
  }

  .diff-stat.added {
    color: #22863a;
  }

  .diff-stat.removed {
    color: #cb2431;
  }

  .diff-content {
    max-height: 400px;
    overflow: auto;
  }

  :global(.diff-viewer .d2h-wrapper) {
    margin: 0;
  }

  :global(.diff-viewer .d2h-file-wrapper) {
    border: none;
    margin: 0;
  }

  :global(.diff-viewer .d2h-file-header) {
    display: none;
  }

  :global(.diff-viewer .d2h-diff-table) {
    font-size: 12px;
  }

  :global(.diff-viewer .d2h-code-line) {
    padding: 0 8px;
  }

  :global(.diff-viewer .d2h-code-line-ctn) {
    white-space: pre-wrap;
    word-break: break-all;
  }

  :global(.diff-viewer .d2h-ins) {
    background-color: #e6ffec;
  }

  :global(.diff-viewer .d2h-del) {
    background-color: #ffebe9;
  }

  :global(.diff-viewer .d2h-ins .d2h-code-line-ctn) {
    background-color: #ccffd8;
  }

  :global(.diff-viewer .d2h-del .d2h-code-line-ctn) {
    background-color: #ffd7d5;
  }

  :global(.diff-viewer .d2h-code-linenumber) {
    width: 40px;
    min-width: 40px;
    color: #6e7781;
    background-color: #f6f8fa;
    border-right: 1px solid #e1e4e8;
  }

  :global(.diff-viewer .d2h-ins .d2h-code-linenumber) {
    background-color: #ccffd8;
    color: #22863a;
  }

  :global(.diff-viewer .d2h-del .d2h-code-linenumber) {
    background-color: #ffd7d5;
    color: #cb2431;
  }

  :global(.diff-viewer .d2h-info) {
    background-color: #f1f8ff;
    color: #0366d6;
    padding: 4px 8px;
  }
</style>
