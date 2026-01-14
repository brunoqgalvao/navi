<script lang="ts">
  /**
   * Navi Context MCP Widget
   *
   * Beautiful UIs for context-awareness tools:
   * - view_processes: Shows process list or specific process logs
   * - view_terminal: Shows terminal output viewer
   * - wait: Shows countdown timer with reason
   */

  interface Props {
    toolName: string;
    input: Record<string, any>;
    result?: { content: string; is_error?: boolean };
    compact?: boolean;
  }

  let { toolName, input, result, compact = false }: Props = $props();

  const hasResult = $derived(!!result);
  const hasError = $derived(result?.is_error === true);
  const isSuccess = $derived(hasResult && !hasError);

  // Parse result for process/terminal data
  function parseResult(): any {
    if (!result?.content) return null;
    try {
      return JSON.parse(result.content);
    } catch {
      return result.content;
    }
  }

  const parsedResult = $derived(parseResult());

  // Process status colors
  const processStatusConfig: Record<string, { color: string; bgColor: string }> = {
    running: { color: 'text-green-600', bgColor: 'bg-green-100' },
    completed: { color: 'text-blue-600', bgColor: 'bg-blue-100' },
    failed: { color: 'text-red-600', bgColor: 'bg-red-100' },
    killed: { color: 'text-gray-600', bgColor: 'bg-gray-100' },
  };
</script>

{#if compact}
  <!-- Compact pill view -->
  <div class="flex items-center gap-2 px-2 py-1 text-xs rounded-md border
    {toolName === 'wait' ? 'border-amber-200 bg-amber-50/50' : 'border-cyan-200 bg-cyan-50/50'}">
    <span class="text-sm">
      {toolName === 'view_processes' ? '⚙️' :
       toolName === 'view_terminal' ? '💻' :
       toolName === 'wait' ? '⏱️' : '📊'}
    </span>
    <span class="font-medium text-gray-700">
      {toolName === 'view_processes' ? 'Processes' :
       toolName === 'view_terminal' ? 'Terminal' :
       toolName === 'wait' ? 'Waiting' : toolName}
    </span>
    <span class="text-gray-500 truncate">
      {#if toolName === 'view_processes'}
        {input.processId ? `#${input.processId.slice(0, 6)}` : input.status || 'all'}
      {:else if toolName === 'view_terminal'}
        {input.terminalId ? `#${input.terminalId.slice(0, 6)}` : 'list'}
      {:else if toolName === 'wait'}
        {input.seconds}s
      {/if}
    </span>
    {#if hasResult}
      <span class="{isSuccess ? 'text-green-500' : 'text-red-500'}">
        {isSuccess ? '✓' : '✗'}
      </span>
    {:else}
      <span class="w-2.5 h-2.5 border border-gray-300 border-t-transparent rounded-full animate-spin"></span>
    {/if}
  </div>

{:else if toolName === 'view_processes'}
  <!-- View Processes -->
  <div class="rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-cyan-100 bg-cyan-50/50">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-md bg-cyan-100">
          <svg class="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-cyan-800">
              {input.processId ? 'View Process Logs' : 'List Processes'}
            </span>
            {#if input.status}
              <span class="text-xs px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">
                {input.status}
              </span>
            {/if}
          </div>
          {#if input.processId}
            <div class="text-xs text-cyan-600 font-mono">#{input.processId.slice(0, 8)}</div>
          {/if}
        </div>
      </div>
    </div>

    <div class="p-3">
      {#if input.processId}
        <!-- Viewing specific process -->
        <div class="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-100 max-h-48 overflow-auto">
          {#if parsedResult}
            {#if typeof parsedResult === 'string'}
              <pre class="whitespace-pre-wrap">{parsedResult}</pre>
            {:else if parsedResult.output || parsedResult.logs}
              <pre class="whitespace-pre-wrap">{parsedResult.output || parsedResult.logs}</pre>
            {:else}
              <pre class="whitespace-pre-wrap">{JSON.stringify(parsedResult, null, 2)}</pre>
            {/if}
          {:else if !hasResult}
            <div class="flex items-center gap-2 text-gray-400">
              <span class="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
              Loading logs...
            </div>
          {:else}
            <span class="text-gray-500">No output</span>
          {/if}
        </div>
        {#if input.lines}
          <div class="mt-2 text-xs text-gray-500">
            Showing last {input.lines} lines
          </div>
        {/if}
      {:else}
        <!-- Process list -->
        {#if parsedResult && Array.isArray(parsedResult)}
          <div class="space-y-2">
            {#each parsedResult.slice(0, 5) as proc}
              {@const statusConf = processStatusConfig[proc.status] || processStatusConfig.running}
              <div class="flex items-center gap-3 p-2 bg-white rounded border border-gray-100">
                <div class="w-2 h-2 rounded-full {statusConf.bgColor}"></div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-mono text-gray-700 truncate">{proc.command || proc.id}</div>
                  <div class="text-[10px] text-gray-400">{proc.status}</div>
                </div>
              </div>
            {/each}
            {#if parsedResult.length > 5}
              <div class="text-xs text-gray-400 text-center">
                +{parsedResult.length - 5} more processes
              </div>
            {/if}
          </div>
        {:else if !hasResult}
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span class="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
            Loading processes...
          </div>
        {:else}
          <div class="text-sm text-gray-500">No processes found</div>
        {/if}
      {/if}
    </div>
  </div>

{:else if toolName === 'view_terminal'}
  <!-- View Terminal -->
  <div class="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-purple-100 bg-purple-50/50">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-md bg-purple-100">
          <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-purple-800">
              {input.terminalId ? 'View Terminal Output' : 'List Terminals'}
            </span>
            {#if input.checkErrors}
              <span class="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                errors only
              </span>
            {/if}
          </div>
          {#if input.terminalId}
            <div class="text-xs text-purple-600 font-mono">#{input.terminalId.slice(0, 8)}</div>
          {/if}
        </div>
      </div>
    </div>

    <div class="p-3">
      {#if input.terminalId}
        <!-- Terminal output -->
        <div class="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-100 max-h-48 overflow-auto">
          {#if parsedResult}
            {#if typeof parsedResult === 'string'}
              <pre class="whitespace-pre-wrap">{parsedResult}</pre>
            {:else if parsedResult.output}
              <pre class="whitespace-pre-wrap">{parsedResult.output}</pre>
            {:else}
              <pre class="whitespace-pre-wrap">{JSON.stringify(parsedResult, null, 2)}</pre>
            {/if}
          {:else if !hasResult}
            <div class="flex items-center gap-2 text-gray-400">
              <span class="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
              Loading terminal output...
            </div>
          {:else}
            <span class="text-gray-500">No output</span>
          {/if}
        </div>
        {#if input.lines}
          <div class="mt-2 text-xs text-gray-500">
            Showing last {input.lines} lines
          </div>
        {/if}
      {:else}
        <!-- Terminal list -->
        {#if parsedResult && Array.isArray(parsedResult)}
          <div class="space-y-2">
            {#each parsedResult.slice(0, 5) as term}
              <div class="flex items-center gap-3 p-2 bg-white rounded border border-gray-100">
                <div class="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs">💻</div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-mono text-gray-700 truncate">{term.name || term.id}</div>
                  {#if term.cwd}
                    <div class="text-[10px] text-gray-400 truncate">{term.cwd}</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else if !hasResult}
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span class="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
            Loading terminals...
          </div>
        {:else}
          <div class="text-sm text-gray-500">No terminals found</div>
        {/if}
      {/if}
    </div>
  </div>

{:else if toolName === 'wait'}
  <!-- Wait -->
  <div class="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-amber-100 bg-amber-50/50">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-md bg-amber-100">
          <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-amber-800">
              {isSuccess ? 'Waited' : 'Waiting'}
            </span>
            <span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              {input.seconds}s
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="p-3">
      {#if input.reason}
        <div class="bg-white rounded-lg border border-amber-100 p-3">
          <p class="text-sm text-gray-700">{input.reason}</p>
        </div>
      {/if}

      {#if !hasResult}
        <!-- Countdown visualization -->
        <div class="mt-3 flex items-center gap-3">
          <div class="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
            <div class="h-full bg-amber-500 animate-pulse" style="width: 50%"></div>
          </div>
          <div class="text-xs text-amber-600 font-mono">
            <span class="inline-flex items-center gap-1">
              <span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
              {input.seconds}s
            </span>
          </div>
        </div>
      {:else if isSuccess}
        <div class="mt-2 text-xs text-green-600 flex items-center gap-1">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          Wait completed
        </div>
      {/if}
    </div>

    {#if hasError && result?.content}
      <div class="px-3 pb-3">
        <div class="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
          {result.content}
        </div>
      </div>
    {/if}
  </div>

{:else}
  <!-- Fallback -->
  <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
    <div class="flex items-center gap-2 text-sm text-gray-600">
      <span>📊</span>
      <span class="font-medium">{toolName}</span>
    </div>
    <pre class="mt-2 text-xs text-gray-500 overflow-x-auto">{JSON.stringify(input, null, 2)}</pre>
  </div>
{/if}
