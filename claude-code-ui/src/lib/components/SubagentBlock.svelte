<script lang="ts">
  import MermaidRenderer from "./MermaidRenderer.svelte";
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
  let showFullModal = $state(false);

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

  function openModal(e: MouseEvent) {
    e.stopPropagation();
    showFullModal = true;
  }

  function closeModal() {
    showFullModal = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden">
  <div class="w-full px-3 py-2 bg-indigo-100/50 border-b border-indigo-200 flex items-center gap-2">
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
    <button
      onclick={openModal}
      class="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-200/50 rounded transition-colors"
      title="View full process"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
      </svg>
    </button>
    <button
      onclick={() => expanded = !expanded}
      class="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-200/50 rounded transition-colors"
      title={expanded ? "Collapse" : "Expand"}
    >
      <svg class={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </button>
  </div>

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
            <MermaidRenderer content={formatContent(msg.content)} {renderMarkdown} />
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

{#if showFullModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
    onclick={closeModal}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="px-5 py-4 border-b border-gray-200 flex items-center gap-3 bg-indigo-50/50 shrink-0">
        <div class="p-2 bg-white border border-indigo-200 rounded-lg shadow-sm">
          <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-900">Subagent: {subagentType}</h3>
          <p class="text-xs text-gray-500 truncate">{description}</p>
        </div>
        {#if isActive}
          <span class="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-full">
            <span class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
            Working{elapsedTime ? ` (${elapsedTime}s)` : ""}
          </span>
        {:else}
          <span class="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
        {/if}
        <button
          onclick={closeModal}
          class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-4">
        {#if messages.length === 0}
          <div class="flex flex-col items-center justify-center py-12 text-gray-400">
            {#if isActive}
              <div class="flex items-center gap-2 mb-3">
                <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
              </div>
              <p class="text-sm">Subagent is working...</p>
            {:else}
              <svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
              </svg>
              <p class="text-sm">No messages from subagent</p>
            {/if}
          </div>
        {:else}
          {#each messages as msg, idx (msg.id)}
            <div class="space-y-3">
              {#if msg.role === "assistant"}
                <div class="flex gap-3">
                  <div class="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs">
                    S
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="flex-1 min-w-0 space-y-3" onclick={onMessageClick}>
                    <div class="text-[15px] leading-7 text-gray-800 markdown-body">
                      <MermaidRenderer content={formatContent(msg.content)} {renderMarkdown} />
                    </div>

                    {#each getToolCalls(msg.content) as tool}
                      <div class="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
                        <div class="px-3 py-2 bg-gray-100/50 border-b border-gray-200 flex items-center gap-2">
                          <div class="p-1 bg-white border border-gray-200 rounded shadow-sm">
                            <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                          </div>
                          <span class="text-xs font-medium text-gray-600 font-mono tracking-tight">{tool.name}</span>
                        </div>
                        <div class="px-3 py-2 bg-gray-50 font-mono text-xs text-gray-600 overflow-x-auto max-h-48">
                          <pre class="whitespace-pre-wrap">{JSON.stringify(tool.input, null, 2)}</pre>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
            {#if idx < messages.length - 1}
              <hr class="border-gray-100" />
            {/if}
          {/each}

          {#if isActive}
            <div class="flex gap-3 pt-2">
              <div class="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex-shrink-0 flex items-center justify-center">
                <div class="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
              </div>
              <div class="flex items-center gap-1.5 pt-2">
                <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <div class="px-5 py-3 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500 shrink-0">
        <span>Tool Use ID: <code class="font-mono text-gray-600 bg-gray-200/50 px-1.5 py-0.5 rounded">{toolUseId}</code></span>
        <button
          onclick={closeModal}
          class="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
