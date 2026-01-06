<script lang="ts">
  import { getApiBase, isTauri } from "../config";
  import STLViewer from "./STLViewer.svelte";
  import GLBViewer from "./GLBViewer.svelte";
  import { get3DModelType } from "../media-parser";

  interface MediaItem {
    type: 'image' | 'audio' | 'video' | 'model3d';
    src: string;
    alt?: string;
    caption?: string;
  }

  interface Props {
    items: MediaItem[];
    layout?: 'grid' | 'column' | 'single';
    basePath?: string;
  }

  let { items, layout = 'grid', basePath = '' }: Props = $props();

  let shareStatus = $state<string | null>(null);

  function resolveMediaSrc(src: string): string {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    let fullPath = src;
    // If relative path and basePath is provided, join them
    if (!src.startsWith('/') && basePath) {
      fullPath = `${basePath}/${src}`;
    }
    const resolvedUrl = `${getApiBase()}/fs/read?path=${encodeURIComponent(fullPath)}&raw=true`;
    console.log("[MediaDisplay] Resolved media URL:", resolvedUrl, "from src:", src, "basePath:", basePath);
    return resolvedUrl;
  }

  let lightboxOpen = $state(false);
  let lightboxIndex = $state(0);

  function openLightbox(index: number) {
    lightboxIndex = index;
    lightboxOpen = true;
  }

  function closeLightbox() {
    lightboxOpen = false;
  }

  function nextImage() {
    const imageItems = items.filter(i => i.type === 'image');
    lightboxIndex = (lightboxIndex + 1) % imageItems.length;
  }

  function prevImage() {
    const imageItems = items.filter(i => i.type === 'image');
    lightboxIndex = (lightboxIndex - 1 + imageItems.length) % imageItems.length;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!lightboxOpen) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
  }

  // Get the original file path from a src (for local files)
  function getFilePath(src: string): string | null {
    // If it's already a file path
    if (src.startsWith('/') && !src.includes('?')) {
      return src;
    }
    // If it's served via our API
    if (src.includes('/fs/read?path=')) {
      const match = src.match(/path=([^&]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
    return null;
  }

  async function shareImage() {
    const currentItem = imageItems[lightboxIndex];
    if (!currentItem) return;

    const filePath = getFilePath(currentItem.src);
    if (!filePath) {
      shareStatus = "Can only share local files";
      setTimeout(() => shareStatus = null, 2000);
      return;
    }

    if (isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("share_file", { filePath });
        shareStatus = null;
      } catch (err) {
        console.error("Share failed:", err);
        shareStatus = "Share failed";
        setTimeout(() => shareStatus = null, 2000);
      }
    } else {
      shareStatus = "Sharing only available in app";
      setTimeout(() => shareStatus = null, 2000);
    }
  }

  async function copyImageToClipboard() {
    const currentItem = imageItems[lightboxIndex];
    if (!currentItem) return;

    const filePath = getFilePath(currentItem.src);
    if (!filePath) {
      shareStatus = "Can only copy local files";
      setTimeout(() => shareStatus = null, 2000);
      return;
    }

    if (isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("copy_image_to_clipboard", { filePath });
        shareStatus = "Copied to clipboard!";
        setTimeout(() => shareStatus = null, 2000);
      } catch (err) {
        console.error("Copy failed:", err);
        shareStatus = "Copy failed";
        setTimeout(() => shareStatus = null, 2000);
      }
    }
  }

  async function downloadImage() {
    const currentItem = imageItems[lightboxIndex];
    if (!currentItem) return;

    try {
      const response = await fetch(resolveMediaSrc(currentItem.src));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentItem.alt || 'image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      shareStatus = "Downloaded!";
      setTimeout(() => shareStatus = null, 2000);
    } catch (err) {
      console.error("Download failed:", err);
      shareStatus = "Download failed";
      setTimeout(() => shareStatus = null, 2000);
    }
  }

  const imageItems = $derived(items.filter(i => i.type === 'image'));
  const audioItems = $derived(items.filter(i => i.type === 'audio'));
  const videoItems = $derived(items.filter(i => i.type === 'video'));
  const model3dItems = $derived(items.filter(i => i.type === 'model3d'));

  const gridCols = $derived(
    imageItems.length === 1 ? 'grid-cols-1' :
    imageItems.length === 2 ? 'grid-cols-2' :
    imageItems.length === 3 ? 'grid-cols-3' :
    'grid-cols-2 md:grid-cols-3'
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="media-display space-y-3">
  {#if imageItems.length > 0}
    <div class={layout === 'grid' ? `grid ${gridCols} gap-2` : layout === 'column' ? 'flex flex-col gap-2' : ''}>
      {#each imageItems as item, idx}
        <button
          type="button"
          class="relative overflow-hidden rounded-lg bg-gray-100 hover:opacity-90 transition-opacity cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-blue-500"
          onclick={() => openLightbox(idx)}
        >
          <img
            src={resolveMediaSrc(item.src)}
            alt={item.alt || 'Image'}
            class="w-full h-auto max-h-64 object-cover"
            loading="lazy"
          />
          {#if item.caption}
            <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
              {item.caption}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if audioItems.length > 0}
    <div class="space-y-2">
      {#each audioItems as item}
        <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
          {#if item.caption}
            <div class="text-sm text-gray-600 mb-2">{item.caption}</div>
          {/if}
          <audio controls class="w-full" preload="metadata">
            <source src={resolveMediaSrc(item.src)} />
            Your browser does not support the audio element.
          </audio>
        </div>
      {/each}
    </div>
  {/if}

  {#if videoItems.length > 0}
    <div class="space-y-2">
      {#each videoItems as item}
        <div class="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
          {#if item.caption}
            <div class="text-sm text-gray-600 px-3 py-2 border-b border-gray-200">{item.caption}</div>
          {/if}
          <video controls class="w-full max-h-96" preload="metadata">
            <source src={resolveMediaSrc(item.src)} />
            Your browser does not support the video element.
          </video>
        </div>
      {/each}
    </div>
  {/if}

  {#if model3dItems.length > 0}
    <div class="space-y-3">
      {#each model3dItems as item}
        {@const modelType = get3DModelType(item.src)}
        <div class="rounded-lg overflow-hidden border border-gray-200 bg-gray-900">
          {#if item.caption}
            <div class="text-sm text-gray-300 px-3 py-2 border-b border-gray-700 flex items-center gap-2">
              <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path>
              </svg>
              {item.caption}
            </div>
          {/if}
          <div class="h-80 w-full">
            {#if modelType === 'stl'}
              <STLViewer src={resolveMediaSrc(item.src)} />
            {:else if modelType === 'glb'}
              <GLBViewer src={resolveMediaSrc(item.src)} />
            {:else}
              <div class="h-full flex items-center justify-center text-gray-400">
                <span>Unsupported 3D format</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if lightboxOpen}
  <div
    class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
  >
    <!-- Top toolbar -->
    <div class="absolute top-4 right-4 flex items-center gap-2 z-10">
      <!-- Share button -->
      <button
        type="button"
        class="p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-colors"
        onclick={shareImage}
        aria-label="Share image"
        title="Share"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
        </svg>
      </button>

      <!-- Copy to clipboard button -->
      <button
        type="button"
        class="p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-colors"
        onclick={copyImageToClipboard}
        aria-label="Copy to clipboard"
        title="Copy to clipboard"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
        </svg>
      </button>

      <!-- Download button -->
      <button
        type="button"
        class="p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-colors"
        onclick={downloadImage}
        aria-label="Download image"
        title="Download"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
      </button>

      <!-- Close button -->
      <button
        type="button"
        class="p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-colors"
        onclick={closeLightbox}
        aria-label="Close lightbox"
        title="Close"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <!-- Status toast -->
    {#if shareStatus}
      <div class="absolute top-16 right-4 bg-black/80 text-white px-4 py-2 rounded-lg text-sm z-20 animate-fade-in">
        {shareStatus}
      </div>
    {/if}

    {#if imageItems.length > 1}
      <button
        type="button"
        class="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-10"
        onclick={prevImage}
        aria-label="Previous image"
      >
        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
      </button>

      <button
        type="button"
        class="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-10"
        onclick={nextImage}
        aria-label="Next image"
      >
        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </button>
    {/if}

    <img
      src={resolveMediaSrc(imageItems[lightboxIndex]?.src || '')}
      alt={imageItems[lightboxIndex]?.alt || 'Image'}
      class="max-w-[90vw] max-h-[90vh] object-contain"
    />

    {#if imageItems[lightboxIndex]?.caption}
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
        {imageItems[lightboxIndex].caption}
      </div>
    {/if}

    {#if imageItems.length > 1}
      <div class="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
        {lightboxIndex + 1} / {imageItems.length}
      </div>
    {/if}
  </div>
{/if}
