<script lang="ts">
  import { sessionEvents, streamingState, type SDKEvent, type SDKEventType } from "../stores";
  import type { ContentBlock, StreamEvent } from "../claude";
  import ToolRenderer from "./ToolRenderer.svelte";

  interface Props {
    sessionId: string;
    renderMarkdown: (content: string) => string;
    onPreview?: (path: string) => void;
  }

  let { sessionId, renderMarkdown, onPreview }: Props = $props();

  let events = $derived($sessionEvents.get(sessionId) || []);
  let streaming = $derived($streamingState.get(sessionId));

  let expandedEvents = $state<Set<string>>(new Set());
  let filterTypes = $state<Set<SDKEventType>>(new Set());
  let showAllTypes = $state(true);

  const eventTypeLabels: Record<SDKEventType, { label: string; color: string; icon: string }> = {
    system_init: { label: "Init", color: "bg-blue-100 text-blue-800", icon: "S" },
    system_status: { label: "Status", color: "bg-gray-100 text-gray-800", icon: "St" },
    system_compact: { label: "Compact", color: "bg-purple-100 text-purple-800", icon: "C" },
    system_hook: { label: "Hook", color: "bg-indigo-100 text-indigo-800", icon: "H" },
    assistant: { label: "Assistant", color: "bg-green-100 text-green-800", icon: "A" },
    assistant_streaming: { label: "Streaming", color: "bg-green-50 text-green-600", icon: "~" },
    user: { label: "User", color: "bg-amber-100 text-amber-800", icon: "U" },
    tool_progress: { label: "Tool Progress", color: "bg-cyan-100 text-cyan-800", icon: "P" },
    tool_use: { label: "Tool Use", color: "bg-orange-100 text-orange-800", icon: "T" },
    tool_result: { label: "Tool Result", color: "bg-teal-100 text-teal-800", icon: "R" },
    result: { label: "Result", color: "bg-emerald-100 text-emerald-800", icon: "✓" },
    error: { label: "Error", color: "bg-red-100 text-red-800", icon: "!" },
    permission_request: { label: "Permission", color: "bg-yellow-100 text-yellow-800", icon: "?" },
    auth_status: { label: "Auth", color: "bg-violet-100 text-violet-800", icon: "🔑" },
    unknown: { label: "Unknown", color: "bg-gray-100 text-gray-500", icon: "?" },
  };

  function toggleEvent(eventId: string) {
    if (expandedEvents.has(eventId)) {
      expandedEvents.delete(eventId);
    } else {
      expandedEvents.add(eventId);
    }
    expandedEvents = new Set(expandedEvents);
  }

  function toggleFilter(type: SDKEventType) {
    if (filterTypes.has(type)) {
      filterTypes.delete(type);
    } else {
      filterTypes.add(type);
    }
    filterTypes = new Set(filterTypes);
    showAllTypes = filterTypes.size === 0;
  }

  function clearFilters() {
    filterTypes = new Set();
    showAllTypes = true;
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  }

  function getEventSummary(event: SDKEvent): string {
    const data = event.data as any;
    switch (event.type) {
      case "system_init":
        return `Model: ${data.model || "unknown"}, Tools: ${data.tools?.length || 0}`;
      case "assistant":
        const content = data.content;
        if (Array.isArray(content)) {
          const textBlocks = content.filter((b: ContentBlock) => b.type === "text");
          const toolBlocks = content.filter((b: ContentBlock) => b.type === "tool_use");
          let summary = "";
          if (textBlocks.length > 0) {
            const text = (textBlocks[0] as any).text || "";
            summary = text.slice(0, 80) + (text.length > 80 ? "..." : "");
          }
          if (toolBlocks.length > 0) {
            summary += ` [${toolBlocks.length} tool${toolBlocks.length > 1 ? "s" : ""}]`;
          }
          return summary || "[empty]";
        }
        return "[content]";
      case "assistant_streaming":
        const streamEvent = data as StreamEvent;
        if (streamEvent.delta?.text) return `+${streamEvent.delta.text.length} chars`;
        if (streamEvent.delta?.thinking) return `+thinking`;
        if (streamEvent.type === "content_block_start") return `block start: ${streamEvent.content_block?.type}`;
        return streamEvent.type;
      case "user":
        const userContent = data.content;
        if (Array.isArray(userContent) && userContent.length > 0) {
          const first = userContent[0];
          if (first.type === "text") return (first as any).text?.slice(0, 60) + "...";
          if (first.type === "tool_result") return `Tool result: ${(first as any).tool_use_id?.slice(0, 8)}`;
        }
        return "[user message]";
      case "tool_progress":
        return `${data.toolName}: ${data.elapsedTimeSeconds?.toFixed(1)}s`;
      case "tool_use":
        return `${data.name}: ${JSON.stringify(data.input || {}).slice(0, 50)}`;
      case "result":
        return `Cost: $${data.costUsd?.toFixed(4) || 0}, Turns: ${data.numTurns || 0}`;
      case "error":
        return data.error || "Unknown error";
      case "permission_request":
        return `${data.toolName || data.tools?.[0] || "unknown tool"}`;
      default:
        return JSON.stringify(data).slice(0, 50);
    }
  }

  function getEventDetails(event: SDKEvent): string {
    return JSON.stringify(event.data, null, 2);
  }

  const filteredEvents = $derived(
    showAllTypes ? events : events.filter(e => filterTypes.has(e.type))
  );

  const uniqueTypes = $derived(
    [...new Set(events.map(e => e.type))] as SDKEventType[]
  );
</script>

<div class="flex flex-col h-full">
  <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50/50 flex-wrap">
    <span class="text-xs font-medium text-gray-500">Filter:</span>
    <button
      onclick={clearFilters}
      class="px-2 py-0.5 text-xs rounded {showAllTypes ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
    >
      All ({events.length})
    </button>
    {#each uniqueTypes as type}
      {@const info = eventTypeLabels[type]}
      {@const count = events.filter(e => e.type === type).length}
      <button
        onclick={() => toggleFilter(type)}
        class="px-2 py-0.5 text-xs rounded transition-colors {filterTypes.has(type) ? info.color + ' ring-2 ring-offset-1 ring-gray-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
      >
        {info.label} ({count})
      </button>
    {/each}
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if filteredEvents.length === 0}
      <div class="flex items-center justify-center h-32 text-gray-400 text-sm">
        No events yet
      </div>
    {:else}
      <div class="divide-y divide-gray-100">
        {#each filteredEvents as event (event.id)}
          {@const info = eventTypeLabels[event.type]}
          {@const isExpanded = expandedEvents.has(event.id)}
          <div class="group">
            <button
              onclick={() => toggleEvent(event.id)}
              class="w-full px-4 py-2 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left"
            >
              <span class="text-[10px] font-mono text-gray-400 whitespace-nowrap mt-0.5">
                {formatTimestamp(event.timestamp)}
              </span>
              
              <span class="w-6 h-5 flex-shrink-0 flex items-center justify-center rounded text-[10px] font-bold {info.color}">
                {info.icon}
              </span>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-700">{info.label}</span>
                  {#if event.parentToolUseId}
                    <span class="text-[10px] text-gray-400">↳ subagent</span>
                  {/if}
                </div>
                <p class="text-xs text-gray-500 truncate mt-0.5">
                  {getEventSummary(event)}
                </p>
              </div>
              
              <svg
                class="w-4 h-4 text-gray-400 transition-transform flex-shrink-0 {isExpanded ? 'rotate-90' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            {#if isExpanded}
              <div class="px-4 pb-3 bg-gray-50">
                <div class="ml-[72px] space-y-2">
                  {#if event.type === "assistant" && Array.isArray((event.data as any).content)}
                    {@const content = (event.data as any).content as ContentBlock[]}
                    {#each content as block, idx}
                      {#if block.type === "text"}
                        <div class="text-sm text-gray-700 prose prose-sm max-w-none">
                          {@html renderMarkdown((block as any).text)}
                        </div>
                      {:else if block.type === "thinking"}
                        <details class="bg-purple-50 rounded-lg p-2">
                          <summary class="text-xs font-medium text-purple-700 cursor-pointer">
                            Thinking ({(block as any).thinking?.length || 0} chars)
                          </summary>
                          <pre class="mt-2 text-xs text-purple-600 whitespace-pre-wrap overflow-x-auto">{(block as any).thinking}</pre>
                        </details>
                      {:else if block.type === "tool_use"}
                        <ToolRenderer tool={block as any} {onPreview} compact={true} />
                      {/if}
                    {/each}
                  {:else}
                    <details open class="bg-white rounded-lg border border-gray-200">
                      <summary class="px-3 py-1.5 text-xs font-medium text-gray-600 cursor-pointer hover:bg-gray-50">
                        Raw Data
                      </summary>
                      <pre class="p-3 text-xs text-gray-600 overflow-x-auto max-h-64 overflow-y-auto font-mono bg-gray-50 rounded-b-lg">{getEventDetails(event)}</pre>
                    </details>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    
    {#if streaming?.isStreaming}
      <div class="px-4 py-3 bg-green-50 border-t border-green-100">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span class="text-xs font-medium text-green-700">Streaming...</span>
        </div>
        {#if streaming.currentText}
          <p class="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{streaming.currentText}</p>
        {/if}
        {#if streaming.currentThinking}
          <details class="mt-2 bg-purple-50 rounded p-2">
            <summary class="text-xs text-purple-700 cursor-pointer">Thinking in progress...</summary>
            <pre class="mt-1 text-xs text-purple-600 whitespace-pre-wrap">{streaming.currentThinking}</pre>
          </details>
        {/if}
        {#if streaming.toolUseInProgress}
          <div class="mt-2 text-xs text-orange-700">
            Tool: {streaming.toolUseInProgress.name}
            {#if streaming.toolUseInProgress.partialJson}
              <pre class="mt-1 text-gray-600 font-mono">{streaming.toolUseInProgress.partialJson}</pre>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
