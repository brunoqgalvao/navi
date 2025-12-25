<script lang="ts">
  interface MediaItem {
    type: 'image' | 'audio' | 'video';
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

  function resolveMediaSrc(src: string): string {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    let fullPath = src;
    if (!src.startsWith('/') && basePath) {
      fullPath = `${basePath}/${src}`;
    }
    return `http://localhost:3001/api/fs/read?path=${encodeURIComponent(fullPath)}&raw=true`;
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

  const imageItems = $derived(items.filter(i => i.type === 'image'));
  const audioItems = $derived(items.filter(i => i.type === 'audio'));
  const videoItems = $derived(items.filter(i => i.type === 'video'));

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
</div>

{#if lightboxOpen}
  <div
    class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
  >
    <button
      type="button"
      class="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
      onclick={closeLightbox}
      aria-label="Close lightbox"
    >
      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>

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
