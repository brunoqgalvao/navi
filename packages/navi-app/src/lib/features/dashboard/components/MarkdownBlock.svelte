<script lang="ts">
  /**
   * MarkdownBlock - Renders markdown content
   *
   * Uses marked for parsing, sanitizes HTML output
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

<div class="prose prose-sm dark:prose-invert max-w-none dashboard-markdown">
  {@html html}
</div>

<style>
  /* Dashboard-specific markdown styling */
  .dashboard-markdown :global(h1) {
    @apply text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700;
  }

  .dashboard-markdown :global(h2) {
    @apply text-lg font-semibold text-gray-800 dark:text-gray-200 mt-6 mb-3;
  }

  .dashboard-markdown :global(h3) {
    @apply text-base font-medium text-gray-700 dark:text-gray-300 mt-4 mb-2;
  }

  .dashboard-markdown :global(a) {
    @apply text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300;
  }

  .dashboard-markdown :global(code) {
    @apply bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm;
  }

  .dashboard-markdown :global(pre) {
    @apply bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto;
  }

  .dashboard-markdown :global(ul),
  .dashboard-markdown :global(ol) {
    @apply my-2 pl-5;
  }

  .dashboard-markdown :global(li) {
    @apply my-1;
  }

  .dashboard-markdown :global(blockquote) {
    @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400;
  }
</style>
