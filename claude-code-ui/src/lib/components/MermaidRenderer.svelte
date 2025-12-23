<script lang="ts">
  import MermaidDiagram from './MermaidDiagram.svelte';
  import JsonTreeViewer from './JsonTreeViewer.svelte';
  
  interface Props {
    content: string;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
  }

  let { content, renderMarkdown, jsonBlocksMap = new Map() }: Props = $props();

  interface ContentBlock {
    type: 'markdown' | 'mermaid';
    content: string;
  }

  interface ParsedContent {
    type: 'html' | 'json';
    content: string;
    jsonId?: string;
    jsonData?: any;
  }

  function parseContentBlocks(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    if (!content) return blocks;
    const parts = content.split(/```mermaid\n([\s\S]*?)\n```/g);
    
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        if (parts[i].trim()) {
          blocks.push({ type: 'markdown', content: parts[i] });
        }
      } else {
        blocks.push({ type: 'mermaid', content: parts[i] });
      }
    }
    
    return blocks;
  }

  function parseHtmlForJsonPlaceholders(html: string): ParsedContent[] {
    const parts: ParsedContent[] = [];
    const regex = /<div class="json-block-placeholder" data-json-id="([^"]+)"><\/div>/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(html)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'html', content: html.slice(lastIndex, match.index) });
      }
      const jsonId = match[1];
      const jsonData = jsonBlocksMap.get(jsonId);
      if (jsonData !== undefined) {
        parts.push({ type: 'json', content: '', jsonId, jsonData });
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
    {@const parsedParts = parseHtmlForJsonPlaceholders(renderedHtml)}
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
        {/if}
      {/each}
    </div>
  {:else if block.type === 'mermaid'}
    <MermaidDiagram code={block.content} />
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
</style>
