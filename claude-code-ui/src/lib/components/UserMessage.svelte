<script lang="ts">
  import FileAttachment from "./FileAttachment.svelte";
  import CopyButton from "./CopyButton.svelte";

  interface Props {
    content: string;
    timestamp: Date;
    isEditing?: boolean;
    editContent?: string;
    onEdit?: () => void;
    onSaveEdit?: (content: string) => void;
    onCancelEdit?: () => void;
    onRollback?: () => void;
    onFork?: () => void;
    onPreview?: (path: string) => void;
  }

  let { 
    content, 
    timestamp, 
    isEditing = false, 
    editContent = $bindable(""),
    onEdit, 
    onSaveEdit, 
    onCancelEdit, 
    onRollback, 
    onFork,
    onPreview 
  }: Props = $props();

  let showMenu = $state(false);

  interface ParsedContent {
    files: { path: string; name: string }[];
    segments: { type: 'text' | 'mention'; value: string; path?: string }[];
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
    
    const cleanText = text.replace(/\[File: [^\]]+\]\n*/g, "").trim();
    
    const segments: { type: 'text' | 'mention'; value: string; path?: string }[] = [];
    const mentionPattern = /@([\w./-]+)/g;
    let lastIndex = 0;
    let mentionMatch;
    
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
    
    return { files, segments };
  }

  const parsed = $derived(parseContent(content));
</script>

<svelte:window onclick={() => showMenu = false} />

<div class="flex flex-col items-end gap-1 group relative" style="width:100%">
  {#if isEditing}
    <div class="bg-gray-50 border border-gray-300 rounded-2xl rounded-tr-sm p-3 max-w-[85%]">
      <textarea
        bind:value={editContent}
        class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-[15px] text-gray-900 focus:border-gray-400 focus:outline-none resize-none min-h-[60px]"
        rows="3"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <button onclick={onCancelEdit} class="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 transition-colors">
          Cancel
        </button>
        <button onclick={() => onSaveEdit?.(editContent)} class="px-3 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
          Save
        </button>
      </div>
    </div>
  {:else}
    <div class="bg-gray-100 text-gray-900 px-5 py-3 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed max-w-[85%] w-fit">
      {#if parsed.files.length > 0}
        <div class="mb-2">
          <FileAttachment files={parsed.files} onPreview={onPreview} />
        </div>
      {/if}
      {#if parsed.segments.length > 0}
        <div class="break-words whitespace-pre-wrap">{#each parsed.segments as segment}{#if segment.type === 'mention'}<button onclick={() => onPreview?.(segment.path || segment.value)} class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>{segment.value}</button>{:else}{segment.value}{/if}{/each}</div>
      {/if}
    </div>
    
    <div class="absolute -top-8 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5">
      <CopyButton text={content} />
      <div class="relative">
        <button 
          onclick={(e) => { e.stopPropagation(); showMenu = !showMenu; }} 
          class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" 
          title="More actions"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
          </svg>
        </button>
        {#if showMenu}
          <div class="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
            <button onclick={() => { onEdit?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
              Edit
            </button>
            <button onclick={() => { onRollback?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
              </svg>
              Rollback to here
            </button>
            <button onclick={() => { onFork?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
              </svg>
              Fork from here
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <span class="text-[10px] text-gray-400 mt-1.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
    {timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
  </span>
</div>
