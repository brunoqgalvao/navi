<script lang="ts">
  interface Props {
    size?: "sm" | "md" | "lg";
    label?: string;
    class?: string;
  }

  let { size = "md", label, class: className = "" }: Props = $props();

  const sizeMap = {
    sm: { width: 24, height: 12, stroke: 1.5 },
    md: { width: 32, height: 14, stroke: 2 },
    lg: { width: 44, height: 18, stroke: 2.5 },
  };

  const dims = $derived(sizeMap[size]);
</script>

<span class="inline-flex items-center gap-2 {className}">
  <svg
    width={dims.width}
    height={dims.height}
    viewBox="0 0 44 14"
    fill="none"
    class="doodle-svg"
  >
    <!-- Simple wavy scribble -->
    <path
      class="doodle-wave"
      d="M2 7 Q7 2, 12 7 T22 7 T32 7 T42 7"
      stroke="currentColor"
      stroke-width={dims.stroke}
      stroke-linecap="round"
      fill="none"
    />
  </svg>
  {#if label}
    <span class="text-xs text-gray-500 dark:text-gray-400">{label}</span>
  {/if}
</span>

<style>
  .doodle-svg {
    color: var(--doodle-color, #9ca3af);
  }

  :global(.dark) .doodle-svg {
    color: var(--doodle-color, #6b7280);
  }

  .doodle-wave {
    stroke-dasharray: 50;
    stroke-dashoffset: 50;
    animation: wave-draw 1s ease-in-out infinite;
  }

  @keyframes wave-draw {
    0% {
      stroke-dashoffset: 50;
      opacity: 0.3;
    }
    50% {
      stroke-dashoffset: 0;
      opacity: 1;
    }
    100% {
      stroke-dashoffset: -50;
      opacity: 0.3;
    }
  }
</style>
