<script lang="ts">
  /**
   * ContextPanel - Compact Session Context Overview
   *
   * Emphasizes artifacts (files created/edited) with expandable sections
   * for files read, searches, commands, etc.
   */
  import { sessionMessages } from "$lib/stores/session";
  import type { ChatMessage } from "$lib/stores/types";
  import type { ContentBlock, ToolUseBlock } from "$lib/claude";

  interface Props {
    sessionId: string | null;
  }

  let { sessionId }: Props = $props();

  // Artifact types
  interface Artifact {
    path: string;
    name: string;
    type: "created" | "edited";
    timestamp: Date;
  }

  interface FileRead {
    path: string;
    name: string;
    timestamp: Date;
  }

  interface SearchItem {
    pattern: string;
    tool: string;
    timestamp: Date;
  }

  interface WebItem {
    url: string;
    type: "fetch" | "search";
    timestamp: Date;
  }

  interface CommandItem {
    command: string;
    timestamp: Date;
  }

  // UI state
  let expandedSections = $state<Set<string>>(new Set(["artifacts"]));

  // Get messages for current session
  let messages = $derived.by(() => {
    if (!sessionId) return [];
    let msgs: ChatMessage[] = [];
    sessionMessages.subscribe((map) => {
      msgs = map.get(sessionId) || [];
    })();
    return msgs;
  });

  // Parse all context items
  let artifacts = $derived.by(() => {
    const items: Artifact[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_use") {
          const toolUse = block as ToolUseBlock;
          const input = toolUse.input as Record<string, unknown>;

          if (toolUse.name === "Write") {
            const path = (input.file_path as string) || "";
            if (path && !seen.has(path)) {
              seen.add(path);
              items.push({
                path,
                name: path.split("/").pop() || path,
                type: "created",
                timestamp: msg.timestamp,
              });
            }
          } else if (toolUse.name === "Edit") {
            const path = (input.file_path as string) || "";
            if (path && !seen.has(path)) {
              seen.add(path);
              items.push({
                path,
                name: path.split("/").pop() || path,
                type: "edited",
                timestamp: msg.timestamp,
              });
            }
          }
        }
      }
    }

    return items.reverse();
  });

  let filesRead = $derived.by(() => {
    const items: FileRead[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_use") {
          const toolUse = block as ToolUseBlock;
          const input = toolUse.input as Record<string, unknown>;

          if (toolUse.name === "Read") {
            const path = (input.file_path as string) || "";
            if (path && !seen.has(path)) {
              seen.add(path);
              items.push({
                path,
                name: path.split("/").pop() || path,
                timestamp: msg.timestamp,
              });
            }
          }
        }
      }
    }

    return items.reverse();
  });

  let searches = $derived.by(() => {
    const items: SearchItem[] = [];

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_use") {
          const toolUse = block as ToolUseBlock;
          const input = toolUse.input as Record<string, unknown>;

          if (toolUse.name === "Grep" || toolUse.name === "Glob") {
            const pattern = (input.pattern as string) || "";
            if (pattern) {
              items.push({
                pattern,
                tool: toolUse.name,
                timestamp: msg.timestamp,
              });
            }
          }
        }
      }
    }

    return items.reverse();
  });

  let webItems = $derived.by(() => {
    const items: WebItem[] = [];

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_use") {
          const toolUse = block as ToolUseBlock;
          const input = toolUse.input as Record<string, unknown>;

          if (toolUse.name === "WebFetch") {
            const url = (input.url as string) || "";
            if (url) {
              items.push({ url, type: "fetch", timestamp: msg.timestamp });
            }
          } else if (toolUse.name === "WebSearch") {
            const query = (input.query as string) || "";
            if (query) {
              items.push({ url: query, type: "search", timestamp: msg.timestamp });
            }
          }
        }
      }
    }

    return items.reverse();
  });

  let commands = $derived.by(() => {
    const items: CommandItem[] = [];

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_use") {
          const toolUse = block as ToolUseBlock;
          const input = toolUse.input as Record<string, unknown>;

          if (toolUse.name === "Bash") {
            const command = (input.command as string) || "";
            if (command) {
              items.push({ command, timestamp: msg.timestamp });
            }
          }
        }
      }
    }

    return items.reverse();
  });

  function toggleSection(section: string) {
    if (expandedSections.has(section)) {
      expandedSections = new Set([...expandedSections].filter(s => s !== section));
    } else {
      expandedSections = new Set([...expandedSections, section]);
    }
  }

  function getFileIcon(type: "created" | "edited"): string {
    return type === "created" ? "+" : "~";
  }

  function getFileColor(type: "created" | "edited"): string {
    return type === "created"
      ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
      : "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
  }

  function truncate(str: string, len: number): string {
    if (str.length <= len) return str;
    return str.slice(0, len) + "...";
  }

  function truncatePath(path: string): string {
    const parts = path.split("/");
    if (parts.length <= 3) return path;
    return ".../" + parts.slice(-2).join("/");
  }
</script>

<div class="h-full flex flex-col bg-white dark:bg-gray-900 text-sm">
  <!-- Header -->
  <div class="p-3 border-b border-gray-200 dark:border-gray-700">
    <h2 class="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
      Context
    </h2>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if !sessionId}
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 p-4">
        <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-xs">No session</p>
      </div>
    {:else if messages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 p-4">
        <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p class="text-xs">Empty context</p>
      </div>
    {:else}
      <div class="p-2 space-y-1">
        <!-- Artifacts Section (Primary) -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onclick={() => toggleSection("artifacts")}
            class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Artifacts</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                {artifacts.length}
              </span>
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform {expandedSections.has('artifacts') ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if expandedSections.has("artifacts")}
            <div class="px-2 py-1 max-h-40 overflow-y-auto">
              {#if artifacts.length === 0}
                <p class="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">No files created or edited</p>
              {:else}
                {#each artifacts as artifact}
                  <div class="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 group" title={artifact.path}>
                    <span class="w-4 h-4 flex items-center justify-center rounded text-[10px] font-mono font-bold {getFileColor(artifact.type)}">
                      {getFileIcon(artifact.type)}
                    </span>
                    <span class="flex-1 truncate text-xs text-gray-700 dark:text-gray-300 font-mono">{artifact.name}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Files Read Section -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onclick={() => toggleSection("files")}
            class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Files Read</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {filesRead.length}
              </span>
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform {expandedSections.has('files') ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if expandedSections.has("files")}
            <div class="px-2 py-1 max-h-40 overflow-y-auto">
              {#if filesRead.length === 0}
                <p class="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">No files read</p>
              {:else}
                {#each filesRead as file}
                  <div class="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50" title={file.path}>
                    <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span class="flex-1 truncate text-xs text-gray-600 dark:text-gray-400 font-mono">{file.name}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Searches Section -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onclick={() => toggleSection("searches")}
            class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Searches</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                {searches.length}
              </span>
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform {expandedSections.has('searches') ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if expandedSections.has("searches")}
            <div class="px-2 py-1 max-h-40 overflow-y-auto">
              {#if searches.length === 0}
                <p class="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">No searches</p>
              {:else}
                {#each searches as search}
                  <div class="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <span class="text-[10px] px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-mono shrink-0">
                      {search.tool}
                    </span>
                    <code class="flex-1 truncate text-xs text-gray-600 dark:text-gray-400">{truncate(search.pattern, 30)}</code>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Web Section -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onclick={() => toggleSection("web")}
            class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Web</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                {webItems.length}
              </span>
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform {expandedSections.has('web') ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if expandedSections.has("web")}
            <div class="px-2 py-1 max-h-40 overflow-y-auto">
              {#if webItems.length === 0}
                <p class="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">No web activity</p>
              {:else}
                {#each webItems as item}
                  <div class="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <span class="text-[10px] px-1 py-0.5 rounded {item.type === 'search' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400'} font-mono shrink-0">
                      {item.type === "search" ? "search" : "fetch"}
                    </span>
                    <span class="flex-1 truncate text-xs text-gray-600 dark:text-gray-400">{truncate(item.url, 35)}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Commands Section -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onclick={() => toggleSection("commands")}
            class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="4 17 10 11 4 5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <line x1="12" y1="19" x2="20" y2="19" stroke-width="2" stroke-linecap="round" />
              </svg>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Commands</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                {commands.length}
              </span>
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform {expandedSections.has('commands') ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if expandedSections.has("commands")}
            <div class="px-2 py-1 max-h-40 overflow-y-auto">
              {#if commands.length === 0}
                <p class="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">No commands run</p>
              {:else}
                {#each commands as cmd}
                  <div class="px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <code class="text-xs text-gray-600 dark:text-gray-400 break-all">{truncate(cmd.command, 50)}</code>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Messages count footer -->
      <div class="mt-auto px-3 py-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
        {messages.length} messages in context
      </div>
    {/if}
  </div>
</div>
