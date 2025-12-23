<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { createSandboxedContent } from './generative-ui-html';

  interface Props {
    html: string;
    id?: string;
  }

  interface InteractionEvent {
    type: string;
    target?: string;
    data?: Record<string, any>;
  }

  let { html, id = "genui-" + Math.random().toString(36).substr(2, 9) }: Props = $props();

  let iframeElement: HTMLIFrameElement;
  let mounted = $state(false);
  let error = $state<string | null>(null);

  const dispatch = createEventDispatcher<{
    interaction: InteractionEvent;
    error: string;
  }>();

  function sanitizeHtml(content: string): string {
    let sanitized = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    sanitized = sanitized.replace(
      /href\s*=\s*["']([^"']*?)["']/gi,
      (match, url) => {
        const safeProtocols = /^(https?:|mailto:|tel:)/i;
        if (safeProtocols.test(url) || url.startsWith('#') || url.startsWith('/')) {
          return match;
        }
        return 'href="#"';
      }
    );

    return sanitized;
  }

  function handleMessage(event: MessageEvent) {
    if (event.data?.source !== 'generative-ui' || event.data?.id !== id) {
      return;
    }

    const { type, target, data } = event.data;

    if (type === 'ready') {
      error = null;
      return;
    }

    dispatch('interaction', { type, target, data });
  }

  onMount(() => {
    mounted = true;
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  $effect(() => {
    if (mounted && iframeElement) {
      try {
        const content = createSandboxedContent(html, id, sanitizeHtml);
        iframeElement.srcdoc = content;
      } catch (err) {
        error = "Failed to render content: " + (err instanceof Error ? err.message : 'Unknown error');
        dispatch('error', error);
      }
    }
  });
</script>

<div class="generative-ui-container border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
  <div class="bg-gray-100 px-3 py-2 text-xs text-gray-600 font-medium border-b border-gray-200 flex items-center gap-2">
    <div class="w-2 h-2 rounded-full bg-orange-400"></div>
    Interactive Content
    <span class="text-gray-400">•</span>
    <span class="text-gray-500">Sandboxed</span>
  </div>
  
  {#if error}
    <div class="p-4 bg-red-50 border-b border-red-200 text-red-700 text-sm">
      <strong>Error:</strong> {error}
    </div>
  {/if}
  
  <div class="relative">
    <iframe
      bind:this={iframeElement}
      title="Generative UI Content"
      sandbox="allow-scripts allow-forms"
      class="w-full min-h-[200px] border-0 bg-white"
      style="height: auto;"
    ></iframe>
  </div>
</div>

<style>
  .generative-ui-container {
    isolation: isolate;
  }
  
  iframe {
    border: none;
    outline: none;
  }
</style>
