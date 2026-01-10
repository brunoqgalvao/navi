<script lang="ts">
  import MermaidDiagram from './MermaidDiagram.svelte';
  import JsonTreeViewer from './JsonTreeViewer.svelte';
  import InteractiveCodeBlock from './InteractiveCodeBlock.svelte';
  import StockChart from './widgets/StockChart.svelte';

  interface Props {
    content: string;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
    shellBlocksMap?: Map<string, { code: string; language: string }>;
    stockBlocksMap?: Map<string, string>;
    onRunInTerminal?: (command: string) => void;
  }

  let { content, renderMarkdown, jsonBlocksMap = new Map(), shellBlocksMap = new Map(), stockBlocksMap = new Map(), onRunInTerminal }: Props = $props();

  interface ContentBlock {
    type: 'markdown' | 'mermaid' | 'stocks';
    content: string;
  }

  interface ParsedContent {
    type: 'html' | 'json' | 'shell' | 'stock';
    content: string;
    jsonId?: string;
    jsonData?: any;
    shellId?: string;
    shellData?: { code: string; language: string };
    stockId?: string;
    stockData?: string;
  }

  function parseContentBlocks(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    if (!content) return blocks;

    // Match both mermaid and stocks code blocks
    const regex = /```(mermaid|stocks)\n([\s\S]*?)\n```/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Add any markdown content before this block
      if (match.index > lastIndex) {
        const mdContent = content.slice(lastIndex, match.index).trim();
        if (mdContent) {
          blocks.push({ type: 'markdown', content: mdContent });
        }
      }

      // Add the special block
      const blockType = match[1] as 'mermaid' | 'stocks';
      blocks.push({ type: blockType, content: match[2] });

      lastIndex = match.index + match[0].length;
    }

    // Add any remaining markdown content
    if (lastIndex < content.length) {
      const remaining = content.slice(lastIndex).trim();
      if (remaining) {
        blocks.push({ type: 'markdown', content: remaining });
      }
    }

    return blocks;
  }

  function parseHtmlForPlaceholders(html: string): ParsedContent[] {
    const parts: ParsedContent[] = [];
    // Combined regex for both JSON and shell placeholders
    const regex = /<div class="(json|shell)-block-placeholder" data-(json|shell)-id="([^"]+)"><\/div>/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(html)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'html', content: html.slice(lastIndex, match.index) });
      }
      const blockType = match[1]; // 'json' or 'shell'
      const blockId = match[3];

      if (blockType === 'json') {
        const jsonData = jsonBlocksMap.get(blockId);
        if (jsonData !== undefined) {
          parts.push({ type: 'json', content: '', jsonId: blockId, jsonData });
        }
      } else if (blockType === 'shell') {
        const shellData = shellBlocksMap.get(blockId);
        if (shellData !== undefined) {
          parts.push({ type: 'shell', content: '', shellId: blockId, shellData });
        }
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < html.length) {
      parts.push({ type: 'html', content: html.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'html', content: html }];
  }

  const contentBlocks = $derived(parseContentBlocks(content));
</script>

{#each contentBlocks as block}
  {#if block.type === 'markdown'}
    {@const renderedHtml = renderMarkdown(block.content)}
    {@const parsedParts = parseHtmlForPlaceholders(renderedHtml)}
    <div class="markdown-content">
      {#each parsedParts as part}
        {#if part.type === 'html'}
          {@html part.content}
        {:else if part.type === 'json' && part.jsonData}
          <div class="json-tree-block">
            <div class="json-tree-header">
              <span class="json-label">JSON</span>
            </div>
            <JsonTreeViewer value={part.jsonData} maxHeight="400px" showButtons={true} />
          </div>
        {:else if part.type === 'shell' && part.shellData}
          <InteractiveCodeBlock
            code={part.shellData.code}
            language={part.shellData.language}
            on:runInDock={(e) => onRunInTerminal?.(e.detail.code)}
          />
        {/if}
      {/each}
    </div>
  {:else if block.type === 'mermaid'}
    <MermaidDiagram code={block.content} />
  {:else if block.type === 'stocks'}
    <div class="stock-chart-block">
      <StockChart content={block.content} />
    </div>
  {/if}
{/each}

<style>
  .markdown-content {
    margin: 0;
  }
  
  .markdown-content + :global(.mermaid-diagram) {
    margin-top: 1rem;
  }
  
  :global(.mermaid-diagram) + .markdown-content {
    margin-top: 1rem;
  }

  .json-tree-block {
    margin: 1rem 0;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }

  .json-tree-header {
    background: #f9fafb;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .json-label {
    color: #6b7280;
    font-size: 0.7rem;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .stock-chart-block {
    margin: 1rem 0;
  }

  .markdown-content + .stock-chart-block,
  .stock-chart-block + .markdown-content {
    margin-top: 1rem;
  }
</style>
