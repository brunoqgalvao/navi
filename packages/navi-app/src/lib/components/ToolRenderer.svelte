<script lang="ts">
  import type { ToolUseBlock } from "../claude";
  import JsonTreeViewer from "./JsonTreeViewer.svelte";
  import WritePreview from "./tools/WritePreview.svelte";
  import EditPreview from "./tools/EditPreview.svelte";
  import WebSearchPreview from "./tools/WebSearchPreview.svelte";
  import WebFetchPreview from "./tools/WebFetchPreview.svelte";

  interface Props {
    tool: ToolUseBlock;
    toolResult?: { content: string; is_error?: boolean };
    onPreview?: (path: string) => void;
    compact?: boolean;
    index?: number;
    hideHeader?: boolean;
  }

  let { tool, toolResult, onPreview, compact = false, index, hideHeader = false }: Props = $props();
  
  const input = $derived(tool.input || {});

  const toolIcons: Record<string, string> = {
    Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    MultiEdit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    WebFetch: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
    WebSearch: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    TodoWrite: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    NotebookEdit: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    Skill: "M13 10V3L4 14h7v7l9-11h-7z",
  };

  const toolColors: Record<string, string> = {
    Read: "text-blue-500",
    Write: "text-green-500",
    Edit: "text-amber-500",
    MultiEdit: "text-amber-500",
    Bash: "text-purple-500",
    Glob: "text-cyan-500",
    Grep: "text-cyan-500",
    WebFetch: "text-indigo-500",
    WebSearch: "text-indigo-500",
    Task: "text-orange-500",
    TodoWrite: "text-pink-500",
    NotebookEdit: "text-teal-500",
    Skill: "text-amber-500",
  };

  function getIcon(name: string): string {
    return toolIcons[name] || "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z";
  }

  function getColor(name: string): string {
    return toolColors[name] || "text-gray-500";
  }

  function isSkillRead(): boolean {
    if (tool.name !== "Read") return false;
    const path = input.file_path || "";
    return path.includes("/skills/") && path.endsWith("SKILL.md");
  }

  function getSkillName(): string {
    const path = input.file_path || "";
    const match = path.match(/\/skills\/([^/]+)\/SKILL\.md$/);
    return match ? match[1] : "unknown";
  }

  function getFileName(path: string): string {
    return path?.split("/").pop() || path || "";
  }

  function truncatePath(path: string, maxLen = 60): string {
    if (!path || path.length <= maxLen) return path;
    const parts = path.split("/");
    if (parts.length <= 3) return path;
    return `.../${parts.slice(-3).join("/")}`;
  }

  function formatCommand(cmd: string, maxLen = 200): string {
    if (!cmd) return "";
    if (cmd.length > maxLen) return cmd.slice(0, maxLen) + "...";
    return cmd;
  }

  function getCompactSummary(): string {
    switch (tool.name) {
      case "Read":
        if (isSkillRead()) return `skill: ${getSkillName()}`;
        return getFileName(input.file_path || "");
      case "Write":
        return getFileName(input.file_path || "");
      case "Edit":
      case "MultiEdit":
        return getFileName(input.file_path || "");
      case "Bash":
        return formatCommand(input.command || "", 50);
      case "Glob":
        return input.pattern || "";
      case "Grep":
        return input.pattern || "";
      case "WebFetch":
        try { return new URL(input.url || "").hostname; } catch { return input.url || ""; }
      case "WebSearch":
        return input.query || "";
      case "TodoWrite":
        return `${input.todos?.length || 0} items`;
      case "Skill":
        return input.skill || input.command || input.name || "";
      default:
        return "";
    }
  }

  function shouldUseJsonTree(input: any): boolean {
    if (!input || typeof input !== 'object') return false;
    if (Array.isArray(input)) return input.length > 0;
    return Object.keys(input).length > 0;
  }
</script>

{#if compact}
  <div class="flex items-center gap-2 py-1 px-2 rounded border border-gray-200 bg-gray-50/50 text-xs">
    {#if index !== undefined}
      <span class="text-[10px] text-gray-400 font-mono w-4">#{index + 1}</span>
    {/if}
    <svg class={`w-3 h-3 ${getColor(tool.name)} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={getIcon(tool.name)}></path>
    </svg>
    <span class="text-gray-500 font-medium">{tool.name}</span>
    <span class="text-gray-400 truncate">{getCompactSummary()}</span>
  </div>
{:else}
<div class="{hideHeader ? '' : 'mt-3 rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden'}">
  {#if !hideHeader}
  <div class="px-3 py-2 bg-gray-100/50 border-b border-gray-200 flex items-center gap-2">
    <div class="p-1 bg-white border border-gray-200 rounded shadow-sm">
      <svg class={`w-3 h-3 ${getColor(tool.name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={getIcon(tool.name)}></path>
      </svg>
    </div>
    <span class="text-xs font-medium text-gray-600 font-mono tracking-tight">{tool.name}</span>
  </div>
  {/if}

  <div class="{hideHeader ? '' : 'px-3 py-2 bg-gray-50'}">
    {#if tool.name === "Read" && isSkillRead()}
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Using skill:</span>
        <span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-md">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {getSkillName()}
        </span>
      </div>

    {:else if tool.name === "Read"}
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Reading</span>
        <button 
          onclick={() => onPreview?.(input.file_path)}
          class="text-xs font-mono text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md"
          title={input.file_path}
        >
          {truncatePath(input.file_path || "")}
        </button>
        {#if input.offset || input.limit}
          <span class="text-[10px] text-gray-400">
            (lines {input.offset || 0}-{(input.offset || 0) + (input.limit || 0)})
          </span>
        {/if}
      </div>

    {:else if tool.name === "Write"}
      <WritePreview
        filePath={input.file_path || ""}
        content={input.content || ""}
        {onPreview}
      />

    {:else if tool.name === "Edit" || tool.name === "MultiEdit"}
      <EditPreview
        filePath={input.file_path || ""}
        oldString={input.old_string}
        newString={input.new_string}
        edits={input.edits}
        replaceAll={input.replace_all}
        {onPreview}
      />

    {:else if tool.name === "Bash"}
      <div class="space-y-1">
        {#if input.description}
          <div class="text-xs text-gray-600">{input.description}</div>
        {/if}
        <div class="font-mono text-xs text-purple-700 bg-purple-50 rounded px-2 py-1.5 overflow-x-auto whitespace-pre">$ {formatCommand(input.command || "")}</div>
        {#if input.timeout}
          <div class="text-[10px] text-gray-400">timeout: {input.timeout}ms</div>
        {/if}
      </div>

    {:else if tool.name === "Glob"}
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-gray-500">Pattern:</span>
        <code class="text-xs font-mono text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">{input.pattern || ""}</code>
        {#if input.path}
          <span class="text-xs text-gray-500">in</span>
          <code class="text-xs font-mono text-gray-600 truncate max-w-xs">{truncatePath(input.path)}</code>
        {/if}
      </div>

    {:else if tool.name === "Grep"}
      <div class="space-y-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-500">Search:</span>
          <code class="text-xs font-mono text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">{input.pattern || ""}</code>
        </div>
        <div class="flex items-center gap-2 flex-wrap text-[10px] text-gray-400">
          {#if input.path}
            <span>in {truncatePath(input.path, 40)}</span>
          {/if}
          {#if input.glob}
            <span>glob: {input.glob}</span>
          {/if}
          {#if input.type}
            <span>type: {input.type}</span>
          {/if}
        </div>
      </div>

    {:else if tool.name === "WebFetch"}
      <WebFetchPreview
        url={input.url || ""}
        prompt={input.prompt}
        resultContent={toolResult?.content}
        isError={toolResult?.is_error}
      />

    {:else if tool.name === "WebSearch"}
      <WebSearchPreview
        query={input.query || ""}
        allowedDomains={input.allowed_domains}
        blockedDomains={input.blocked_domains}
        resultContent={toolResult?.content}
        isError={toolResult?.is_error}
      />

    {:else if tool.name === "TodoWrite"}
      <div class="text-xs text-gray-500">Updated execution plan ({input.todos?.length || 0} items)</div>

    {:else if tool.name === "Skill"}
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Using skill:</span>
        <span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-md">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {input.skill || input.command || input.name || "unknown"}
        </span>
        {#if input.args}
          <span class="text-xs text-gray-500 font-mono">{input.args}</span>
        {/if}
      </div>

    {:else}
      {#if shouldUseJsonTree(input)}
        <JsonTreeViewer value={input} maxHeight="300px" />
      {:else}
        <pre class="font-mono text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(input, null, 2)}</pre>
      {/if}
    {/if}
  </div>
</div>
{/if}
