<script lang="ts">
  import type { ContentBlock, ToolUseBlock, TextBlock, ThinkingBlock } from "../claude";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import WorkingIndicator from "./WorkingIndicator.svelte";
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
    <WorkingIndicator variant="spin" size="md" color="gray" />
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
          <div class="rounded-xl border border-purple-200 bg-purple-50/30 shadow-sm p-4 transition-all duration-200">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <span class="text-sm">💭</span>
              </div>
              <span class="text-sm font-medium text-purple-800">Thinking</span>
              <WorkingIndicator variant="pulse" size="sm" color="purple" />
            </div>
            <pre class="text-xs text-purple-700 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto streaming-text pl-10">{streamingContent || (block as ThinkingBlock).thinking || ""}</pre>
          </div>
        {:else if block.type === "tool_use"}
          {@const tool = block as ToolUseBlock}
          {@const toolIcons: Record<string, string> = { Read: "📄", Write: "✏️", Edit: "🔧", MultiEdit: "🔧", Bash: "⚡", Glob: "🔍", Grep: "🔎", WebFetch: "🌐", WebSearch: "🔍" }}
          <div class="rounded-xl border border-gray-200 bg-white shadow-sm p-4 transition-all duration-200">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span class="text-sm">{toolIcons[tool.name] || "⚙️"}</span>
              </div>
              <span class="text-sm font-medium text-gray-900">{tool.name}</span>
              <WorkingIndicator variant="dots" size="xs" color="gray" />
            </div>
          </div>
        {/if}
      </div>
    {/each}
    
    {#if blocks.length === 0}
      <div class="h-8 flex items-center">
        <WorkingIndicator variant="dots" size="xs" color="gray" label="Thinking..." />
      </div>
    {/if}
  </div>
</div>
