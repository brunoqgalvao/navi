<script lang="ts">
  import { createPatch } from 'diff';
  import { html as diff2html } from 'diff2html';

  interface Props {
    oldText: string;
    newText: string;
    fileName?: string;
    outputFormat?: 'line-by-line' | 'side-by-side';
    showHeader?: boolean;
    maxHeight?: string;
  }

  let {
    oldText = '',
    newText = '',
    fileName = 'file',
    outputFormat = 'line-by-line',
    showHeader = false,
    maxHeight = '300px'
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
  <div class="diff-viewer" style:--max-height={maxHeight}>
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
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #fafafa;
  }

  .diff-header {
    display: flex;
    gap: 8px;
    padding: 6px 12px;
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
  }

  .diff-stat {
    font-size: 11px;
    font-weight: 600;
  }

  .diff-stat.added {
    color: #16a34a;
  }

  .diff-stat.removed {
    color: #dc2626;
  }

  .diff-content {
    max-height: var(--max-height, 300px);
    overflow: auto;
    background: white;
  }

  /* Reset and hide unnecessary elements */
  :global(.diff-viewer .d2h-file-header),
  :global(.diff-viewer .d2h-file-diff .d2h-file-header) {
    display: none !important;
  }

  :global(.diff-viewer .d2h-wrapper) {
    margin: 0;
  }

  :global(.diff-viewer .d2h-file-wrapper) {
    border: none;
    margin: 0;
    border-radius: 0;
  }

  /* Table layout */
  :global(.diff-viewer .d2h-diff-table) {
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
  }

  :global(.diff-viewer .d2h-diff-tbody) {
    display: table-row-group;
  }

  :global(.diff-viewer tr) {
    display: table-row;
  }

  :global(.diff-viewer td) {
    display: table-cell;
    vertical-align: top;
    border: none;
    padding: 0;
  }

  /* Hide the +/- prefix - the colors are enough */
  :global(.diff-viewer .d2h-code-line-prefix) {
    display: none !important;
  }

  /* Code line content */
  :global(.diff-viewer .d2h-code-line) {
    padding: 1px 12px 1px 8px;
    line-height: 1.5;
  }

  :global(.diff-viewer .d2h-code-line-ctn) {
    white-space: pre;
    word-break: keep-all;
    overflow-x: auto;
  }

  /* Line numbers column */
  :global(.diff-viewer .d2h-code-linenumber) {
    width: 44px;
    min-width: 44px;
    max-width: 44px;
    color: #9ca3af;
    background-color: #f9fafb;
    border-right: 1px solid #e5e7eb;
    text-align: right;
    padding: 1px 8px 1px 4px;
    user-select: none;
    font-size: 11px;
  }

  /* Insertion (added lines) - green */
  :global(.diff-viewer .d2h-ins) {
    background-color: #ecfdf5 !important;
  }

  :global(.diff-viewer .d2h-ins .d2h-code-line-ctn) {
    background-color: #d1fae5 !important;
  }

  :global(.diff-viewer .d2h-ins .d2h-code-linenumber) {
    background-color: #d1fae5 !important;
    color: #065f46;
    border-right-color: #a7f3d0;
  }

  /* Deletion (removed lines) - red */
  :global(.diff-viewer .d2h-del) {
    background-color: #fef2f2 !important;
  }

  :global(.diff-viewer .d2h-del .d2h-code-line-ctn) {
    background-color: #fee2e2 !important;
  }

  :global(.diff-viewer .d2h-del .d2h-code-linenumber) {
    background-color: #fee2e2 !important;
    color: #991b1b;
    border-right-color: #fecaca;
  }

  /* Unchanged/context lines */
  :global(.diff-viewer .d2h-cntx) {
    background-color: white !important;
  }

  :global(.diff-viewer .d2h-cntx .d2h-code-line-ctn) {
    background-color: white !important;
  }

  :global(.diff-viewer .d2h-cntx .d2h-code-linenumber) {
    background-color: #f9fafb !important;
  }

  /* Info/hunk header (@@) */
  :global(.diff-viewer .d2h-info) {
    background-color: #f0f9ff !important;
    color: #0369a1;
    padding: 4px 12px;
    font-size: 11px;
    font-style: italic;
    border-top: 1px solid #e0f2fe;
    border-bottom: 1px solid #e0f2fe;
  }

  /* Word-level diff highlighting */
  :global(.diff-viewer .d2h-ins .d2h-change) {
    background-color: #86efac !important;
    border-radius: 2px;
  }

  :global(.diff-viewer .d2h-del .d2h-change) {
    background-color: #fca5a5 !important;
    border-radius: 2px;
  }

  /* Empty placeholder for side-by-side */
  :global(.diff-viewer .d2h-code-side-emptyplaceholder) {
    background-color: #f3f4f6 !important;
  }

  /* Make sure no weird borders appear */
  :global(.diff-viewer .d2h-file-side-diff) {
    border: none;
  }

  :global(.diff-viewer .d2h-files-diff) {
    border: none;
  }
</style>
