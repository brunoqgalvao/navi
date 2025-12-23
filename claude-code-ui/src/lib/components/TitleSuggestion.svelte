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

  let suggestedTitle: string | null = $state(null);
  let showSuggestion = $state(false);
  let dismissed = $state(false);
  let triggered = $state(false);
  let lastSessionId: string | null = $state(null);
  let tooltipEl: HTMLElement | null = $state(null);
  let tooltipTop = $state(100);

  let userMessageCount = $derived(
    messages.filter(m => m.role === "user" && !m.parentToolUseId).length
  );

  // Trigger at user message 3
  $effect(() => {
    console.log("[TitleSuggestion] userMessageCount:", userMessageCount, "sessionId:", sessionId, "dismissed:", dismissed, "triggered:", triggered);
    if (userMessageCount === 3 && 
        sessionId && 
        !dismissed && !showSuggestion && !triggered) {
      console.log("[TitleSuggestion] Triggering title suggestion generation");
      triggered = true;
      generateSuggestion();
    }
  });

  // Reset state only when sessionId actually changes
  $effect(() => {
    if (sessionId !== lastSessionId) {
      console.log("[TitleSuggestion] Session changed from", lastSessionId, "to", sessionId, "- resetting state");
      lastSessionId = sessionId;
      dismissed = false;
      showSuggestion = false;
      triggered = false;
      suggestedTitle = null;
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
    console.log("[TitleSuggestion] generateSuggestion called, currentTitle:", currentTitle);
    const recentMessages = messages
      .filter(m => !m.parentToolUseId)
      .slice(-6);
    
    const conversationContext = recentMessages
      .map(m => `${m.role}: ${formatContent(m.content).slice(0, 200)}`)
      .join('\n');
    
    try {
      const response = await api.ephemeral.chat({
        prompt: `Current title: "${currentTitle}"\n\nConversation:\n${conversationContext}`,
        systemPrompt: `You review chat titles. Given the current title and conversation, decide if the title needs improvement.

Rules:
- If the current title is good enough, respond exactly: NO_CHANGE
- If it needs improvement, respond with ONLY the new title
- Use Title Case (capitalize first letter of each word)
- Keep it short: 3-6 words
- No quotes, no explanation, no punctuation at the end
- Never use ALL CAPS

Examples of good responses:
NO_CHANGE
Debug React Components
Fix Database Connection
Setup User Authentication
Portuguese Chat Assistance`,
        model: "claude-3-haiku-20240307",
        maxTokens: 20,
        provider: "anthropic"
      });
      
      const result = response.result.trim();
      console.log("[TitleSuggestion] LLM response:", result);
      
      // Extract just the title if LLM added extra text
      let firstLine = result.split('\n')[0].trim();
      
      if (firstLine && 
          firstLine !== "NO_CHANGE" && 
          firstLine.toLowerCase() !== "no_change" &&
          firstLine.length < 50) {
        // Fix all caps by converting to title case
        if (firstLine === firstLine.toUpperCase()) {
          firstLine = toTitleCase(firstLine);
        }
        suggestedTitle = firstLine.replace(/^["']|["']$/g, '');
        showSuggestion = true;
        console.log("[TitleSuggestion] Showing suggestion:", suggestedTitle);
      } else {
        console.log("[TitleSuggestion] No change needed");
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
    dismissed = true;
    suggestedTitle = null;
  }

  export function triggerSuggestion(forSessionId?: string) {
    const targetSessionId = forSessionId || sessionId;
    console.log("[TitleSuggestion] Manual trigger requested for session:", targetSessionId);
    if (!targetSessionId) return;
    // Only trigger if it's for the current session
    if (targetSessionId !== sessionId) {
      console.log("[TitleSuggestion] Ignoring - not the current session");
      return;
    }
    dismissed = false;
    triggered = true;
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
