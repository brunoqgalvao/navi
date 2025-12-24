<script lang="ts">
  import type { ContentBlock, ToolUseBlock, TextBlock, ThinkingBlock } from "../claude";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import { fade } from "svelte/transition";

  interface Props {
    blocks: ContentBlock[];
    partialText: string;
    partialThinking: string;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
  }

  let { blocks, partialText, partialThinking, renderMarkdown, jsonBlocksMap = new Map() }: Props = $props();

  function getDisplayBlocks(): { block: ContentBlock; isStreaming: boolean; streamingContent?: string }[] {
    return blocks.map((block, idx) => {
      const isLast = idx === blocks.length - 1;
      if (isLast) {
        if (block.type === "text") {
          return { block, isStreaming: true, streamingContent: partialText || (block as TextBlock).text };
        }
        if (block.type === "thinking") {
          return { block, isStreaming: true, streamingContent: partialThinking || (block as ThinkingBlock).thinking };
        }
        if (block.type === "tool_use") {
          return { block, isStreaming: true };
        }
      }
      return { block, isStreaming: false };
    });
  }
</script>

<style>
  .streaming-text {
    transition: opacity 0.15s ease-out;
  }
  
  .cursor {
    animation: blink 1s ease-in-out infinite;
  }
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  
  .fade-in {
    animation: fadeIn 0.2s ease-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>

<div class="flex gap-4 w-full pr-4 md:pr-0" in:fade={{ duration: 150 }}>
  <div class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm">
    <div class="w-3 h-3 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"></div>
  </div>

  <div class="flex-1 min-w-0 space-y-3">
    {#each getDisplayBlocks() as { block, isStreaming, streamingContent }, idx (idx)}
      <div class="fade-in">
        {#if block.type === "text"}
          <div class="text-[15px] leading-7 text-gray-800 markdown-body streaming-text">
            <MermaidRenderer content={streamingContent || (block as TextBlock).text || ""} {renderMarkdown} {jsonBlocksMap} />
            {#if isStreaming}
              <span class="cursor inline-block w-0.5 h-5 bg-blue-500 ml-0.5 align-middle"></span>
            {/if}
          </div>
        {:else if block.type === "thinking"}
          <div class="rounded-lg border-l-2 border-l-purple-400 bg-purple-50/50 p-3 transition-all duration-200">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm">💭</span>
              <span class="text-xs text-purple-600 font-medium">Thinking...</span>
              <span class="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
            </div>
            <pre class="text-xs text-purple-700 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto streaming-text">{streamingContent || (block as ThinkingBlock).thinking || ""}</pre>
          </div>
        {:else if block.type === "tool_use"}
          {@const tool = block as ToolUseBlock}
          <div class="rounded-lg border-l-2 border-l-orange-400 bg-orange-50/30 p-3 transition-all duration-200">
            <div class="flex items-center gap-2">
              <span class="text-sm">🔧</span>
              <span class="text-sm text-gray-700 font-medium">{tool.name}</span>
              <div class="flex gap-0.5">
                <span class="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                <span class="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
    
    {#if blocks.length === 0}
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <div class="flex gap-0.5">
          <span class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
        </div>
        <span>Thinking...</span>
      </div>
    {/if}
  </div>
</div>
