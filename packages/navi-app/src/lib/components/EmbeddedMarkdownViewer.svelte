<script lang="ts">
  import { onMount } from "svelte";
  import { getApiBase } from "../config";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import CopyButton from "./CopyButton.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MarkdownFileItem } from "../markdown-file-parser";

  interface Props {
    item: MarkdownFileItem;
    basePath?: string;
    renderMarkdown: (content: string) => string;
    onPreview?: (path: string) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { item, basePath = '', renderMarkdown, onPreview, onSendToClaude }: Props = $props();

  let content = $state<string | null>(item.content ?? null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let isCollapsed = $state(item.collapsed === true);

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; selectedText: string } | null>(null);

  const height = item.height ?? 300;

  // Derive display title
  const title = $derived(
    item.title ||
    (item.path ? item.path.split('/').pop() : 'Document')
  );

  onMount(() => {
    if (item.path && !item.content) {
      loadFile(item.path);
    }
  });

  async function loadFile(path: string) {
    loading = true;
    error = null;

    try {
      // Resolve relative paths
      let fullPath = path;
      if (!path.startsWith('/') && basePath) {
        fullPath = `${basePath}/${path}`;
      }

      const response = await fetch(
        `${getApiBase()}/fs/read?path=${encodeURIComponent(fullPath)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const data = await response.json();
      content = data.content;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load file';
    } finally {
      loading = false;
    }
  }

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
  }

  function handleOpenInPreview() {
    if (item.path && onPreview) {
      let fullPath = item.path;
      if (!item.path.startsWith('/') && basePath) {
        fullPath = `${basePath}/${item.path}`;
      }
      onPreview(fullPath);
    }
  }

  function handleContextMenu(e: MouseEvent) {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';

    if (selectedText && onSendToClaude) {
      e.preventDefault();
      contextMenu = { x: e.clientX, y: e.clientY, selectedText };
    }
  }

  function handleMentionInChat() {
    if (contextMenu && onSendToClaude) {
      // Format as blockquote with Source annotation (for UserReferenceDisplay)
      const quotedLines = contextMenu.selectedText.split('\n').map(line => `> ${line}`);
      if (item.path) {
        quotedLines.push(`> *Source: \`${item.path}\`*`);
      }
      const context = quotedLines.join('\n');
      onSendToClaude(context);
      contextMenu = null;
    }
  }

  function handleCopySelection() {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.selectedText);
      contextMenu = null;
    }
  }

  function closeContextMenu() {
    contextMenu = null;
  }
</script>

<div class="embedded-markdown-viewer rounded-lg border border-gray-200 overflow-hidden my-3 bg-white shadow-sm">
  <!-- Header bar -->
  <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
    <div class="flex items-center gap-2">
      <!-- Document icon -->
      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
      </svg>

      <span class="text-sm font-medium text-gray-700 truncate max-w-[200px]" title={title}>
        {title}
      </span>

      {#if item.path}
        <span class="text-xs text-gray-400 font-mono truncate max-w-[150px]" title={item.path}>
          {item.path}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      <!-- Collapse/Expand button -->
      <button
        onclick={toggleCollapse}
        class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        <svg class="w-4 h-4 transition-transform {isCollapsed ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      <!-- Open in Preview button (only if we have a path) -->
      {#if item.path && onPreview}
        <button
          onclick={handleOpenInPreview}
          class="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
          title="Open in Preview"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
          </svg>
        </button>
      {/if}

      <!-- Copy button -->
      {#if content}
        <CopyButton text={content} class="text-gray-400 hover:text-gray-600" />
      {/if}
    </div>
  </div>

  <!-- Content area -->
  {#if !isCollapsed}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="markdown-viewer-content overflow-auto"
      style="max-height: {height}px;"
      oncontextmenu={handleContextMenu}
    >
      {#if loading}
        <div class="flex items-center justify-center h-32 text-gray-400">
          <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </div>
      {:else if error}
        <div class="flex items-center justify-center h-32 text-red-500 text-sm">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          {error}
        </div>
      {:else if content}
        <article class="markdown-preview p-4">
          <MermaidRenderer {content} {renderMarkdown} />
        </article>
      {:else}
        <div class="flex items-center justify-center h-32 text-gray-400 text-sm">
          No content
        </div>
      {/if}
    </div>

    <!-- Footer with scroll indicator -->
    {#if content && !loading && !error}
      <div class="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>{content.split('\n').length} lines</span>
        <span class="text-gray-300">Scroll to view more ↓</span>
      </div>
    {/if}
  {:else}
    <!-- Collapsed preview -->
    <div class="px-3 py-2 text-sm text-gray-500 italic bg-gray-50/50">
      {#if content}
        {content.split('\n').slice(0, 2).join(' ').slice(0, 100)}...
      {:else if loading}
        Loading...
      {:else}
        Click to expand
      {/if}
    </div>
  {/if}
</div>

<!-- Context menu for text selection -->
{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onclose={closeContextMenu}
    items={[
      {
        label: 'Mention in chat',
        icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>',
        onclick: handleMentionInChat,
      },
      {
        label: 'Copy selection',
        icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>',
        onclick: handleCopySelection,
      },
    ]}
  />
{/if}

<style>
  .embedded-markdown-viewer {
    font-family: system-ui, sans-serif;
  }

  .markdown-viewer-content {
    scrollbar-width: thin;
    scrollbar-color: #d1d5db transparent;
  }

  .markdown-viewer-content::-webkit-scrollbar {
    width: 6px;
  }

  .markdown-viewer-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .markdown-viewer-content::-webkit-scrollbar-thumb {
    background-color: #d1d5db;
    border-radius: 3px;
  }

  .markdown-viewer-content::-webkit-scrollbar-thumb:hover {
    background-color: #9ca3af;
  }

  /* Markdown styling within the viewer */
  :global(.embedded-markdown-viewer .markdown-preview) {
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
  }

  :global(.embedded-markdown-viewer .markdown-preview h1) {
    font-size: 1.5em;
    font-weight: 700;
    margin: 1em 0 0.5em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid #e5e7eb;
  }

  :global(.embedded-markdown-viewer .markdown-preview h2) {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0.75em 0 0.5em;
  }

  :global(.embedded-markdown-viewer .markdown-preview h3) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.5em 0;
  }

  :global(.embedded-markdown-viewer .markdown-preview p) {
    margin: 0.5em 0;
  }

  :global(.embedded-markdown-viewer .markdown-preview ul),
  :global(.embedded-markdown-viewer .markdown-preview ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  :global(.embedded-markdown-viewer .markdown-preview li) {
    margin: 0.25em 0;
  }

  :global(.embedded-markdown-viewer .markdown-preview code) {
    background: #f3f4f6;
    padding: 0.125em 0.375em;
    border-radius: 0.25em;
    font-size: 0.875em;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  :global(.embedded-markdown-viewer .markdown-preview pre) {
    background: #1f2937;
    color: #e5e7eb;
    padding: 0.75em 1em;
    border-radius: 0.5em;
    overflow-x: auto;
    margin: 0.5em 0;
  }

  :global(.embedded-markdown-viewer .markdown-preview pre code) {
    background: transparent;
    padding: 0;
    color: inherit;
  }

  :global(.embedded-markdown-viewer .markdown-preview blockquote) {
    border-left: 3px solid #d1d5db;
    padding-left: 1em;
    margin: 0.5em 0;
    color: #6b7280;
  }

  :global(.embedded-markdown-viewer .markdown-preview table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
    font-size: 0.875em;
  }

  :global(.embedded-markdown-viewer .markdown-preview th),
  :global(.embedded-markdown-viewer .markdown-preview td) {
    border: 1px solid #e5e7eb;
    padding: 0.5em 0.75em;
    text-align: left;
  }

  :global(.embedded-markdown-viewer .markdown-preview th) {
    background: #f9fafb;
    font-weight: 600;
  }

  :global(.embedded-markdown-viewer .markdown-preview a) {
    color: #2563eb;
    text-decoration: none;
  }

  :global(.embedded-markdown-viewer .markdown-preview a:hover) {
    text-decoration: underline;
  }

  :global(.embedded-markdown-viewer .markdown-preview img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.375em;
  }

  :global(.embedded-markdown-viewer .markdown-preview hr) {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 1em 0;
  }
</style>
