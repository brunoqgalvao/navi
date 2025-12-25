<script lang="ts">
  interface Props {
    query: string;
    allowedDomains?: string[];
    blockedDomains?: string[];
    resultContent?: string;
    isError?: boolean;
  }

  let { query, allowedDomains, blockedDomains, resultContent, isError }: Props = $props();

  let showResults = $state(false);

  // Parse search results from the result content
  // Results typically come as markdown with links
  interface SearchResult {
    title: string;
    url: string;
    snippet: string;
  }

  const parsedResults = $derived.by(() => {
    if (!resultContent) return [];

    const results: SearchResult[] = [];
    const lines = resultContent.split('\n');

    // Look for markdown links: [title](url) followed by description
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let currentResult: Partial<SearchResult> | null = null;

    for (const line of lines) {
      const match = linkRegex.exec(line);
      if (match) {
        if (currentResult?.title && currentResult?.url) {
          results.push(currentResult as SearchResult);
        }
        currentResult = {
          title: match[1],
          url: match[2],
          snippet: ''
        };
        linkRegex.lastIndex = 0;
      } else if (currentResult && line.trim() && !line.startsWith('#') && !line.startsWith('-')) {
        currentResult.snippet = (currentResult.snippet ? currentResult.snippet + ' ' : '') + line.trim();
      }
    }

    if (currentResult?.title && currentResult?.url) {
      results.push(currentResult as SearchResult);
    }

    return results.slice(0, 8); // Limit to 8 results
  });

  function getDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  function truncateSnippet(text: string, maxLen = 120): string {
    if (!text || text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '...';
  }
</script>

<div class="space-y-2">
  <div class="flex items-center gap-2">
    <svg class="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <span class="text-xs font-medium text-indigo-600">"{query}"</span>
    {#if allowedDomains?.length}
      <span class="text-[10px] text-gray-400">site:{allowedDomains.join(', ')}</span>
    {/if}
    {#if resultContent}
      <button
        onclick={() => showResults = !showResults}
        class="text-[10px] text-blue-500 hover:text-blue-700 hover:underline ml-auto"
      >
        {showResults ? "hide" : `${parsedResults.length} results`}
      </button>
    {/if}
  </div>

  {#if showResults && parsedResults.length > 0}
    <div class="space-y-1.5 pt-1">
      {#each parsedResults as result}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          class="block p-2 rounded-lg border border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
        >
          <div class="flex items-start gap-2">
            <div class="w-4 h-4 rounded bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg class="w-2.5 h-2.5 text-gray-400 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium text-gray-900 group-hover:text-indigo-700 truncate">
                {result.title}
              </div>
              <div class="text-[10px] text-green-700 truncate">
                {getDomain(result.url)}
              </div>
              {#if result.snippet}
                <div class="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                  {truncateSnippet(result.snippet)}
                </div>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>
  {:else if showResults && isError}
    <div class="text-xs text-red-600 bg-red-50 rounded p-2">
      Search failed
    </div>
  {:else if showResults}
    <div class="text-xs text-gray-400 italic">No results parsed</div>
  {/if}
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
