<script lang="ts">
  interface ParsedReference {
    content: string;
    source: {
      type: "code" | "csv" | "xlsx" | "json" | "markdown" | "text" | "url" | "terminal";
      filename?: string;
      path?: string;
      startLine?: number;
      endLine?: number;
      jsonPath?: string;
      sheet?: string;
      rows?: string;
      columns?: string;
      url?: string;
    };
  }

  interface Props {
    content: string;
    basePath?: string;
    onPreview?: (path: string) => void;
  }

  let { content, basePath = "", onPreview }: Props = $props();

  let expandedRef = $state<ParsedReference | null>(null);

  /**
   * Parse blockquote references from message content
   * Format: > content\n> *Source: `filename` (lines X-Y)*
   */
  function parseReferences(text: string): { references: ParsedReference[]; remainingText: string } {
    const references: ParsedReference[] = [];
    const lines = text.split("\n");
    let remainingLines: string[] = [];
    let currentQuote: string[] = [];
    let inQuote = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("> ") || line === ">") {
        inQuote = true;
        currentQuote.push(line.slice(2) || line.slice(1)); // Remove "> " or ">"
      } else if (inQuote && line.trim() === "") {
        // End of quote block
        if (currentQuote.length > 0) {
          const ref = parseQuoteBlock(currentQuote);
          if (ref) {
            references.push(ref);
          }
          currentQuote = [];
        }
        inQuote = false;
      } else {
        if (inQuote && currentQuote.length > 0) {
          // End of quote without empty line
          const ref = parseQuoteBlock(currentQuote);
          if (ref) {
            references.push(ref);
          }
          currentQuote = [];
          inQuote = false;
        }
        remainingLines.push(line);
      }
    }

    // Handle trailing quote
    if (currentQuote.length > 0) {
      const ref = parseQuoteBlock(currentQuote);
      if (ref) {
        references.push(ref);
      }
    }

    return {
      references,
      remainingText: remainingLines.join("\n").trim()
    };
  }

  function parseQuoteBlock(lines: string[]): ParsedReference | null {
    // Look for the source annotation line (last line starting with *)
    const sourceLineIdx = lines.findIndex(l => l.startsWith("*Source:") || l.startsWith("*source:"));
    if (sourceLineIdx === -1) return null;

    const sourceLine = lines[sourceLineIdx];
    const contentLines = lines.slice(0, sourceLineIdx);
    const content = contentLines.join("\n").trim();

    // Parse source annotation: *Source: `filename` (lines X-Y)*
    const source = parseSourceAnnotation(sourceLine);
    if (!source) return null;

    return { content, source };
  }

  function parseSourceAnnotation(line: string): ParsedReference["source"] | null {
    // Remove leading/trailing * and "Source: "
    let text = line.replace(/^\*Source:\s*/i, "").replace(/\*$/, "").trim();

    // Check for URL source
    if (text.startsWith("http://") || text.startsWith("https://")) {
      return { type: "url", url: text };
    }

    // Parse filename from backticks
    const filenameMatch = text.match(/`([^`]+)`/);
    const filename = filenameMatch ? filenameMatch[1] : undefined;

    // Parse line numbers
    const lineMatch = text.match(/\(lines?\s*(\d+)(?:-(\d+))?\)/);
    const startLine = lineMatch ? parseInt(lineMatch[1]) : undefined;
    const endLine = lineMatch && lineMatch[2] ? parseInt(lineMatch[2]) : undefined;

    // Parse JSON path
    const jsonPathMatch = text.match(/at\s+(\$[.\[\]\w]+)/);
    const jsonPath = jsonPathMatch ? jsonPathMatch[1] : undefined;

    // Parse sheet/row/column for spreadsheets
    const sheetMatch = text.match(/\[([^\]]+)\]/);
    const sheet = sheetMatch ? sheetMatch[1] : undefined;
    const rowMatch = text.match(/Row\s+(\d+)/);
    const rows = rowMatch ? rowMatch[1] : undefined;
    const colMatch = text.match(/Column:\s+([^\s]+)/);
    const columns = colMatch ? colMatch[1] : undefined;

    // Determine type based on extension
    let type: ParsedReference["source"]["type"] = "text";
    if (filename) {
      const ext = filename.split(".").pop()?.toLowerCase();
      if (ext === "json") type = "json";
      else if (ext === "csv") type = "csv";
      else if (ext === "xlsx" || ext === "xls") type = "xlsx";
      else if (ext === "md" || ext === "mdx") type = "markdown";
      else if (["js", "ts", "jsx", "tsx", "py", "rs", "go", "java", "c", "cpp", "h", "svelte", "vue"].includes(ext || "")) type = "code";
    }

    return {
      type,
      filename,
      startLine,
      endLine,
      jsonPath,
      sheet,
      rows,
      columns,
    };
  }

  function getTypeIcon(type: ParsedReference["source"]["type"]) {
    switch (type) {
      case "code": return "code";
      case "json": return "braces";
      case "csv":
      case "xlsx": return "table";
      case "markdown": return "file-text";
      case "url": return "link";
      case "terminal": return "terminal";
      default: return "quote";
    }
  }

  function getTypeColor(type: ParsedReference["source"]["type"]) {
    switch (type) {
      case "code": return "text-purple-500 bg-purple-50 border-purple-200";
      case "json": return "text-amber-500 bg-amber-50 border-amber-200";
      case "csv":
      case "xlsx": return "text-green-500 bg-green-50 border-green-200";
      case "url": return "text-blue-500 bg-blue-50 border-blue-200";
      case "terminal": return "text-emerald-500 bg-emerald-50 border-emerald-200";
      default: return "text-indigo-500 bg-indigo-50 border-indigo-200";
    }
  }

  function handlePreview(ref: ParsedReference) {
    if (ref.source.url) {
      window.open(ref.source.url, "_blank");
    } else if (ref.source.filename && onPreview) {
      const fullPath = basePath ? `${basePath}/${ref.source.filename}` : ref.source.filename;
      onPreview(fullPath);
    }
  }

  function truncateContent(text: string, maxLength: number = 120): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + "...";
  }

  function formatLineRef(source: ParsedReference["source"]): string {
    if (source.startLine && source.endLine && source.startLine !== source.endLine) {
      return `L${source.startLine}-${source.endLine}`;
    } else if (source.startLine) {
      return `L${source.startLine}`;
    }
    return "";
  }

  const parsed = $derived(parseReferences(content));
</script>

{#if parsed.references.length > 0}
  <div class="flex flex-wrap gap-1 mb-2">
    {#each parsed.references as ref, idx}
      {@const colors = getTypeColor(ref.source.type)}
      <button
        onclick={() => expandedRef = expandedRef === ref ? null : ref}
        class="inline-flex items-center gap-1 px-1.5 py-0.5 {colors} border rounded text-[11px] transition-all hover:shadow-sm"
        title={ref.content.slice(0, 100) + (ref.content.length > 100 ? '...' : '')}
      >
        <!-- filename:lines only -->
        {#if ref.source.filename}
          <span class="font-medium">
            {ref.source.filename}{#if formatLineRef(ref.source)}:{formatLineRef(ref.source)}{/if}
          </span>
        {:else if ref.source.url}
          <span class="font-medium truncate max-w-[140px]">
            {(() => {
              try {
                return new URL(ref.source.url).hostname;
              } catch {
                return ref.source.url.slice(0, 20);
              }
            })()}
          </span>
        {:else}
          <span class="font-medium">Reference</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Expanded reference detail -->
  {#if expandedRef}
    {@const colors = getTypeColor(expandedRef.source.type)}
    <div class="mb-2 {colors} border rounded-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
      <div class="flex items-center justify-between px-3 py-2 border-b border-current/10">
        <div class="flex items-center gap-2">
          {#if expandedRef.source.filename}
            <span class="text-xs font-semibold">{expandedRef.source.filename}</span>
            {#if expandedRef.source.startLine}
              <span class="text-[10px] px-1.5 py-0.5 bg-black/5 rounded">
                {formatLineRef(expandedRef.source)}
              </span>
            {/if}
            {#if expandedRef.source.jsonPath}
              <span class="text-[10px] px-1.5 py-0.5 bg-black/5 rounded font-mono">
                {expandedRef.source.jsonPath}
              </span>
            {/if}
            {#if expandedRef.source.sheet}
              <span class="text-[10px] px-1.5 py-0.5 bg-black/5 rounded">
                Sheet: {expandedRef.source.sheet}
              </span>
            {/if}
          {:else if expandedRef.source.url}
            <span class="text-xs font-semibold truncate">{expandedRef.source.url}</span>
          {/if}
        </div>
        <div class="flex items-center gap-1">
          {#if expandedRef.source.filename || expandedRef.source.url}
            <button
              onclick={() => handlePreview(expandedRef!)}
              class="p-1 rounded hover:bg-black/10 transition-colors"
              title={expandedRef.source.url ? "Open URL" : "Preview file"}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </button>
          {/if}
          <button
            onclick={() => expandedRef = null}
            class="p-1 rounded hover:bg-black/10 transition-colors"
            title="Collapse"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="px-3 py-2 max-h-48 overflow-y-auto">
        <pre class="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">{expandedRef.content}</pre>
      </div>
    </div>
  {/if}
{/if}

{#if parsed.remainingText}
  <div class="break-words whitespace-pre-wrap">{parsed.remainingText}</div>
{/if}
