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
    onOpenModal?: () => void;
  }

  let { toolUseId, description, subagentType, updates, isActive, elapsedTime, renderMarkdown, onMessageClick, onOpenModal }: Props = $props();

  let expanded = $state(false);

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

  // Get tool summary for compact display
  function getToolSummary(tool: ToolUseBlock): string {
    const input = tool.input || {};
    switch (tool.name) {
      case "Read":
        return input.file_path?.split("/").pop() || "";
      case "Write":
      case "Edit":
        return input.file_path?.split("/").pop() || "";
      case "Bash":
        const cmd = input.command || "";
        return cmd.length > 30 ? cmd.slice(0, 30) + "..." : cmd;
      case "Glob":
      case "Grep":
        return input.pattern || "";
      default:
        return "";
    }
  }

  // Get latest activity for collapsed view
  const latestActivity = $derived.by(() => {
    for (let i = updates.length - 1; i >= 0; i--) {
      const update = updates[i];
      if (update.role === "assistant") {
        const tools = getToolCalls(update);
        if (tools.length > 0) {
          return { type: 'tool', tool: tools[tools.length - 1] };
        }
        const text = formatContent(update);
        if (text) {
          return { type: 'text', text: text.slice(0, 80) + (text.length > 80 ? '...' : '') };
        }
      }
    }
    return null;
  });

  // Count tool calls
  const toolCount = $derived(
    updates.reduce((count, update) => {
      if (update.role === "assistant") {
        return count + getToolCalls(update).length;
      }
      return count;
    }, 0)
  );

  const toolIcons: Record<string, string> = {
    Read: "📄",
    Write: "✏️",
    Edit: "🔧",
    Bash: "⚡",
    Glob: "🔍",
    Grep: "🔎",
    WebFetch: "🌐",
    WebSearch: "🔍",
  };
</script>

<div class="rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
  <!-- Header - always visible, double-click opens modal -->
  <button
    onclick={() => expanded = !expanded}
    ondblclick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenModal?.(); }}
    class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-50/50 transition-colors"
    title="Click to expand, double-click for full view"
  >
    <!-- Icon -->
    <div class="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
      <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
      </svg>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-900">Subagent</span>
        <span class="text-xs text-indigo-500 font-mono">{subagentType}</span>
      </div>
      {#if !expanded && latestActivity}
        <div class="text-xs text-gray-500 truncate mt-0.5">
          {#if latestActivity.type === 'tool'}
            <span class="text-orange-600">{latestActivity.tool.name}</span>
            <span class="text-gray-400 ml-1">{getToolSummary(latestActivity.tool)}</span>
          {:else}
            {latestActivity.text}
          {/if}
        </div>
      {/if}
    </div>

    <!-- Status badge -->
    <div class="flex items-center gap-2 shrink-0">
      {#if toolCount > 0}
        <span class="text-[10px] text-gray-400">{toolCount} tools</span>
      {/if}
      {#if isActive}
        <div class="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 rounded-full">
          <div class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
          <span class="text-[10px] font-medium text-indigo-700">
            {elapsedTime ? `${elapsedTime}s` : 'working'}
          </span>
        </div>
      {:else}
        <div class="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
          <svg class="w-3 h-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
      {/if}
    </div>

    <!-- Expand icon -->
    <svg
      class="w-4 h-4 text-gray-400 transition-transform shrink-0 {expanded ? 'rotate-180' : ''}"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Expanded content -->
  {#if expanded}
    <div class="border-t border-indigo-100">
      <!-- Description -->
      <div class="px-4 py-2 bg-indigo-50/30 border-b border-indigo-100">
        <div class="text-xs text-indigo-700">{description}</div>
      </div>

      <!-- Updates timeline -->
      <div class="px-4 py-2 max-h-64 overflow-y-auto space-y-2">
        {#each updates as update (update.id)}
          {#if update.role === "assistant"}
            {@const textContent = formatContent(update)}
            {@const tools = getToolCalls(update)}

            {#if textContent}
              <div class="text-xs leading-relaxed text-gray-700 markdown-body pl-3 border-l-2 border-indigo-200 py-1" onclick={onMessageClick}>
                <MermaidRenderer content={textContent} {renderMarkdown} />
              </div>
            {/if}

            {#each tools as tool}
              <div class="flex items-center gap-2 pl-3 border-l-2 border-orange-200 py-1">
                <span class="text-sm">{toolIcons[tool.name] || "⚙️"}</span>
                <span class="text-xs font-medium text-orange-600">{tool.name}</span>
                <span class="text-xs text-gray-400 truncate">{getToolSummary(tool)}</span>
              </div>
            {/each}
          {/if}
        {/each}

        {#if isActive}
          <div class="flex items-center gap-2 py-2">
            <div class="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></div>
            <span class="text-xs text-indigo-600">Processing...</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
