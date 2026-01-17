<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { createSandboxedContent } from './generative-ui-html';
  import { chatInputValue } from '../../stores/chat';

  interface Props {
    html: string;
    id?: string;
  }

  interface InteractionEvent {
    type: string;
    target?: Record<string, any> | null;
    data?: Record<string, any>;
  }

  let { html, id = "genui-" + Math.random().toString(36).substr(2, 9) }: Props = $props();

  let iframeElement: HTMLIFrameElement;
  let mounted = $state(false);
  let error = $state<string | null>(null);
  let iframeHeight = $state(200);

  const dispatch = createEventDispatcher<{
    interaction: InteractionEvent;
    sendToChat: { message: string; autoSubmit: boolean };
    formSubmit: { data: Record<string, any>; autoSubmit: boolean };
    error: string;
  }>();

  function sanitizeHtml(content: string): string {
    // We're in a sandboxed iframe with allow-scripts, so user scripts are safe
    // Only sanitize dangerous href protocols (not http/https/mailto/tel)
    let sanitized = content.replace(
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

  function formatFormData(data: Record<string, any>): string {
    // Remove internal fields
    const { _autoSubmit, ...formData } = data;

    // Format as readable text
    const entries = Object.entries(formData);
    if (entries.length === 1) {
      // Single field - just return the value
      return String(entries[0][1]);
    }

    // Multiple fields - format as key: value pairs
    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }

  function handleMessage(event: MessageEvent) {
    console.log('[GenUI Parent] Message received:', event.data);

    if (event.data?.source !== 'generative-ui' || event.data?.id !== id) {
      console.log('[GenUI Parent] Ignored - wrong source or id. Expected:', id, 'Got:', event.data?.id);
      return;
    }

    const { type, target, data } = event.data;
    console.log('[GenUI Parent] Processing:', type, data);

    if (type === 'ready') {
      error = null;
      return;
    }

    if (type === 'resize' && data?.height) {
      iframeHeight = Math.max(100, Math.min(800, data.height + 32));
      return;
    }

    // Handle send_to_chat - inject message into chat input
    if (type === 'send_to_chat' && data?.message) {
      chatInputValue.set(data.message);
      dispatch('sendToChat', { message: data.message, autoSubmit: data.autoSubmit || false });
      return;
    }

    // Handle form submissions - format and inject into chat
    if (type === 'form_submit' && data) {
      const autoSubmit = data._autoSubmit || false;
      const formattedData = formatFormData(data);
      chatInputValue.set(formattedData);
      dispatch('formSubmit', { data, autoSubmit });
      return;
    }

    // Handle button clicks - send button text/value to chat
    if (type === 'button_click' && data) {
      const message = data.buttonValue || data.buttonText || 'Button clicked';
      chatInputValue.set(message);
      dispatch('interaction', { type, target, data });
      return;
    }

    // Pass through other interactions
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

<div class="generative-ui-container border border-zinc-700 rounded-lg overflow-hidden bg-zinc-900">
  <div class="bg-zinc-800 px-3 py-2 text-xs text-zinc-400 font-medium border-b border-zinc-700 flex items-center gap-2">
    <div class="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
    Interactive Widget
    <span class="text-zinc-600">•</span>
    <span class="text-zinc-500">Sandboxed</span>
  </div>

  {#if error}
    <div class="p-4 bg-red-950 border-b border-red-800 text-red-400 text-sm">
      <strong>Error:</strong> {error}
    </div>
  {/if}

  <div class="relative">
    <iframe
      bind:this={iframeElement}
      title="Generative UI Content"
      sandbox="allow-scripts allow-forms"
      class="w-full border-0 bg-white"
      style="height: {iframeHeight}px;"
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
