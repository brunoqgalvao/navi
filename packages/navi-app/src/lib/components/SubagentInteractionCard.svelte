<script lang="ts">
  import type { SubagentEventBlock } from "../claude";

  interface Props {
    block: SubagentEventBlock;
    onOpenSession?: (sessionId: string) => void;
  }

  let { block, onOpenSession }: Props = $props();

  let expanded = $state(false);

  const config = $derived.by(() => {
    switch (block.eventType) {
      case "deliverable":
        return {
          title: "Deliverable Received",
          icon: "📬",
          shell: "border-green-200 bg-green-50/70",
          badge: "bg-green-100 text-green-700",
        };
      case "draft_submitted":
        return {
          title: "Draft Submitted",
          icon: "📝",
          shell: "border-blue-200 bg-blue-50/70",
          badge: "bg-blue-100 text-blue-700",
        };
      case "clarification_response":
        return {
          title: "Clarification Response",
          icon: "💬",
          shell: "border-indigo-200 bg-indigo-50/70",
          badge: "bg-indigo-100 text-indigo-700",
        };
      default:
        return {
          title: "Deliverable Accepted",
          icon: "✅",
          shell: "border-teal-200 bg-teal-50/70",
          badge: "bg-teal-100 text-teal-700",
        };
    }
  });

  function preview(text: string | undefined, max = 180): string {
    if (!text) return "";
    const singleLine = text.replace(/\s+/g, " ").trim();
    return singleLine.length > max ? `${singleLine.slice(0, max)}...` : singleLine;
  }
</script>

<div class="rounded-xl border {config.shell} overflow-hidden">
  <div class="flex items-start gap-2 px-3 py-2.5">
    <span class="text-base leading-none mt-0.5">{config.icon}</span>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-sm font-semibold text-gray-900">{config.title}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded {config.badge} uppercase tracking-wide font-medium">
          {block.childRole || "agent"}
        </span>
        {#if block.deliverableType}
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/70 text-gray-600 uppercase tracking-wide font-medium">
            {block.deliverableType}
          </span>
        {/if}
        {#if block.revision}
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/70 text-gray-600 font-medium">
            rev {block.revision}
          </span>
        {/if}
      </div>

      {#if block.summary}
        <div class="text-sm text-gray-700 mt-1">{block.summary}</div>
      {/if}

      {#if block.eventType === "clarification_response" && block.question}
        <div class="text-xs text-gray-500 mt-1">
          <span class="font-medium">Q:</span> {block.question}
        </div>
      {/if}
      {#if block.eventType === "clarification_response" && block.response}
        <div class="text-xs text-gray-600 mt-0.5">
          <span class="font-medium">A:</span> {preview(block.response, 240)}
        </div>
      {/if}

      {#if block.content}
        <button
          onclick={() => expanded = !expanded}
          class="text-xs text-gray-600 hover:text-gray-800 mt-1.5 inline-flex items-center gap-1"
        >
          <svg class="w-3 h-3 transition-transform {expanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          {expanded ? "Hide details" : "Show details"}
        </button>
      {/if}

      {#if expanded && block.content}
        <pre class="mt-2 text-xs text-gray-700 bg-white/80 border border-white rounded-lg p-2 whitespace-pre-wrap max-h-52 overflow-y-auto">{block.content}</pre>
      {/if}

      {#if block.artifacts && block.artifacts.length > 0}
        <div class="mt-2 space-y-1">
          {#each block.artifacts as artifact}
            <div class="text-xs text-gray-600 flex items-center gap-1.5">
              <span>📎</span>
              <code class="font-mono truncate">{artifact.path}</code>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <button
      onclick={() => onOpenSession?.(block.childSessionId)}
      class="shrink-0 text-[11px] px-2 py-1 rounded bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
      title="Open child session"
    >
      Open
    </button>
  </div>
</div>
