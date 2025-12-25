<script lang="ts">
  import type { Project } from "../api";
  import StarButton from "./StarButton.svelte";

  interface Props {
    project: Project;
    onclick: () => void;
    onTogglePin?: (e: Event) => void;
    relativeTime: (timestamp: number) => string;
    compact?: boolean;
  }

  let { project, onclick, onTogglePin, relativeTime, compact = false }: Props = $props();
</script>

{#if compact}
  <button 
    {onclick}
    class="group flex items-center w-full py-2.5 px-3 text-left rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-md hover:shadow-gray-100/50 transition-all duration-200"
  >
    <div class="flex items-center justify-center w-9 h-9 mr-3 text-gray-400 bg-gray-50 rounded-lg shrink-0 group-hover:bg-gray-100 group-hover:text-gray-600 transition-all">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
    </div>
    <div class="flex-1 min-w-0">
      <h4 class="text-sm font-medium text-gray-900 truncate">{project.name}</h4>
      <div class="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
        <span>{project.session_count || 0} chats</span>
        <span class="text-gray-300">·</span>
        <span>{relativeTime(project.last_activity || project.updated_at)}</span>
      </div>
    </div>
    <svg class="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7"></path></svg>
  </button>
{:else}
  <button 
    {onclick}
    class="group relative text-left p-5 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-xl hover:shadow-gray-100/50 transition-all duration-300 hover:-translate-y-0.5"
  >
    {#if onTogglePin}
      <div class="absolute top-4 right-4 z-10">
        <StarButton 
          active={!!project.pinned} 
          onclick={(e) => { e.stopPropagation(); onTogglePin?.(e); }}
        />
      </div>
    {/if}

    <div class="flex items-center justify-center w-11 h-11 text-gray-400 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl mb-4 group-hover:from-gray-100 group-hover:to-gray-150 transition-all">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
    </div>
    
    <h4 class="text-[15px] font-semibold text-gray-900 truncate mb-1 pr-8">{project.name}</h4>
    <p class="text-xs text-gray-400 truncate mb-4" title={project.path}>{project.path}</p>
    
    <div class="flex items-center justify-between pt-3 border-t border-gray-50">
      <div class="flex items-center gap-1.5 text-xs text-gray-500">
        <svg class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
        <span>{project.session_count || 0} chats</span>
      </div>
      <span class="text-[11px] text-gray-400">{relativeTime(project.last_activity || project.updated_at)}</span>
    </div>
  </button>
{/if}
