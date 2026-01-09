<script lang="ts">
  /**
   * ExtensionIcon - Renders the appropriate icon for an extension
   */
  interface Props {
    icon: string;
    class?: string;
  }

  let { icon, class: className = "w-4 h-4" }: Props = $props();
</script>

{#if icon === "folder"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
{:else if icon === "globe"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
{:else if icon === "git-branch"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9" />
  </svg>
{:else if icon === "terminal"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
{:else if icon === "activity"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
{:else if icon === "layout-kanban"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
  </svg>
{:else if icon === "play"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polygon stroke-linecap="round" stroke-linejoin="round" stroke-width="2" points="5,3 19,12 5,21" />
  </svg>
{:else if icon === "zap"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
{:else if icon === "sliders"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="4" y1="21" x2="4" y2="14" stroke-width="2" stroke-linecap="round" />
    <line x1="4" y1="10" x2="4" y2="3" stroke-width="2" stroke-linecap="round" />
    <line x1="12" y1="21" x2="12" y2="12" stroke-width="2" stroke-linecap="round" />
    <line x1="12" y1="8" x2="12" y2="3" stroke-width="2" stroke-linecap="round" />
    <line x1="20" y1="21" x2="20" y2="16" stroke-width="2" stroke-linecap="round" />
    <line x1="20" y1="12" x2="20" y2="3" stroke-width="2" stroke-linecap="round" />
    <circle cx="4" cy="12" r="2" stroke-width="2" />
    <circle cx="12" cy="10" r="2" stroke-width="2" />
    <circle cx="20" cy="14" r="2" stroke-width="2" />
  </svg>
{:else if icon === "plug"}
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v4M8 3v4M16 3v4M5 7h14M6 7v5a6 6 0 0012 0V7M12 18v3" />
  </svg>
{:else}
  <!-- Fallback: puzzle piece -->
  <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
  </svg>
{/if}
