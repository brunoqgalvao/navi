<script lang="ts">
  import type { ChatMessage } from "../stores";
  import type { ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock } from "../claude";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import ToolRenderer from "./ToolRenderer.svelte";
  import CopyButton from "./CopyButton.svelte";

  interface Props {
    toolUseId: string;
    description: string;
    subagentType: string;
    messages: ChatMessage[];
    isActive: boolean;
    elapsedTime?: number;
    onClose: () => void;
    renderMarkdown: (content: string) => string;
    onPreview?: (path: string) => void;
  }

  let {
    toolUseId,
    description,
    subagentType,
    messages,
    isActive,
    elapsedTime,
    onClose,
    renderMarkdown,
    onPreview,
  }: Props = $props();

  let scrollContainer: HTMLDivElement | null = $state(null);
  let expandedTools = $state<Set<string>>(new Set());

  function toggleTool(toolId: string) {
    if (expandedTools.has(toolId)) {
      expandedTools.delete(toolId);
    } else {
      expandedTools.add(toolId);
    }
    expandedTools = new Set(expandedTools);
  }

  // Build a map of tool results from user messages
  function getToolResults(): Map<string, ToolResultBlock> {
    const results = new Map<string, ToolResultBlock>();
    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === "tool_result") {
            const resultBlock = block as ToolResultBlock;
            results.set(resultBlock.tool_use_id, resultBlock);
          }
        }
      }
    }
    return results;
  }

  // Get only assistant messages for display
  function getAssistantMessages(): ChatMessage[] {
    return messages.filter(m => m.role === "assistant");
  }

  function getTextContent(msg: ChatMessage): string {
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

  function getThinkingBlocks(msg: ChatMessage): ThinkingBlock[] {
    if (msg.role !== "assistant") return [];
    const content = msg.content as ContentBlock[];
    return content.filter((b): b is ThinkingBlock => b.type === "thinking");
  }

  function getToolSummary(tool: ToolUseBlock): string {
    const input = tool.input || {};
    switch (tool.name) {
      case "Read":
        return input.file_path?.split("/").pop() || "";
      case "Write":
      case "Edit":
      case "MultiEdit":
        return input.file_path?.split("/").pop() || "";
      case "Bash":
        const cmd = input.command || "";
        return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
      case "Glob":
      case "Grep":
        return input.pattern || "";
      case "WebFetch":
        try { return new URL(input.url || "").hostname; } catch { return ""; }
      case "WebSearch":
        return input.query || "";
      default:
        return "";
    }
  }

  const toolIconPaths: Record<string, string> = {
    Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    MultiEdit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    WebFetch: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
    WebSearch: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    TodoWrite: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  };

  function getToolIconPath(name: string): string {
    return toolIconPaths[name] || "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z";
  }

  const toolResults = $derived(getToolResults());
  const assistantMessages = $derived(getAssistantMessages());

  // Handle escape key to close
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
  onclick={onClose}
>
  <!-- Modal content -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
      <div class="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-gray-900">Subagent</h2>
          <span class="text-sm text-indigo-500 font-mono bg-indigo-50 px-2 py-0.5 rounded">{subagentType}</span>
          {#if isActive}
            <div class="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 rounded-full">
              <div class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
              <span class="text-xs font-medium text-indigo-700">
                {elapsedTime ? `${elapsedTime}s` : 'working'}
              </span>
            </div>
          {:else}
            <div class="flex items-center gap-1.5 px-2 py-0.5 bg-teal-100 rounded-full">
              <svg class="w-3 h-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-xs font-medium text-teal-700">completed</span>
            </div>
          {/if}
        </div>
        <p class="text-sm text-gray-500 truncate mt-0.5">{description}</p>
      </div>
      <button
        onclick={onClose}
        class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <!-- Messages -->
    <div
      bind:this={scrollContainer}
      class="flex-1 overflow-y-auto px-6 py-4 space-y-4"
    >
      {#if assistantMessages.length === 0}
        <div class="flex flex-col items-center justify-center py-12 text-gray-400">
          {#if isActive}
            <div class="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mb-3"></div>
            <p class="text-sm">Subagent is working...</p>
          {:else}
            <p class="text-sm">No messages from subagent</p>
          {/if}
        </div>
      {:else}
        {#each assistantMessages as msg (msg.id)}
          {@const textContent = getTextContent(msg)}
          {@const tools = getToolCalls(msg)}
          {@const thinking = getThinkingBlocks(msg)}

          <div class="space-y-3">
            <!-- Thinking blocks -->
            {#each thinking as think, thinkIdx}
              {@const thinkId = `${msg.id}-think-${thinkIdx}`}
              {@const isExpanded = expandedTools.has(thinkId)}
              <div class="rounded-lg border border-purple-200 bg-purple-50/30 overflow-hidden">
                <button
                  onclick={() => toggleTool(thinkId)}
                  class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50 transition-colors"
                >
                  <span class="text-sm">💭</span>
                  <span class="text-sm font-medium text-purple-700">Thinking</span>
                  <span class="text-xs text-purple-400 truncate flex-1">
                    {think.thinking.slice(0, 60)}{think.thinking.length > 60 ? "..." : ""}
                  </span>
                  <svg
                    class="w-4 h-4 text-purple-400 transition-transform shrink-0 {isExpanded ? 'rotate-90' : ''}"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {#if isExpanded}
                  <div class="px-3 pb-3 pt-1 border-t border-purple-100 relative">
                    <div class="absolute top-1 right-3">
                      <CopyButton text={think.thinking} />
                    </div>
                    <pre class="text-xs text-purple-700 whitespace-pre-wrap font-mono bg-purple-50 rounded p-3 pr-8 max-h-64 overflow-y-auto">{think.thinking}</pre>
                  </div>
                {/if}
              </div>
            {/each}

            <!-- Text content -->
            {#if textContent}
              <div class="text-sm leading-relaxed text-gray-800 markdown-body relative group/text">
                <div class="absolute -top-1 right-0 opacity-0 group-hover/text:opacity-100 transition-opacity">
                  <CopyButton text={textContent} />
                </div>
                <MermaidRenderer content={textContent} {renderMarkdown} />
              </div>
            {/if}

            <!-- Tool calls -->
            {#each tools as tool (tool.id)}
              {@const result = toolResults.get(tool.id)}
              {@const isExpanded = expandedTools.has(tool.id)}
              {@const summary = getToolSummary(tool)}
              {@const isLoading = !result}

              <div class="rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onclick={() => toggleTool(tool.id)}
                  class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  {#if isLoading}
                    <svg class="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  {:else}
                    <svg class="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={getToolIconPath(tool.name)} />
                    </svg>
                  {/if}
                  <span class="text-sm font-medium text-gray-700">{tool.name}</span>
                  {#if summary}
                    <span class="text-sm text-gray-400 truncate font-mono flex-1">{summary}</span>
                  {/if}
                  {#if result}
                    {#if result.is_error}
                      <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    {:else}
                      <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    {/if}
                  {/if}
                  <svg
                    class="w-4 h-4 text-gray-300 transition-transform shrink-0 {isExpanded ? 'rotate-90' : ''}"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {#if isExpanded}
                  <div class="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                    <ToolRenderer
                      {tool}
                      toolResult={result ? { content: String(result.content || ''), is_error: result.is_error } : undefined}
                      {onPreview}
                      hideHeader={true}
                    />
                    {#if result && !['Read', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch'].includes(tool.name)}
                      <div class="pt-1">
                        <pre class="text-xs {result.is_error ? 'text-red-700 bg-red-50' : 'text-gray-600 bg-gray-50'} rounded p-2 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{result.content}</pre>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}

        {#if isActive}
          <div class="flex items-center gap-2 py-3 text-indigo-600">
            <div class="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></div>
            <span class="text-sm">Working...</span>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Footer -->
    <div class="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
      <span>{assistantMessages.length} message{assistantMessages.length !== 1 ? 's' : ''}</span>
      <span>Press ESC to close</span>
    </div>
  </div>
</div>
