<script lang="ts">
  import { fly, fade, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Suggestion } from "../types";

  interface Props {
    suggestion: Suggestion;
    onAccept: (id: string) => void;
    onDismiss: (id: string) => void;
  }

  let { suggestion, onAccept, onDismiss }: Props = $props();

  let expanded = $state(false);

  const typeStyles: Record<string, { accent: string; icon: string; glow: string }> = {
    skill: {
      accent: "from-violet-500 to-purple-400",
      icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
      glow: "shadow-violet-500/20",
    },
    memory: {
      accent: "from-cyan-500 to-blue-400",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      glow: "shadow-cyan-500/20",
    },
    docs: {
      accent: "from-amber-500 to-orange-400",
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
      glow: "shadow-amber-500/20",
    },
    action: {
      accent: "from-emerald-500 to-green-400",
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
      glow: "shadow-emerald-500/20",
    },
    insight: {
      accent: "from-blue-500 to-cyan-400",
      icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      glow: "shadow-blue-500/20",
    },
  };

  const priorityBorder: Record<string, string> = {
    low: "border-l-2 border-l-gray-300",
    medium: "border-l-2 border-l-blue-400",
    high: "border-l-4 border-l-amber-400",
  };

  function getStyle(type: string) {
    return typeStyles[type] || typeStyles.insight;
  }

  function formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function handleAccept() {
    onAccept(suggestion.id);
  }

  function handleDismiss() {
    onDismiss(suggestion.id);
  }
</script>

<div
  class="pointer-events-auto relative overflow-hidden rounded-2xl shadow-2xl {getStyle(suggestion.type).glow} {priorityBorder[suggestion.priority]}"
  in:fly={{ x: 100, duration: 300, easing: cubicOut }}
  out:fade={{ duration: 150 }}
>
  <!-- Glass background -->
  <div class="absolute inset-0 bg-white dark:bg-gray-900"></div>

  <!-- Accent gradient bar -->
  <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r {getStyle(suggestion.type).accent}"></div>

  <!-- Content -->
  <div class="relative p-4">
    <div class="flex items-start gap-3">
      <!-- Icon with gradient background -->
      <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br {getStyle(suggestion.type).accent} flex items-center justify-center shadow-lg">
        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStyle(suggestion.type).icon} />
        </svg>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{suggestion.title}</p>
          <button
            onclick={handleDismiss}
            class="shrink-0 w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-all duration-200 group"
          >
            <svg class="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{suggestion.description}</p>

        <!-- Expand button -->
        {#if suggestion.expandedContent}
          <button
            onclick={() => expanded = !expanded}
            class="mt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1 transition-colors"
          >
            <svg
              class="w-3 h-3 transition-transform duration-200"
              class:rotate-180={expanded}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? "Show less" : "Show more"}
          </button>
        {/if}

        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2 font-medium">{formatTime(suggestion.timestamp)}</p>
      </div>
    </div>

    <!-- Expanded content -->
    {#if expanded && suggestion.expandedContent}
      <div
        class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800"
        transition:slide={{ duration: 200 }}
      >
        <div class="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300">
          <!-- Simple markdown rendering - just handle basic formatting -->
          {@html formatMarkdown(suggestion.expandedContent)}
        </div>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
      <button
        onclick={handleDismiss}
        class="flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200
          bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        Not now
      </button>
      <button
        onclick={handleAccept}
        class="flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200
          bg-gradient-to-r {getStyle(suggestion.type).accent} text-white shadow-lg hover:shadow-xl hover:scale-[1.02]"
      >
        {suggestion.type === "skill" ? "Create Skill" : suggestion.type === "memory" ? "Save" : suggestion.type === "docs" ? "Show Docs" : "Accept"}
      </button>
    </div>
  </div>
</div>

<script context="module" lang="ts">
  /**
   * Simple markdown formatter for expanded content
   */
  function formatMarkdown(content: string): string {
    return content
      // Headers
      .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline">$1</a>')
      // List items
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      // Paragraphs (double newline)
      .replace(/\n\n/g, '</p><p class="mt-2">')
      // Single newlines to <br>
      .replace(/\n/g, '<br>')
      // Wrap in paragraph
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }
</script>
