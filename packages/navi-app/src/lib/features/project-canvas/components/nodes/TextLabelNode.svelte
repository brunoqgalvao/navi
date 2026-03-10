<script lang="ts">
  import type { ProjectCanvasTextLabelData } from "../../types";

  interface Props {
    data: ProjectCanvasTextLabelData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  let editing = $state(false);
  let editText = $state("");
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let resizing = $state(false);
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartW = 0;
  let resizeStartH = 0;

  const MIN_WIDTH = 100;
  const MIN_HEIGHT = 40;

  function startEdit() {
    editText = data.text;
    editing = true;
    requestAnimationFrame(() => {
      textareaEl?.focus();
      textareaEl?.select();
    });
  }

  function commitEdit() {
    editing = false;
    const trimmed = editText.trim();
    if (trimmed !== data.text) {
      data.onTextChange?.(trimmed || "Label");
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitEdit();
    }
    if (event.key === "Escape") {
      editing = false;
    }
  }

  function handleResizeStart(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    resizing = true;
    resizeStartX = event.clientX;
    resizeStartY = event.clientY;
    resizeStartW = data.width;
    resizeStartH = data.height;

    function onMouseMove(e: MouseEvent) {
      const dx = e.clientX - resizeStartX;
      const dy = e.clientY - resizeStartY;
      const newW = Math.max(MIN_WIDTH, resizeStartW + dx);
      const newH = Math.max(MIN_HEIGHT, resizeStartH + dy);
      data.onResize?.(newW, newH);
    }

    function onMouseUp() {
      resizing = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group relative nodrag"
  style="width: {data.width}px; min-height: {data.height}px;"
>
  <div
    class={`relative rounded-xl border bg-white/90 backdrop-blur shadow-sm transition-all ${
      selected
        ? "border-slate-900 ring-2 ring-slate-900/10"
        : "border-slate-200/80 hover:border-slate-300"
    }`}
    style="min-height: {data.height}px;"
  >
    {#if editing}
      <textarea
        bind:this={textareaEl}
        bind:value={editText}
        onblur={commitEdit}
        onkeydown={handleKeydown}
        class="w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        style="min-height: {data.height - 8}px;"
        placeholder="Type a label..."
      ></textarea>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="cursor-text whitespace-pre-wrap break-words px-3 py-2 text-sm text-slate-800"
        style="min-height: {data.height - 8}px;"
        ondblclick={startEdit}
      >
        {data.text || "Double-click to edit"}
      </div>
    {/if}

    <!-- Remove button -->
    <button
      type="button"
      class="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:flex"
      onclick={(e) => {
        e.stopPropagation();
        data.onRemove?.();
      }}
      title="Remove label"
    >
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- Resize handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize opacity-0 transition-opacity group-hover:opacity-100"
    onmousedown={handleResizeStart}
  >
    <svg class="h-4 w-4 text-slate-400" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="12" cy="8" r="1.5" />
    </svg>
  </div>
</div>
