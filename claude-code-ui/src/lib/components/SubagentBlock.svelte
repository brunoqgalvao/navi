<script lang="ts">
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import WorkingIndicator from "./WorkingIndicator.svelte";
  import type { ChatMessage } from "../stores";
  import type { ContentBlock, TextBlock, ToolUseBlock } from "../claude";

  interface Props {
    toolUseId: string;
    description: string;
    subagentType: string;
    updates: ChatMessage[];
    isActive: boolean;
    elapsedTime?: number;
    renderMarkdown: (content: string) => string;
    onMessageClick?: (e: MouseEvent) => void;
  }

  let { toolUseId, description, subagentType, updates, isActive, elapsedTime, renderMarkdown, onMessageClick }: Props = $props();

  let expanded = $state(true);
  let showFullModal = $state(false);

  function formatContent(msg: ChatMessage): string {
    if (msg.role !== "assistant") return "";
    const content = msg.content as ContentBlock[];
    return content
      .filter((b): b is TextBlock => b.type === "text")
      .map(b => b.text)
      .filter(Boolean)
      .join("\n");
  }

  function getToolCalls(msg: ChatMessage): ToolUseBlock[] {
    if (msg.role !== "assistant") return [];
    const content = msg.content as ContentBlock[];
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
      <WorkingIndicator variant="pulse" size="xs" color="indigo" label="Working{elapsedTime ? ` (${elapsedTime}s)` : '...'}" class="text-[10px]" />
    {:else}
      <span class="text-[10px] text-indigo-400">
        {updates.length} update{updates.length !== 1 ? "s" : ""}
      </span>
    {/if}
    <div class="flex-1"></div>
    <button 
      onclick={() => expanded = !expanded}
      class="text-indigo-400 hover:text-indigo-600 transition-colors"
    >
      <svg 
        class="w-4 h-4 transition-transform {expanded ? 'rotate-90' : ''}" 
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  {#if expanded}
    <div class="px-3 py-2 max-h-48 overflow-y-auto space-y-2">
      <div class="text-xs text-indigo-600 italic mb-2">
        {description}
      </div>
      
      {#each updates as update (update.id)}
        {#if update.role === "assistant"}
          {@const textContent = formatContent(update)}
          {@const tools = getToolCalls(update)}
          
          {#if textContent}
            <div class="text-sm leading-relaxed text-gray-700 markdown-body pl-2 border-l-2 border-indigo-200" onclick={onMessageClick}>
              <MermaidRenderer content={textContent} {renderMarkdown} />
            </div>
          {/if}

          {#each tools as tool}
            <div class="text-xs text-gray-500 pl-2 border-l-2 border-orange-200 py-1">
              <span class="font-medium text-orange-600">{tool.name}</span>
            </div>
          {/each}
        {/if}
      {/each}

      {#if isActive}
        <WorkingIndicator variant="spin" size="md" color="indigo" label="Processing..." class="py-2" />
      {/if}
    </div>
  {/if}
</div>
