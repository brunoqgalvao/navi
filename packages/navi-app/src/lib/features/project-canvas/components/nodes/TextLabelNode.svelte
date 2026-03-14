<script lang="ts">
  import type { ProjectCanvasTextLabelData } from "../../types";

  type ResizeMode = "width" | "height" | "both";

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

  const MIN_WIDTH = 120;
  const MIN_HEIGHT = 48;

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

  function handleResizeStart(event: MouseEvent, mode: ResizeMode) {
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
      const newW =
        mode === "height" ? resizeStartW : Math.max(MIN_WIDTH, resizeStartW + dx);
      const newH =
        mode === "width" ? resizeStartH : Math.max(MIN_HEIGHT, resizeStartH + dy);
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

  function handleRemovePointerDown(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
  }

  function handleRemoveClick(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    data.onRemove?.();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group relative"
  style="width: {Math.max(MIN_WIDTH, data.width)}px; min-height: {Math.max(MIN_HEIGHT, data.height)}px;"
>
  {#if selected || editing || resizing}
    <div class="pointer-events-none absolute inset-0 rounded-2xl border-2 border-sky-400/75 shadow-[0_0_0_1px_rgba(56,189,248,0.16)]"></div>
  {/if}

  <div class="relative">
    {#if editing}
      <textarea
        bind:this={textareaEl}
        bind:value={editText}
        onblur={commitEdit}
        onkeydown={handleKeydown}
        class="nodrag w-full resize-none bg-transparent px-3 py-2 text-[20px] font-medium leading-[1.12] tracking-[-0.025em] text-slate-800 outline-none placeholder:text-slate-300"
        style="min-height: {Math.max(MIN_HEIGHT, data.height)}px;"
        placeholder="Type text..."
      ></textarea>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="cursor-grab select-none whitespace-pre-wrap break-words px-3 py-2 text-[20px] font-medium leading-[1.12] tracking-[-0.025em] text-slate-800 transition-colors hover:text-slate-950 active:cursor-grabbing"
        style="min-height: {Math.max(MIN_HEIGHT, data.height)}px;"
        ondblclick={(event) => {
          event.stopPropagation();
          startEdit();
        }}
      >
        {data.text || "Double-click to edit"}
      </div>
    {/if}
  </div>

  {#if selected || editing || resizing}
    <button
      type="button"
      class="nodrag absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
      onmousedown={handleRemovePointerDown}
      onclick={handleRemoveClick}
      title="Remove text"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="nodrag absolute right-[-7px] top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-sky-400 bg-white shadow-sm"
      onmousedown={(event) => handleResizeStart(event, "width")}
    ></div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="nodrag absolute bottom-[-7px] left-1/2 h-4 w-4 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-sky-400 bg-white shadow-sm"
      onmousedown={(event) => handleResizeStart(event, "height")}
    ></div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="nodrag absolute bottom-[-8px] right-[-8px] h-4 w-4 cursor-se-resize rounded-full border-2 border-sky-500 bg-white shadow-sm"
      onmousedown={(event) => handleResizeStart(event, "both")}
    ></div>
  {/if}
</div>
