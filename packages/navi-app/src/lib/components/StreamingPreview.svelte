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

  function getToolSummary(tool: ToolUseBlock): string {
    const input = tool.input || {};
    switch (tool.name) {
      case "Read":
        return input.file_path?.split("/").pop() || "";
      case "Write":
        return input.file_path?.split("/").pop() || "";
      case "Edit":
      case "MultiEdit":
        return input.file_path?.split("/").pop() || "";
      case "Bash":
        const cmd = input.command || "";
        return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
      case "Glob":
        return input.pattern || "";
      case "Grep":
        return input.pattern || "";
      case "WebFetch":
        try { return new URL(input.url || "").hostname; } catch { return ""; }
      case "WebSearch":
        return input.query || "";
      case "TodoWrite":
        return `${input.todos?.length || 0} items`;
      default:
        return "";
    }
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

<div class="w-full" in:fade={{ duration: 150 }}>
  <div class="space-y-2">
    {#each getDisplayBlocks() as { block, isStreaming, streamingContent }, idx (idx)}
      <div class="fade-in">
        {#if block.type === "text"}
          <div class="text-sm leading-relaxed text-gray-800 markdown-body streaming-text">
            <MermaidRenderer content={streamingContent || (block as TextBlock).text || ""} {renderMarkdown} {jsonBlocksMap} />
            {#if isStreaming}
              <span class="cursor inline-block w-0.5 h-4 bg-blue-500 ml-0.5 align-middle"></span>
            {/if}
          </div>
        {:else if block.type === "thinking"}
          <div class="rounded-lg border border-purple-200 bg-purple-50/20 overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-1.5">
              <div class="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center flex-shrink-0">
                <svg class="w-3.5 h-3.5 text-purple-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span class="text-xs font-medium text-purple-700">Thinking</span>
              <span class="text-xs text-purple-400 truncate flex-1">
                {(streamingContent || "").slice(0, 60)}{(streamingContent || "").length > 60 ? "..." : ""}
              </span>
            </div>
          </div>
        {:else if block.type === "tool_use"}
          {@const tool = block as ToolUseBlock}
          {@const summary = getToolSummary(tool)}
          <div class="rounded-lg border border-blue-200 bg-blue-50/30 overflow-hidden transition-colors">
            <div class="flex items-center gap-2 px-3 py-2">
              <div class="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg class="w-3.5 h-3.5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <span class="text-xs font-medium text-blue-700">{tool.name}</span>
              {#if summary}
                <span class="text-xs text-blue-400 truncate font-mono flex-1">{summary}</span>
              {/if}
              <span class="text-xs text-blue-500 shrink-0">Running...</span>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    {#if blocks.length === 0}
      <div class="h-6 flex items-center">
        <WorkingIndicator variant="dots" size="xs" color="gray" label="Thinking..." />
      </div>
    {/if}
  </div>
</div>
