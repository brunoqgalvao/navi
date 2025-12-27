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
          <span class="stat added">+{diffResult.stats.added}</span>
          <span class="stat removed">-{diffResult.stats.removed}</span>
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
              <td class="line-prefix">
                {#if line.type === 'add'}+{:else if line.type === 'remove'}-{:else}&nbsp;{/if}
              </td>
              <td class="line-content">
                {#if line.wordDiff}
                  {#each line.wordDiff as segment}
                    {#if segment.type === 'equal'}
                      <span>{segment.value}</span>
                    {:else if segment.type === 'add'}
                      <span class="word-add">{segment.value}</span>
                    {:else if segment.type === 'remove'}
                      <span class="word-remove">{segment.value}</span>
                    {/if}
                  {/each}
                {:else}
                  <span>{line.content}</span>
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
    line-height: 1.5;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .diff-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .file-name {
    font-size: 11px;
    color: #6b7280;
    font-weight: 500;
  }

  .stats {
    display: flex;
    gap: 8px;
  }

  .stat {
    font-size: 11px;
    font-weight: 600;
  }

  .stat.added {
    color: #16a34a;
  }

  .stat.removed {
    color: #dc2626;
  }

  .diff-content {
    max-height: var(--max-height, 300px);
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  tr.line {
    border: none;
  }

  /* Line number columns */
  td.line-num {
    width: 40px;
    min-width: 40px;
    padding: 0 8px;
    text-align: right;
    color: #9ca3af;
    background: #f9fafb;
    user-select: none;
    font-size: 11px;
    vertical-align: top;
  }

  td.line-num.old {
    border-right: 1px solid #e5e7eb;
  }

  td.line-num.new {
    border-right: 1px solid #e5e7eb;
  }

  /* Prefix column (+/-) */
  td.line-prefix {
    width: 20px;
    min-width: 20px;
    padding: 0 4px;
    text-align: center;
    user-select: none;
    font-weight: 600;
  }

  /* Content column */
  td.line-content {
    padding: 0 12px 0 4px;
    white-space: pre;
    overflow-x: auto;
  }

  /* Added lines */
  tr.add {
    background: #ecfdf5;
  }

  tr.add td.line-num {
    background: #dcfce7;
    color: #166534;
  }

  tr.add td.line-prefix {
    color: #16a34a;
  }

  tr.add td.line-content {
    background: #dcfce7;
  }

  /* Removed lines */
  tr.remove {
    background: #fef2f2;
  }

  tr.remove td.line-num {
    background: #fee2e2;
    color: #991b1b;
  }

  tr.remove td.line-prefix {
    color: #dc2626;
  }

  tr.remove td.line-content {
    background: #fee2e2;
  }

  /* Context lines */
  tr.context {
    background: #ffffff;
  }

  /* Word-level highlighting */
  .word-add {
    background: #86efac;
    border-radius: 2px;
    padding: 0 1px;
  }

  .word-remove {
    background: #fca5a5;
    border-radius: 2px;
    padding: 0 1px;
    text-decoration: line-through;
  }

  .no-changes {
    padding: 12px;
    text-align: center;
    color: #9ca3af;
    font-size: 12px;
    font-style: italic;
  }
</style>
