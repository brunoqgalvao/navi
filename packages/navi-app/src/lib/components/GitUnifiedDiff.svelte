<script lang="ts">
  /**
   * GitUnifiedDiff - Parses and renders raw unified diff output (from git diff/git show)
   */

  interface Props {
    diff: string;
    maxHeight?: string;
  }

  let { diff, maxHeight = '100%' }: Props = $props();

  interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'hunk' | 'header';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }

  interface DiffFile {
    fileName: string;
    lines: DiffLine[];
    stats: { added: number; removed: number };
  }

  const parsedDiff = $derived.by(() => {
    if (!diff) return [];

    const files: DiffFile[] = [];
    let currentFile: DiffFile | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    const lines = diff.split('\n');

    for (const line of lines) {
      // New file header: diff --git a/file b/file
      if (line.startsWith('diff --git')) {
        if (currentFile) files.push(currentFile);
        const match = line.match(/diff --git a\/(.*) b\/(.*)/);
        currentFile = {
          fileName: match ? match[2] : 'unknown',
          lines: [],
          stats: { added: 0, removed: 0 }
        };
        continue;
      }

      if (!currentFile) continue;

      // File metadata headers (skip these visual clutter lines)
      if (line.startsWith('index ') ||
          line.startsWith('---') ||
          line.startsWith('+++') ||
          line.startsWith('new file mode') ||
          line.startsWith('deleted file mode') ||
          line.startsWith('old mode') ||
          line.startsWith('new mode')) {
        continue;
      }

      // Hunk header: @@ -1,5 +1,7 @@
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNum = parseInt(match[1], 10);
          newLineNum = parseInt(match[2], 10);
        }
        currentFile.lines.push({
          type: 'hunk',
          content: line
        });
        continue;
      }

      // Added line
      if (line.startsWith('+')) {
        currentFile.lines.push({
          type: 'add',
          content: line.slice(1),
          newLineNum: newLineNum++
        });
        currentFile.stats.added++;
        continue;
      }

      // Removed line
      if (line.startsWith('-')) {
        currentFile.lines.push({
          type: 'remove',
          content: line.slice(1),
          oldLineNum: oldLineNum++
        });
        currentFile.stats.removed++;
        continue;
      }

      // Context line (starts with space or is just content)
      if (line.startsWith(' ') || line.length > 0) {
        currentFile.lines.push({
          type: 'context',
          content: line.startsWith(' ') ? line.slice(1) : line,
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++
        });
      }
    }

    if (currentFile) files.push(currentFile);
    return files;
  });

  function formatLineNum(num: number | undefined): string {
    return num !== undefined ? String(num) : '';
  }
</script>

<div class="git-diff" style:--max-height={maxHeight}>
  {#each parsedDiff as file}
    <div class="diff-file">
      <div class="file-header">
        <span class="file-name">{file.fileName}</span>
        <div class="stats">
          <span class="stat added">+{file.stats.added}</span>
          <span class="stat removed">-{file.stats.removed}</span>
        </div>
      </div>
      <div class="diff-content">
        <table>
          <tbody>
            {#each file.lines as line}
              {#if line.type === 'hunk'}
                <tr class="line hunk">
                  <td class="line-num old"></td>
                  <td class="line-num new"></td>
                  <td class="hunk-content" colspan="2">{line.content}</td>
                </tr>
              {:else}
                <tr class="line {line.type}">
                  <td class="line-num old">{formatLineNum(line.oldLineNum)}</td>
                  <td class="line-num new">{formatLineNum(line.newLineNum)}</td>
                  <td class="line-prefix">
                    {#if line.type === 'add'}+{:else if line.type === 'remove'}-{:else}&nbsp;{/if}
                  </td>
                  <td class="line-content">{line.content}</td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/each}
</div>

<style>
  .git-diff {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
  }

  .diff-file {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 12px;
    background: #ffffff;
  }

  .diff-file:last-child {
    margin-bottom: 0;
  }

  .file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .file-name {
    font-size: 12px;
    color: #374151;
    font-weight: 500;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
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
    overflow-x: auto;
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
    width: 36px;
    min-width: 36px;
    padding: 0 6px;
    text-align: right;
    color: #9ca3af;
    background: #f9fafb;
    user-select: none;
    font-size: 10px;
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
    width: 16px;
    min-width: 16px;
    padding: 0 2px;
    text-align: center;
    user-select: none;
    font-weight: 600;
  }

  /* Content column */
  td.line-content {
    padding: 0 8px 0 2px;
    white-space: pre;
    overflow-x: auto;
  }

  /* Hunk header */
  tr.hunk {
    background: #f0f9ff;
  }

  td.hunk-content {
    padding: 4px 12px;
    color: #0369a1;
    font-size: 10px;
    font-style: italic;
    border-top: 1px solid #e0f2fe;
    border-bottom: 1px solid #e0f2fe;
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
</style>
