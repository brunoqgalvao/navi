<script lang="ts">
  import type { ProjectCanvasFileData } from "../../types";

  interface Props {
    data: ProjectCanvasFileData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  function getExtension(name: string): string {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()!.toUpperCase() : "FILE";
  }

  const extension = $derived(getExtension(data.name));
</script>

<article
  class={`w-[250px] rounded-[22px] border bg-[linear-gradient(160deg,rgba(248,250,252,0.98),rgba(255,255,255,0.94))] shadow-[0_18px_40px_rgba(15,23,42,0.07)] transition-all ${
    selected
      ? "border-sky-500 ring-2 ring-sky-500/15"
      : "border-slate-200 hover:border-slate-300"
  }`}
>
  <div class="p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-[11px] font-semibold tracking-[0.14em] text-sky-700">
          {extension}
        </div>
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-[0.18em] text-slate-400">Pinned file</div>
          <h3 class="mt-1 truncate text-[14px] font-semibold text-slate-900">{data.name}</h3>
          <p class="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{data.relativePath}</p>
        </div>
      </div>

      <button
        type="button"
        class="nodrag inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
        onclick={(event) => {
          event.stopPropagation();
          data.onRemove?.(data.filePath);
        }}
        title="Remove from canvas"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="mt-4 flex items-center justify-between gap-2">
      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
        Drag from Files panel
      </span>
      <button
        type="button"
        class="nodrag inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        onclick={(event) => {
          event.stopPropagation();
          data.onOpen?.(data.filePath);
        }}
      >
        <span>Preview</span>
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 5l8 7-8 7" />
        </svg>
      </button>
    </div>
  </div>
</article>
