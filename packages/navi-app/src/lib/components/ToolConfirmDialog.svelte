<script lang="ts">
  interface Props {
    tools: string[];
    toolInput?: Record<string, unknown>;
    message: string;
    onApprove: () => void;
    onDeny: () => void;
    onApproveAll: () => void;
  }

  let { tools, toolInput, message, onApprove, onDeny, onApproveAll }: Props = $props();

  function isDangerous(tool: string): boolean {
    return ["Bash", "Write", "Edit"].includes(tool);
  }

  const hasDangerousTools = $derived(tools.some(isDangerous));
  const toolName = $derived(tools[0] || "Unknown");
  
  const inputPreview = $derived(() => {
    if (!toolInput) return null;
    
    if (toolName === "Write") {
      return {
        label: "File",
        value: (toolInput as any).file_path || "unknown",
        content: (toolInput as any).content?.slice(0, 500),
      };
    }
    if (toolName === "Edit") {
      return {
        label: "File", 
        value: (toolInput as any).file_path || "unknown",
        oldContent: (toolInput as any).old_string?.slice(0, 200),
        newContent: (toolInput as any).new_string?.slice(0, 200),
      };
    }
    if (toolName === "Bash") {
      return {
        label: "Command",
        value: (toolInput as any).command || "unknown",
      };
    }
    return null;
  });
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
  <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
    <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
      <div class={`p-2 rounded-lg ${hasDangerousTools ? 'bg-amber-100' : 'bg-blue-100'}`}>
        {#if hasDangerousTools}
          <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        {:else}
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        {/if}
      </div>
      <div>
        <h3 class="font-semibold text-base text-gray-900">Permission Required</h3>
        <p class="text-sm text-gray-500">Claude wants to use <span class="font-medium text-gray-700">{toolName}</span></p>
      </div>
    </div>

    <div class="p-6 space-y-4 max-h-96 overflow-y-auto">
      {#if inputPreview()}
        {@const preview = inputPreview()}
        <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
          {#if preview?.label && preview?.value}
            <div>
              <p class="text-xs font-medium text-gray-500 mb-1">{preview.label}</p>
              <p class="text-sm font-mono text-gray-800 break-all">{preview.value}</p>
            </div>
          {/if}
          
          {#if toolName === "Write" && preview?.content}
            <div>
              <p class="text-xs font-medium text-gray-500 mb-1">Content preview</p>
              <pre class="text-xs font-mono text-gray-600 bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">{preview.content}{preview.content?.length >= 500 ? '...' : ''}</pre>
            </div>
          {/if}
          
          {#if toolName === "Edit" && (preview?.oldContent || preview?.newContent)}
            <div class="grid grid-cols-2 gap-2">
              {#if preview?.oldContent}
                <div>
                  <p class="text-xs font-medium text-red-500 mb-1">Remove</p>
                  <pre class="text-xs font-mono text-red-600 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto max-h-24 whitespace-pre-wrap">{preview.oldContent}{preview.oldContent?.length >= 200 ? '...' : ''}</pre>
                </div>
              {/if}
              {#if preview?.newContent}
                <div>
                  <p class="text-xs font-medium text-green-500 mb-1">Add</p>
                  <pre class="text-xs font-mono text-green-600 bg-green-50 border border-green-200 rounded p-2 overflow-x-auto max-h-24 whitespace-pre-wrap">{preview.newContent}{preview.newContent?.length >= 200 ? '...' : ''}</pre>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="text-sm text-gray-600">{message}</p>
        <div class="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500 mb-3">Tool:</p>
          <div class="flex flex-wrap gap-2">
            {#each tools as tool}
              <span class={`px-3 py-1.5 text-sm font-medium rounded-lg ${isDangerous(tool) ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                {tool}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if hasDangerousTools}
        <p class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This tool may modify files or execute commands on your system.
        </p>
      {/if}
    </div>

    <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between">
      <button
        onclick={onApproveAll}
        class="text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        Allow all for this chat
      </button>
      <div class="flex gap-2">
        <button
          onclick={onDeny}
          class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
        >
          Deny
        </button>
        <button
          onclick={onApprove}
          class={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-all active:scale-95 ${hasDangerousTools ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-900 hover:bg-black'}`}
        >
          Allow
        </button>
      </div>
    </div>
  </div>
</div>
