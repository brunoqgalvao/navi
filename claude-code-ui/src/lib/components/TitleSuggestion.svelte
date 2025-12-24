<script lang="ts">
  import { api } from "../api";
  import type { ChatMessage } from "../stores";

  interface Props {
    sessionId: string | null;
    currentTitle: string;
    messages: ChatMessage[];
    onApply: (title: string) => void;
  }

  let { sessionId, currentTitle, messages, onApply }: Props = $props();

  // Track sessions that have already had suggestions (persists across re-renders)
  const triggeredSessions = new Set<string>();

  let suggestedTitle: string | null = $state(null);
  let showSuggestion = $state(false);
  let tooltipEl: HTMLElement | null = $state(null);
  let tooltipTop = $state(100);

  let userMessageCount = $derived(
    messages.filter(m => m.role === "user" && !m.parentToolUseId).length
  );

  // Trigger at user message 3 (only once per session)
  $effect(() => {
    if (userMessageCount === 3 && 
        sessionId && 
        !triggeredSessions.has(sessionId) &&
        !showSuggestion) {
      console.log("[TitleSuggestion] Triggering for session:", sessionId);
      triggeredSessions.add(sessionId);
      generateSuggestion();
    }
  });

  // Position tooltip near the parent element
  $effect(() => {
    if (showSuggestion && tooltipEl) {
      const parent = tooltipEl.closest('[data-session-item]');
      if (parent) {
        const rect = parent.getBoundingClientRect();
        tooltipTop = rect.top;
      }
    }
  });

  function formatContent(content: any): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block.type === "text") return block.text;
          if (block.type === "tool_use") return `[Using ${block.name}]`;
          return "";
        })
        .filter(text => text)
        .join(" ");
    }
    return "";
  }

  function toTitleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  async function generateSuggestion() {
    const titleToCheck = currentTitle || "New Chat";
    console.log("[TitleSuggestion] generateSuggestion called, currentTitle:", titleToCheck);
    const recentMessages = messages
      .filter(m => !m.parentToolUseId)
      .slice(-6);
    
    const conversationContext = recentMessages
      .map(m => `${m.role}: ${formatContent(m.content).slice(0, 200)}`)
      .join('\n');
    
    try {
      const response = await api.ephemeral.chat({
        prompt: `<current_title>${titleToCheck}</current_title>\n\n<conversation>\n${conversationContext}\n</conversation>`,
        systemPrompt: `You suggest chat titles. Given a conversation, suggest a better title or confirm the current one is good.

IMPORTANT: Respond with ONLY one of these two options:
1. The word NO_CHANGE (if current title is good)
2. A new title (3-6 words, Title Case)

Do NOT include any explanation, quotes, or extra text. Just the title or NO_CHANGE.

Good responses: NO_CHANGE, Debug React Components, Fix Database Connection
Bad responses: "Debug React", Current title: ..., The new title should be...`,
        model: "claude-3-haiku-20240307",
        maxTokens: 20,
        provider: "anthropic"
      });
      
      const result = response.result.trim();
      console.log("[TitleSuggestion] LLM response:", result);
      
      // Extract just the title - take first line and clean it up
      let title = result.split('\n')[0].trim();
      
      // Remove common prefixes the LLM might add
      title = title.replace(/^(new title:|suggested title:|title:)\s*/i, '');
      title = title.replace(/^["']|["']$/g, '');
      title = title.trim();
      
      if (title && 
          title.toLowerCase() !== "no_change" && 
          title.toLowerCase() !== "no change" &&
          !title.toLowerCase().startsWith("current title") &&
          title.length >= 3 &&
          title.length < 50) {
        // Fix all caps by converting to title case
        if (title === title.toUpperCase() && title.length > 3) {
          title = toTitleCase(title);
        }
        suggestedTitle = title;
        showSuggestion = true;
        console.log("[TitleSuggestion] Showing suggestion:", suggestedTitle);
      } else {
        console.log("[TitleSuggestion] No change needed or invalid response");
      }
    } catch (e) {
      console.error("[TitleSuggestion] Failed to generate suggestion:", e);
    }
  }

  function apply() {
    if (suggestedTitle) {
      console.log("[TitleSuggestion] Applying title:", suggestedTitle);
      onApply(suggestedTitle);
      showSuggestion = false;
      suggestedTitle = null;
    }
  }

  function dismiss() {
    console.log("[TitleSuggestion] Dismissed");
    showSuggestion = false;
    suggestedTitle = null;
  }

  export function triggerSuggestion(forSessionId?: string) {
    const targetSessionId = forSessionId || sessionId;
    console.log("[TitleSuggestion] Manual trigger requested for session:", targetSessionId);
    if (!targetSessionId) return;
    if (targetSessionId !== sessionId) {
      console.log("[TitleSuggestion] Ignoring - not the current session");
      return;
    }
    // Manual trigger always works, but mark as triggered so auto-trigger won't fire again
    triggeredSessions.add(targetSessionId);
    generateSuggestion();
  }
</script>

{#if showSuggestion && suggestedTitle}
  <div 
    bind:this={tooltipEl}
    class="fixed left-72 z-[100] animate-fade-in pointer-events-auto"
    style="top: {tooltipTop}px;"
  >
    <div class="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-72">
      <div class="absolute -left-[7px] top-6 w-3 h-3 bg-white border-l border-b border-gray-200 transform rotate-45"></div>
      
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-400 font-medium">Title suggestion</span>
        <button
          onclick={(e) => { e.stopPropagation(); dismiss(); }}
          class="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >Skip</button>
      </div>
      
      <h3 class="text-base font-semibold text-gray-900 mb-1">Better title?</h3>
      <p class="text-sm text-gray-600 mb-4">"{suggestedTitle}"</p>
      
      <div class="flex justify-end gap-2">
        <button 
          onclick={(e) => { e.stopPropagation(); dismiss(); }}
          class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >Keep current</button>
        <button 
          onclick={(e) => { e.stopPropagation(); apply(); }}
          class="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
        >Apply</button>
      </div>
    </div>
  </div>
{/if}
