<script lang="ts">
  import type { ChatMessage } from "../stores";
  import type { ContentBlock, TextBlock, ToolUseBlock } from "../claude";

  interface Props {
    toolUseId: string;
    description: string;
    subagentType: string;
    messages: ChatMessage[];
    isActive: boolean;
    elapsedTime?: number;
    renderMarkdown: (content: string) => string;
    onMessageClick: (e: MouseEvent) => void;
  }

  let { toolUseId, description, subagentType, messages, isActive, elapsedTime, renderMarkdown, onMessageClick }: Props = $props();

  let expanded = $state(true);

  function formatContent(content: ContentBlock[] | string): string {
    if (typeof content === "string") return content;
    return content
      .map((block) => {
        if (block.type === "text") return (block as TextBlock).text;
        if (block.type === "tool_use") return `[Using ${(block as ToolUseBlock).name}]`;
        return "";
      })
      .join("\n");
  }

  function getToolCalls(content: ContentBlock[] | string): ToolUseBlock[] {
    if (typeof content === "string") return [];
    return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
  }
</script>

<div class="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden">
  <button
    onclick={() => expanded = !expanded}
    class="w-full px-3 py-2 bg-indigo-100/50 border-b border-indigo-200 flex items-center gap-2 hover:bg-indigo-100 transition-colors"
  >
    <div class="p-1 bg-white border border-indigo-200 rounded shadow-sm">
      <svg class="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
      </svg>
    </div>
    <span class="text-xs font-medium text-indigo-700 font-mono tracking-tight">
      Subagent: {subagentType}
    </span>
    {#if isActive}
      <span class="flex items-center gap-1 text-[10px] text-indigo-500">
        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
        Working{elapsedTime ? ` (${elapsedTime}s)` : "..."}
      </span>
    {:else}
      <span class="text-[10px] text-indigo-400">
        {messages.length} message{messages.length !== 1 ? "s" : ""}
      </span>
    {/if}
    <div class="flex-1"></div>
    <svg class={`w-4 h-4 text-indigo-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
    </svg>
  </button>

  {#if expanded}
    <div class="p-3 space-y-3 max-h-96 overflow-y-auto">
      <div class="text-xs text-indigo-600 bg-indigo-100/50 px-2 py-1 rounded">
        {description}
      </div>

      {#each messages as msg (msg.id)}
        {#if msg.role === "assistant"}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="text-sm leading-relaxed text-gray-700 markdown-body pl-2 border-l-2 border-indigo-200" onclick={onMessageClick}>
            {@html renderMarkdown(formatContent(msg.content))}
          </div>

          {#each getToolCalls(msg.content) as tool}
            <div class="ml-2 rounded border border-gray-200 bg-white overflow-hidden">
              <div class="px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center gap-1.5">
                <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <span class="text-[10px] font-medium text-gray-500 font-mono">{tool.name}</span>
              </div>
              <div class="px-2 py-1.5 font-mono text-[10px] text-gray-500 overflow-x-auto max-h-20">
                {JSON.stringify(tool.input, null, 2)}
              </div>
            </div>
          {/each}
        {/if}
      {/each}

      {#if isActive && messages.length === 0}
        <div class="flex items-center gap-1.5 text-xs text-indigo-400">
          <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
          <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
          <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
        </div>
      {/if}
    </div>
  {/if}
</div>
