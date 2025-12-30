<script lang="ts">
  interface Props {
    open: boolean;
    onClose: () => void;
    onPrune: () => void;
    onCompact: () => void;
    onNewChat: () => void;
  }

  let { open, onClose, onPrune, onCompact, onNewChat }: Props = $props();
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50"
    onclick={(e) => e.target === e.currentTarget && onClose()}
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
      <!-- Header -->
      <div class="px-6 py-4 bg-amber-50 border-b border-amber-100">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-amber-100 rounded-lg">
            <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900">Context Limit Reached</h3>
            <p class="text-sm text-gray-600">The conversation is too long to continue</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="px-6 py-4">
        <p class="text-sm text-gray-600 mb-4">
          Choose how to reduce the context size:
        </p>

        <div class="space-y-2">
          <!-- Prune option -->
          <button
            onclick={() => { onPrune(); onClose(); }}
            class="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          >
            <div class="flex items-start gap-3">
              <span class="text-xl">✂️</span>
              <div>
                <p class="font-medium text-gray-900 group-hover:text-blue-700">Prune tool outputs</p>
                <p class="text-xs text-gray-500">Truncate old file reads & command outputs</p>
              </div>
            </div>
          </button>

          <!-- Compact option -->
          <button
            onclick={() => { onCompact(); onClose(); }}
            class="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors group"
          >
            <div class="flex items-start gap-3">
              <span class="text-xl">🧠</span>
              <div>
                <p class="font-medium text-gray-900 group-hover:text-purple-700">Compact context</p>
                <p class="text-xs text-gray-500">Let Claude summarize the conversation</p>
              </div>
            </div>
          </button>

          <!-- New chat option -->
          <button
            onclick={() => { onNewChat(); onClose(); }}
            class="w-full p-3 text-left rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors group"
          >
            <div class="flex items-start gap-3">
              <span class="text-xl">📝</span>
              <div>
                <p class="font-medium text-gray-900 group-hover:text-emerald-700">Start fresh</p>
                <p class="text-xs text-gray-500">Create a new chat (keeps this one)</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
