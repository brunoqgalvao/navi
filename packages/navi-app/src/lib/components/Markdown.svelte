<script lang="ts">
  /**
   * Markdown - Renders markdown content
   *
   * Uses marked for parsing with GFM support
   */
  import { marked } from "marked";

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  // Configure marked for safe output
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  let html = $derived(marked.parse(content) as string);
</script>

<div class="markdown-content">
  {@html html}
</div>

<style>
  .markdown-content :global(h1) {
    @apply text-xl font-bold mb-3;
  }

  .markdown-content :global(h2) {
    @apply text-lg font-semibold mt-4 mb-2;
  }

  .markdown-content :global(h3) {
    @apply text-base font-medium mt-3 mb-1;
  }

  .markdown-content :global(p) {
    @apply my-2;
  }

  .markdown-content :global(a) {
    @apply text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 underline;
  }

  .markdown-content :global(code) {
    @apply bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono;
  }

  .markdown-content :global(pre) {
    @apply bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto my-2;
  }

  .markdown-content :global(pre code) {
    @apply bg-transparent p-0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    @apply my-2 pl-5;
  }

  .markdown-content :global(ul) {
    @apply list-disc;
  }

  .markdown-content :global(ol) {
    @apply list-decimal;
  }

  .markdown-content :global(li) {
    @apply my-1;
  }

  .markdown-content :global(blockquote) {
    @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 my-2;
  }

  .markdown-content :global(table) {
    @apply w-full border-collapse my-2;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    @apply border border-gray-200 dark:border-gray-700 px-3 py-2 text-left;
  }

  .markdown-content :global(th) {
    @apply bg-gray-50 dark:bg-gray-800 font-medium;
  }
</style>
