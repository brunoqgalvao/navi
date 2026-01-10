<script lang="ts">
  interface Props {
    size?: "sm" | "md" | "lg";
    label?: string;
    class?: string;
  }

  let { size = "md", label, class: className = "" }: Props = $props();

  const sizeMap = {
    sm: { width: 24, height: 16, stroke: 1.5 },
    md: { width: 32, height: 20, stroke: 2 },
    lg: { width: 48, height: 28, stroke: 2.5 },
  };

  const dims = $derived(sizeMap[size]);
</script>

<span class="inline-flex items-center gap-2 {className}">
  <svg
    width={dims.width}
    height={dims.height}
    viewBox="0 0 48 28"
    fill="none"
    class="doodle-svg"
  >
    <!-- Main scribble path - animated stroke -->
    <path
      class="doodle-line"
      d="M4 14 Q8 6, 12 14 T20 14 T28 14 T36 14 T44 14"
      stroke="currentColor"
      stroke-width={dims.stroke}
      stroke-linecap="round"
      fill="none"
    />
    <!-- Secondary wavy line -->
    <path
      class="doodle-line-2"
      d="M6 18 Q10 22, 14 18 T22 18 T30 18 T38 18"
      stroke="currentColor"
      stroke-width={dims.stroke * 0.7}
      stroke-linecap="round"
      fill="none"
      opacity="0.5"
    />
    <!-- Little spiral doodle -->
    <path
      class="doodle-spiral"
      d="M40 8 Q42 6, 44 8 Q46 10, 44 12 Q42 14, 40 12 Q38 10, 40 8"
      stroke="currentColor"
      stroke-width={dims.stroke * 0.6}
      stroke-linecap="round"
      fill="none"
      opacity="0.6"
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

  .doodle-line {
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    animation: doodle-draw 1.2s ease-in-out infinite;
  }

  .doodle-line-2 {
    stroke-dasharray: 50;
    stroke-dashoffset: 50;
    animation: doodle-draw-2 1.4s ease-in-out infinite;
    animation-delay: 0.2s;
  }

  .doodle-spiral {
    stroke-dasharray: 30;
    stroke-dashoffset: 30;
    animation: doodle-spiral 1s ease-in-out infinite;
    animation-delay: 0.4s;
  }

  @keyframes doodle-draw {
    0% {
      stroke-dashoffset: 60;
      opacity: 0.3;
    }
    50% {
      stroke-dashoffset: 0;
      opacity: 1;
    }
    100% {
      stroke-dashoffset: -60;
      opacity: 0.3;
    }
  }

  @keyframes doodle-draw-2 {
    0% {
      stroke-dashoffset: 50;
      opacity: 0.2;
    }
    50% {
      stroke-dashoffset: 0;
      opacity: 0.6;
    }
    100% {
      stroke-dashoffset: -50;
      opacity: 0.2;
    }
  }

  @keyframes doodle-spiral {
    0%, 100% {
      stroke-dashoffset: 30;
      transform: rotate(0deg);
      transform-origin: 42px 10px;
    }
    50% {
      stroke-dashoffset: 0;
      transform: rotate(180deg);
      transform-origin: 42px 10px;
    }
  }
</style>
