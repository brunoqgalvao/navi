<script lang="ts">
  import { diffLines, diffWordsWithSpace } from 'diff';

  interface Props {
    oldText: string;
    newText: string;
    fileName?: string;
    maxHeight?: string;
    showHeader?: boolean;
    contextLines?: number;
  }

  let {
    oldText = '',
    newText = '',
    fileName = 'file',
    maxHeight = '300px',
    showHeader = true,
    contextLines = 3
  }: Props = $props();

  interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'hunk';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
    wordDiff?: Array<{ type: 'add' | 'remove' | 'equal'; value: string }>;
  }

  const diffResult = $derived.by(() => {
    if (oldText === newText) return { lines: [], stats: { added: 0, removed: 0 } };

    const changes = diffLines(oldText, newText);
    const lines: DiffLine[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;
    let stats = { added: 0, removed: 0 };

    // Process changes and build line-by-line diff
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const changeLines = change.value.replace(/\n$/, '').split('\n');

      if (change.added) {
        // Check if previous change was a removal (for word-level diff)
        const prevChange = changes[i - 1];
        const prevLines = prevChange?.removed
          ? prevChange.value.replace(/\n$/, '').split('\n')
          : [];

        for (let j = 0; j < changeLines.length; j++) {
          const line = changeLines[j];
          let wordDiff: DiffLine['wordDiff'] = undefined;

          // If we have a corresponding removed line, compute word diff
          if (j < prevLines.length) {
            const words = diffWordsWithSpace(prevLines[j], line);
            wordDiff = words.map(w => ({
              type: (w.added ? 'add' : w.removed ? 'remove' : 'equal') as 'add' | 'remove' | 'equal',
              value: w.value
            })).filter(w => w.type !== 'remove'); // Only show added/equal for add lines
          }

          lines.push({
            type: 'add',
            content: line,
            newLineNum: newLineNum++,
            wordDiff
          });
          stats.added++;
        }
      } else if (change.removed) {
        // Check if next change is an addition (for word-level diff)
        const nextChange = changes[i + 1];
        const nextLines = nextChange?.added
          ? nextChange.value.replace(/\n$/, '').split('\n')
          : [];

        for (let j = 0; j < changeLines.length; j++) {
          const line = changeLines[j];
          let wordDiff: DiffLine['wordDiff'] = undefined;

          // If we have a corresponding added line, compute word diff
          if (j < nextLines.length) {
            const words = diffWordsWithSpace(line, nextLines[j]);
            wordDiff = words.map(w => ({
              type: (w.added ? 'add' : w.removed ? 'remove' : 'equal') as 'add' | 'remove' | 'equal',
              value: w.value
            })).filter(w => w.type !== 'add'); // Only show removed/equal for remove lines
          }

          lines.push({
            type: 'remove',
            content: line,
            oldLineNum: oldLineNum++,
            wordDiff
          });
          stats.removed++;
        }
      } else {
        // Context lines
        for (const line of changeLines) {
          lines.push({
            type: 'context',
            content: line,
            oldLineNum: oldLineNum++,
            newLineNum: newLineNum++
          });
        }
      }
    }

    return { lines, stats };
  });

  function formatLineNum(num: number | undefined): string {
    return num !== undefined ? String(num) : '';
  }
</script>

{#if diffResult.lines.length > 0}
  <div class="unified-diff" style:--max-height={maxHeight}>
    {#if showHeader}
      <div class="diff-header">
        <span class="file-name">{fileName}</span>
        <div class="stats">
          {#if diffResult.stats.added > 0}
            <span class="stat added">+{diffResult.stats.added}</span>
          {/if}
          {#if diffResult.stats.removed > 0}
            <span class="stat removed">-{diffResult.stats.removed}</span>
          {/if}
        </div>
      </div>
    {/if}
    <div class="diff-content">
      <table>
        <tbody>
          {#each diffResult.lines as line}
            <tr class="line {line.type}">
              <td class="line-num old">{formatLineNum(line.oldLineNum)}</td>
              <td class="line-num new">{formatLineNum(line.newLineNum)}</td>
              <td class="line-prefix">{#if line.type === 'add'}+{:else if line.type === 'remove'}-{:else}&nbsp;{/if}</td>
              <td class="line-content">
                {#if line.wordDiff}
                  <code>{#each line.wordDiff as segment}{#if segment.type === 'equal'}<span>{segment.value}</span>{:else if segment.type === 'add'}<span class="word-add">{segment.value}</span>{:else if segment.type === 'remove'}<span class="word-remove">{segment.value}</span>{/if}{/each}</code>
                {:else}
                  <code>{line.content}</code>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{:else}
  <div class="no-changes">No changes</div>
{/if}

<style>
  .unified-diff {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.6;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #d1d5db;
    background: #ffffff;
  }

  .diff-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f6f8fa;
    border-bottom: 1px solid #d1d5db;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .file-name {
    font-size: 12px;
    color: #1f2937;
    font-weight: 600;
  }

  .stats {
    display: flex;
    gap: 6px;
  }

  .stat {
    font-size: 11px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .stat.added {
    color: #166534;
    background: #dcfce7;
  }

  .stat.removed {
    color: #991b1b;
    background: #fee2e2;
  }

  .diff-content {
    max-height: var(--max-height, 300px);
    overflow: auto;
  }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  tr.line {
    border: none;
  }

  /* Line number columns */
  td.line-num {
    width: 44px;
    min-width: 44px;
    max-width: 44px;
    padding: 0 8px;
    text-align: right;
    color: rgba(0, 0, 0, 0.3);
    background: #f6f8fa;
    user-select: none;
    font-size: 11px;
    vertical-align: top;
    border-right: 1px solid #e5e7eb;
  }

  /* Prefix column (+/-) */
  td.line-prefix {
    width: 20px;
    min-width: 20px;
    max-width: 20px;
    padding: 0 4px;
    text-align: center;
    user-select: none;
    font-weight: 700;
    vertical-align: top;
  }

  /* Content column */
  td.line-content {
    padding: 0 12px 0 0;
    white-space: pre;
  }

  td.line-content code {
    font-family: inherit;
    font-size: inherit;
  }

  /* Added lines */
  tr.add {
    background: #e6ffec;
  }

  tr.add td.line-num {
    background: #ccffd8;
    color: rgba(0, 0, 0, 0.35);
  }

  tr.add td.line-prefix {
    color: #1a7f37;
    background: #e6ffec;
  }

  tr.add td.line-content {
    background: #e6ffec;
  }

  /* Removed lines */
  tr.remove {
    background: #ffebe9;
  }

  tr.remove td.line-num {
    background: #ffd7d5;
    color: rgba(0, 0, 0, 0.35);
  }

  tr.remove td.line-prefix {
    color: #cf222e;
    background: #ffebe9;
  }

  tr.remove td.line-content {
    background: #ffebe9;
  }

  /* Context lines */
  tr.context {
    background: #ffffff;
  }

  tr.context td.line-prefix {
    background: #ffffff;
  }

  /* Word-level highlighting */
  .word-add {
    background: #abf2bc;
    border-radius: 3px;
    padding: 1px 2px;
  }

  .word-remove {
    background: #ffc1ba;
    border-radius: 3px;
    padding: 1px 2px;
    text-decoration: line-through;
  }

  .no-changes {
    padding: 16px;
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
    font-style: italic;
  }

  /* ── Dark mode ── */
  :global(.dark) .unified-diff {
    border-color: #30363d;
    background: #0d1117;
  }

  :global(.dark) .diff-header {
    background: #161b22;
    border-bottom-color: #30363d;
  }

  :global(.dark) .file-name {
    color: #c9d1d9;
  }

  :global(.dark) .stat.added {
    color: #3fb950;
    background: rgba(63, 185, 80, 0.15);
  }

  :global(.dark) .stat.removed {
    color: #f85149;
    background: rgba(248, 81, 73, 0.15);
  }

  :global(.dark) td.line-num {
    background: #161b22;
    color: #484f58;
    border-right-color: #21262d;
  }

  /* Dark - Added lines */
  :global(.dark) tr.add {
    background: rgba(63, 185, 80, 0.1);
  }

  :global(.dark) tr.add td.line-num {
    background: rgba(63, 185, 80, 0.15);
    color: rgba(255, 255, 255, 0.3);
  }

  :global(.dark) tr.add td.line-prefix {
    color: #3fb950;
    background: rgba(63, 185, 80, 0.1);
  }

  :global(.dark) tr.add td.line-content {
    background: rgba(63, 185, 80, 0.1);
  }

  /* Dark - Removed lines */
  :global(.dark) tr.remove {
    background: rgba(248, 81, 73, 0.1);
  }

  :global(.dark) tr.remove td.line-num {
    background: rgba(248, 81, 73, 0.15);
    color: rgba(255, 255, 255, 0.3);
  }

  :global(.dark) tr.remove td.line-prefix {
    color: #f85149;
    background: rgba(248, 81, 73, 0.1);
  }

  :global(.dark) tr.remove td.line-content {
    background: rgba(248, 81, 73, 0.1);
  }

  /* Dark - Context lines */
  :global(.dark) tr.context {
    background: #0d1117;
  }

  :global(.dark) tr.context td.line-prefix {
    background: #0d1117;
  }

  :global(.dark) tr.context td.line-content {
    color: #c9d1d9;
  }

  /* Dark - Word-level highlighting */
  :global(.dark) .word-add {
    background: rgba(63, 185, 80, 0.3);
  }

  :global(.dark) .word-remove {
    background: rgba(248, 81, 73, 0.3);
  }

  :global(.dark) .no-changes {
    color: #484f58;
  }
</style>
