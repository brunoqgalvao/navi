<script lang="ts">
  import type { ContentBlock } from "../claude";
  import ToolRenderer from "./ToolRenderer.svelte";
  import CopyButton from "./CopyButton.svelte";

  type StepType = "thinking" | "text" | "tool_use" | "tool_result";

  interface Step {
    id: string;
    type: StepType;
    content: ContentBlock;
    isStreaming?: boolean;
    streamingText?: string;
  }

  interface Props {
    steps: Step[];
    currentStepId?: string | null;
    userExpandedSteps: Set<string>;
    basePath?: string;
    renderMarkdown: (content: string) => string;
    onPreview?: (path: string) => void;
    onToggleStep?: (stepId: string, isExpanded: boolean) => void;
  }

  let {
    steps,
    currentStepId = null,
    userExpandedSteps,
    basePath = "",
    renderMarkdown,
    onPreview,
    onToggleStep,
  }: Props = $props();

  function isExpanded(step: Step): boolean {
    if (userExpandedSteps.has(step.id)) return true;
    if (step.id === currentStepId) return true;
    if (step.isStreaming) return true;
    return false;
  }

  function handleToggle(step: Step) {
    const currentlyExpanded = isExpanded(step);
    onToggleStep?.(step.id, !currentlyExpanded);
  }

  function getStepIcon(type: StepType): string {
    switch (type) {
      case "thinking": return "💭";
      case "text": return "💬";
      case "tool_use": return "🔧";
      case "tool_result": return "📋";
    }
  }

  function getStepLabel(step: Step): string {
    const content = step.content as any;
    switch (step.type) {
      case "thinking":
        const thinkingPreview = content.thinking?.slice(0, 60) || "";
        return thinkingPreview + (content.thinking?.length > 60 ? "..." : "");
      case "text":
        const textPreview = content.text?.slice(0, 80) || "";
        return textPreview + (content.text?.length > 80 ? "..." : "");
      case "tool_use":
        return content.name || "Tool";
      case "tool_result":
        const resultPreview = typeof content.content === "string" 
          ? content.content.slice(0, 60) 
          : "[result]";
        return (content.is_error ? "Error: " : "") + resultPreview + (resultPreview.length >= 60 ? "..." : "");
    }
  }

  function getStepColor(type: StepType, isActive: boolean): string {
    if (isActive) {
      switch (type) {
        case "thinking": return "border-l-purple-500 bg-purple-50/50";
        case "text": return "border-l-blue-500 bg-blue-50/30";
        case "tool_use": return "border-l-orange-500 bg-orange-50/30";
        case "tool_result": return "border-l-teal-500 bg-teal-50/30";
      }
    }
    return "border-l-gray-300 bg-gray-50/50 hover:bg-gray-100/50";
  }
</script>

<div class="space-y-1">
  {#each steps as step, idx (step.id)}
    {@const expanded = isExpanded(step)}
    {@const isActive = step.id === currentStepId || step.isStreaming}
    
    <div class="rounded-lg border-l-2 transition-all duration-150 {getStepColor(step.type, expanded)}">
      <button
        onclick={() => handleToggle(step)}
        class="w-full flex items-center gap-2 px-3 py-2 text-left group"
      >
        <span class="text-sm flex-shrink-0">{getStepIcon(step.type)}</span>
        
        <span class="flex-1 min-w-0 text-sm text-gray-700 truncate">
          {#if step.isStreaming && step.type === "text"}
            <span class="text-blue-600">{step.streamingText?.slice(-50) || "..."}</span>
          {:else if step.isStreaming && step.type === "thinking"}
            <span class="text-purple-600 italic">thinking...</span>
          {:else}
            {getStepLabel(step)}
          {/if}
        </span>
        
        {#if step.isStreaming}
          <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></span>
        {/if}
        
        <svg
          class="w-4 h-4 text-gray-400 transition-transform flex-shrink-0 {expanded ? 'rotate-90' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      
      {#if expanded}
        <div class="px-3 pb-3 pt-1">
          {#if step.type === "thinking"}
            <div class="relative">
              <div class="absolute top-1 right-1">
                <CopyButton text={(step.content as any).thinking || ""} />
              </div>
              <pre class="text-xs text-purple-700 whitespace-pre-wrap font-mono bg-purple-50 rounded-lg p-3 pr-10 max-h-64 overflow-y-auto">{step.isStreaming ? step.streamingText : (step.content as any).thinking}</pre>
            </div>
          {:else if step.type === "text"}
            <div class="prose prose-sm max-w-none text-gray-800" onclick={(e) => e.stopPropagation()}>
              {@html renderMarkdown(step.isStreaming ? (step.streamingText || "") : ((step.content as any).text || ""))}
            </div>
          {:else if step.type === "tool_use"}
            <ToolRenderer 
              tool={step.content as any} 
              {basePath}
              {onPreview}
              compact={false}
            />
          {:else if step.type === "tool_result"}
            {@const result = step.content as any}
            <div class="text-xs {result.is_error ? 'text-red-700 bg-red-50' : 'text-gray-700 bg-gray-50'} rounded-lg p-3 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
              {result.content}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
