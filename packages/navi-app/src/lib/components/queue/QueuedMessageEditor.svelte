<script lang="ts">
  import type { QueuedMessage } from "../../stores/types";

  interface Props {
    message: QueuedMessage;
    onSave: (id: string, text: string) => void;
    onCancel: () => void;
  }

  let { message, onSave, onCancel }: Props = $props();

  let editText = $state(message.text);
  let textareaRef: HTMLTextAreaElement | null = $state(null);

  $effect(() => {
    if (textareaRef) {
      textareaRef.focus();
      textareaRef.select();
      adjustHeight(textareaRef);
    }
  });

  function adjustHeight(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  function handleSave() {
    if (editText.trim() && message.id) {
      onSave(message.id, editText.trim());
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 bg-black/10 z-50 flex items-center justify-center p-4"
  onclick={onCancel}
  onkeydown={(e) => e.key === "Escape" && onCancel()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden border border-gray-200"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="p-3">
      <textarea
        bind:this={textareaRef}
        bind:value={editText}
        onkeydown={handleKeydown}
        oninput={(e) => adjustHeight(e.currentTarget)}
        class="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded resize-none focus:outline-none focus:border-gray-400"
        rows="2"
        placeholder="Enter your message..."
      ></textarea>

      <div class="flex items-center justify-between mt-2">
        <span class="text-[10px] text-gray-400">
          {#if navigator.platform.includes("Mac")}
            ⌘↵ save · esc cancel
          {:else}
            ctrl+enter save · esc cancel
          {/if}
        </span>
        <div class="flex items-center gap-1.5">
          <button
            onclick={onCancel}
            class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={handleSave}
            disabled={!editText.trim()}
            class="px-2 py-1 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
