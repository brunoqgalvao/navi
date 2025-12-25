<script lang="ts">
  interface Props {
    url: string;
    prompt?: string;
    resultContent?: string;
    isError?: boolean;
  }

  let { url, prompt, resultContent, isError }: Props = $props();

  let showContent = $state(false);

  function getDomain(urlStr: string): string {
    try {
      return new URL(urlStr).hostname.replace('www.', '');
    } catch {
      return urlStr;
    }
  }

  function getPath(urlStr: string): string {
    try {
      const u = new URL(urlStr);
      return u.pathname + u.search;
    } catch {
      return '';
    }
  }

  const contentStats = $derived.by(() => {
    if (!resultContent) return null;
    const lines = resultContent.split('\n').length;
    const chars = resultContent.length;
    const words = resultContent.split(/\s+/).filter(Boolean).length;
    return { lines, chars, words };
  });

  const previewText = $derived.by(() => {
    if (!resultContent) return '';
    // Get first ~500 chars, try to end at a sentence
    let preview = resultContent.slice(0, 500);
    const lastPeriod = preview.lastIndexOf('.');
    if (lastPeriod > 300) {
      preview = preview.slice(0, lastPeriod + 1);
    }
    return preview.trim();
  });
</script>

<div class="space-y-2">
  <div class="flex items-start gap-2">
    <svg class="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
    <div class="flex-1 min-w-0">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs font-mono text-indigo-600 hover:text-indigo-800 hover:underline block truncate"
        title={url}
      >
        <span class="font-medium">{getDomain(url)}</span><span class="text-gray-400">{getPath(url)}</span>
      </a>
      {#if prompt}
        <div class="text-[10px] text-gray-500 mt-0.5 truncate" title={prompt}>
          "{prompt}"
        </div>
      {/if}
    </div>
    {#if resultContent}
      <button
        onclick={() => showContent = !showContent}
        class="text-[10px] text-blue-500 hover:text-blue-700 hover:underline shrink-0"
      >
        {showContent ? "hide" : "preview"}
      </button>
    {/if}
  </div>

  {#if showContent}
    <div class="rounded-lg border border-gray-200 overflow-hidden bg-white">
      {#if contentStats}
        <div class="flex items-center gap-3 px-2 py-1 bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500">
          <span>{contentStats.words.toLocaleString()} words</span>
          <span>{contentStats.lines.toLocaleString()} lines</span>
          <span>{(contentStats.chars / 1024).toFixed(1)}KB</span>
        </div>
      {/if}
      {#if isError}
        <div class="p-2 text-xs text-red-600 bg-red-50">
          Failed to fetch content
        </div>
      {:else if previewText}
        <div class="p-2 text-xs text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          {previewText}
          {#if resultContent && resultContent.length > previewText.length}
            <span class="text-gray-400">... ({((resultContent.length - previewText.length) / 1024).toFixed(1)}KB more)</span>
          {/if}
        </div>
      {:else}
        <div class="p-2 text-xs text-gray-400 italic">No content</div>
      {/if}
    </div>
  {/if}
</div>
