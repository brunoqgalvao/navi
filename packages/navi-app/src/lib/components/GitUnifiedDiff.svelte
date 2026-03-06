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
          {#if file.stats.added > 0}
            <span class="stat added">+{file.stats.added}</span>
          {/if}
          {#if file.stats.removed > 0}
            <span class="stat removed">-{file.stats.removed}</span>
          {/if}
        </div>
      </div>
      <div class="diff-content">
        <table>
          <tbody>
            {#each file.lines as line}
              {#if line.type === 'hunk'}
                <tr class="line hunk">
                  <td class="line-num gutter" colspan="2"></td>
                  <td class="hunk-content" colspan="2">{line.content}</td>
                </tr>
              {:else}
                <tr class="line {line.type}">
                  <td class="line-num old">{formatLineNum(line.oldLineNum)}</td>
                  <td class="line-num new">{formatLineNum(line.newLineNum)}</td>
                  <td class="line-prefix">{#if line.type === 'add'}+{:else if line.type === 'remove'}-{:else}&nbsp;{/if}</td>
                  <td class="line-content"><code>{line.content}</code></td>
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
    font-size: 12px;
    line-height: 1.6;
  }

  .diff-file {
    border: 1px solid #d1d5db;
    border-radius: 8px;
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
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
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
    overflow-x: auto;
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

  td.line-num.gutter {
    width: 88px;
    min-width: 88px;
    max-width: 88px;
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

  /* Hunk header */
  tr.hunk {
    background: #ddf4ff;
  }

  td.hunk-content {
    padding: 6px 12px;
    color: #0550ae;
    font-size: 11px;
    white-space: pre;
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

  /* ── Dark mode ── */
  :global(.dark) .diff-file {
    border-color: #30363d;
    background: #0d1117;
  }

  :global(.dark) .file-header {
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

  :global(.dark) tr.hunk {
    background: rgba(56, 139, 253, 0.1);
  }

  :global(.dark) td.hunk-content {
    color: #79c0ff;
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
</style>
