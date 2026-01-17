<script lang="ts">
  import FileAttachment from "./FileAttachment.svelte";
  import CopyButton from "./CopyButton.svelte";
  import MediaDisplay from "./MediaDisplay.svelte";
  import UserReferenceDisplay from "./UserReferenceDisplay.svelte";
  import TextSelectionContextMenu from "./TextSelectionContextMenu.svelte";
  import { parseUserMediaContent, type MediaItem } from "../media-parser";

  interface Props {
    content: string;
    timestamp: Date;
    isEditing?: boolean;
    editContent?: string;
    basePath?: string;
    onEdit?: () => void;
    onSaveEdit?: (content: string) => void;
    onCancelEdit?: () => void;
    onRollback?: () => void;
    onFork?: () => void;
    onDelete?: () => void;
    onPreview?: (path: string) => void;
    onQuoteText?: (text: string) => void;
    onForkWithQuote?: (text: string) => void;
    onAskCouncil?: (text: string) => void;
  }

  let {
    content,
    timestamp,
    isEditing = false,
    editContent = $bindable(""),
    basePath = '',
    onEdit,
    onSaveEdit,
    onCancelEdit,
    onRollback,
    onFork,
    onDelete,
    onPreview,
    onQuoteText,
    onForkWithQuote,
    onAskCouncil,
  }: Props = $props();

  let showDeleteConfirm = $state(false);

  let showMenu = $state(false);

  // Text selection context menu state
  let selectionMenu = $state<{ x: number; y: number; text: string } | null>(null);

  function handleContextMenu(e: MouseEvent) {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0) {
      e.preventDefault();
      selectionMenu = {
        x: e.clientX,
        y: e.clientY,
        text: selectedText,
      };
    }
  }

  function handleQuote(text: string) {
    onQuoteText?.(text);
    selectionMenu = null;
  }

  function handleForkWithQuote(text: string) {
    onForkWithQuote?.(text);
    selectionMenu = null;
  }

  interface ParsedContent {
    files: { path: string; name: string }[];
    segments: { type: 'text' | 'mention'; value: string; path?: string }[];
    mediaItems: MediaItem[];
    hasReferences: boolean;
    contentForReferences: string;
  }

  /**
   * Check if content has blockquote references (> ... > *Source: ...*)
   */
  function hasBlockquoteReferences(text: string): boolean {
    return /^>\s.*\n>\s\*Source:/m.test(text) || /^>\s.*\*Source:/m.test(text);
  }

  function parseContent(text: string): ParsedContent {
    const filePattern = /\[File: ([^\]]+)\]/g;
    const files: { path: string; name: string }[] = [];
    let match;

    while ((match = filePattern.exec(text)) !== null) {
      const path = match[1];
      const name = path.split("/").pop() || path;
      files.push({ path, name });
    }

    const { mediaItems, textContent: afterMedia } = parseUserMediaContent(text.replace(/\[File: [^\]]+\]\n*/g, ""));
    const cleanText = afterMedia.trim();

    // Check if this content has blockquote references
    const hasRefs = hasBlockquoteReferences(cleanText);

    const segments: { type: 'text' | 'mention'; value: string; path?: string }[] = [];
    const mentionPattern = /@([\w./-]+)/g;
    let lastIndex = 0;
    let mentionMatch;

    // Only parse @mentions if there are no blockquote references
    // (The UserReferenceDisplay will handle the full content including remaining text)
    if (!hasRefs) {
      while ((mentionMatch = mentionPattern.exec(cleanText)) !== null) {
        if (mentionMatch.index > lastIndex) {
          segments.push({ type: 'text', value: cleanText.slice(lastIndex, mentionMatch.index) });
        }
        const mentionValue = mentionMatch[1];
        const matchedFile = files.find(f => f.name === mentionValue || f.path.endsWith(mentionValue) || f.path.includes(mentionValue));
        segments.push({
          type: 'mention',
          value: mentionValue,
          path: matchedFile?.path || mentionValue
        });
        lastIndex = mentionPattern.lastIndex;
      }

      if (lastIndex < cleanText.length) {
        segments.push({ type: 'text', value: cleanText.slice(lastIndex) });
      }

      if (segments.length === 0 && cleanText) {
        segments.push({ type: 'text', value: cleanText });
      }
    }

    return {
      files,
      segments,
      mediaItems,
      hasReferences: hasRefs,
      contentForReferences: cleanText
    };
  }

  const parsed = $derived(parseContent(content));
</script>

<svelte:window onclick={() => showMenu = false} />

<div class="flex flex-col items-end gap-1 group relative" style="width:100%">
  {#if isEditing}
    <div class="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-2xl rounded-tr-sm p-3 max-w-[85%]">
      <textarea
        bind:value={editContent}
        class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-[15px] text-gray-900 dark:text-gray-100 focus:border-gray-400 focus:outline-none resize-none min-h-[60px]"
        rows="3"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <button onclick={onCancelEdit} class="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
          Cancel
        </button>
        <button onclick={() => onSaveEdit?.(editContent)} class="px-3 py-1 text-xs bg-gray-900 dark:bg-blue-600 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-blue-700 transition-colors">
          Save
        </button>
      </div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded-xl rounded-tr-sm text-sm leading-normal max-w-[85%] w-fit" oncontextmenu={handleContextMenu}>
      {#if parsed.files.length > 0}
        <div class="mb-2">
          <FileAttachment files={parsed.files} onPreview={onPreview} />
        </div>
      {/if}
      {#if parsed.mediaItems.length > 0}
        <div class="mb-2">
          <MediaDisplay items={parsed.mediaItems} layout={parsed.mediaItems.length === 1 ? 'single' : 'grid'} {basePath} />
        </div>
      {/if}
      {#if parsed.hasReferences}
        <!-- Use the new reference display for messages with blockquote references -->
        <UserReferenceDisplay
          content={parsed.contentForReferences}
          {basePath}
          {onPreview}
        />
      {:else if parsed.segments.length > 0}
        <div class="break-words whitespace-pre-wrap">{#each parsed.segments as segment}{#if segment.type === 'mention'}<button onclick={() => onPreview?.(segment.path || segment.value)} class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>{segment.value}</button>{:else}{segment.value}{/if}{/each}</div>
      {/if}
    </div>
    
    <div class="absolute -top-8 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm px-1 py-0.5">
      <CopyButton text={content} />
      <div class="relative">
        <button
          onclick={(e) => { e.stopPropagation(); showMenu = !showMenu; }}
          class="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 rounded transition-colors"
          title="More actions"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
          </svg>
        </button>
        {#if showMenu}
          <div class="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
            <button onclick={() => { onEdit?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
              Edit
            </button>
            <button onclick={() => { onRollback?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
              </svg>
              Rollback to here
            </button>
            <button onclick={() => { onFork?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
              </svg>
              Fork from here
            </button>
            <div class="border-t border-gray-100 dark:border-gray-700 my-1"></div>
            <button onclick={() => { showDeleteConfirm = true; showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
              Delete message
            </button>
          </div>
        {/if}
        {#if showDeleteConfirm}
          <div class="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50">
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">Delete this message?</p>
            <div class="flex justify-end gap-2">
              <button onclick={() => showDeleteConfirm = false} class="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                Cancel
              </button>
              <button onclick={() => { onDelete?.(); showDeleteConfirm = false; }} class="px-2 py-1 text-xs bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-800">
                Delete
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <span class="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
    {timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
  </span>
</div>

<!-- Text Selection Context Menu -->
{#if selectionMenu}
  <TextSelectionContextMenu
    x={selectionMenu.x}
    y={selectionMenu.y}
    selectedText={selectionMenu.text}
    onQuote={handleQuote}
    onForkWithQuote={handleForkWithQuote}
    onAskCouncil={onAskCouncil}
    onClose={() => selectionMenu = null}
  />
{/if}
