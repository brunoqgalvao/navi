<script lang="ts">
  import { notifications } from "../stores";
  import { fly } from "svelte/transition";

  interface Props {
    requestId: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
    message: string;
    onApprove: (approveAll?: boolean) => void;
    onDeny: () => void;
  }

  let { requestId, toolName, toolInput, message, onApprove, onDeny }: Props = $props();

  let showDetails = $state(false);

  const toolIcons: Record<string, string> = {
    Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  };

  const icon = $derived(toolIcons[toolName] || "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z");

  function getInputPreview(): string {
    if (!toolInput) return "";
    if (toolName === "Bash" && toolInput.command) {
      return String(toolInput.command).slice(0, 100);
    }
    if ((toolName === "Write" || toolName === "Edit") && toolInput.file_path) {
      return String(toolInput.file_path);
    }
    if (toolName === "Read" && toolInput.file_path) {
      return String(toolInput.file_path);
    }
    return "";
  }

  const inputPreview = $derived(getInputPreview());
</script>

<div
  class="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 my-3"
  in:fly={{ y: 10, duration: 200 }}
>
  <div class="flex items-start gap-3">
    <div class="shrink-0 w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={icon} />
      </svg>
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-sm font-semibold text-purple-900">Permission Required</span>
        <span class="px-2 py-0.5 text-xs font-medium bg-purple-200 text-purple-800 rounded-full">{toolName}</span>
      </div>

      <p class="text-sm text-gray-700">{message}</p>

      {#if inputPreview}
        <div class="mt-2">
          <button
            onclick={() => showDetails = !showDetails}
            class="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
          >
            <svg class="w-3 h-3 transition-transform {showDetails ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            {showDetails ? "Hide details" : "Show details"}
          </button>

          {#if showDetails}
            <div class="mt-2 p-3 bg-white/50 border border-purple-100 rounded-lg">
              <code class="text-xs text-gray-700 break-all whitespace-pre-wrap font-mono">
                {#if toolName === "Bash"}
                  $ {toolInput?.command}
                {:else}
                  {JSON.stringify(toolInput, null, 2)}
                {/if}
              </code>
            </div>
          {/if}
        </div>
      {/if}

      <div class="flex flex-wrap gap-2 mt-3">
        <button
          onclick={() => onApprove(false)}
          class="px-4 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Allow
        </button>
        <button
          onclick={() => onApprove(true)}
          class="px-4 py-1.5 text-sm font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
        >
          Allow All
        </button>
        <button
          onclick={onDeny}
          class="px-4 py-1.5 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  </div>
</div>
