<script lang="ts">
  import type { SubagentEventBlock } from "../claude";
  import Markdown from "./Markdown.svelte";

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
        <div class="text-sm text-gray-700 mt-1 deliverable-summary">
          <Markdown content={block.summary} />
        </div>
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
        <div class="mt-2 text-xs text-gray-700 bg-white/80 border border-white rounded-lg p-3 max-h-72 overflow-y-auto deliverable-content">
          <Markdown content={block.content} />
        </div>
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

<style>
  .deliverable-summary :global(.markdown-content) {
    display: inline;
  }

  .deliverable-summary :global(.markdown-content p) {
    display: inline;
    margin: 0;
  }

  .deliverable-summary :global(.markdown-content code) {
    font-size: 0.8125rem;
  }

  .deliverable-content :global(.markdown-content) {
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .deliverable-content :global(.markdown-content h1) {
    font-size: 0.9375rem;
    margin-top: 0.75rem;
    margin-bottom: 0.375rem;
  }

  .deliverable-content :global(.markdown-content h2) {
    font-size: 0.875rem;
    margin-top: 0.625rem;
    margin-bottom: 0.25rem;
  }

  .deliverable-content :global(.markdown-content h3) {
    font-size: 0.8125rem;
    margin-top: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .deliverable-content :global(.markdown-content p) {
    margin: 0.375rem 0;
  }

  .deliverable-content :global(.markdown-content ul),
  .deliverable-content :global(.markdown-content ol) {
    margin: 0.375rem 0;
    padding-left: 1.25rem;
  }

  .deliverable-content :global(.markdown-content li) {
    margin: 0.125rem 0;
  }

  .deliverable-content :global(.markdown-content pre) {
    font-size: 0.75rem;
    padding: 0.5rem;
    margin: 0.375rem 0;
    border-radius: 0.375rem;
    background: rgba(0, 0, 0, 0.04);
  }

  .deliverable-content :global(.markdown-content code) {
    font-size: 0.75rem;
    padding: 0.125rem 0.25rem;
  }

  .deliverable-content :global(.markdown-content blockquote) {
    margin: 0.375rem 0;
    padding-left: 0.75rem;
    border-left-width: 3px;
  }

  .deliverable-content :global(.markdown-content table) {
    font-size: 0.75rem;
  }

  .deliverable-content :global(.markdown-content th),
  .deliverable-content :global(.markdown-content td) {
    padding: 0.25rem 0.5rem;
  }
</style>
