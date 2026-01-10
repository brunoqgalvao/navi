<script lang="ts">
  /**
   * DoodlePulse - A tiny animated scribble for inline status indicators
   * Replaces boring pulsing dots with personality
   */
  interface Props {
    size?: number;
    color?: string;
    class?: string;
  }

  let { size = 8, color = "currentColor", class: className = "" }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 12 12"
  fill="none"
  class="doodle-pulse {className}"
  style="color: {color}"
>
  <!-- Squiggly circle thing -->
  <path
    class="squiggle"
    d="M6 2 Q8 2, 9 4 Q10 6, 9 8 Q8 10, 6 10 Q4 10, 3 8 Q2 6, 3 4 Q4 2, 6 2"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    fill="none"
  />
</svg>

<style>
  .squiggle {
    stroke-dasharray: 24;
    animation: squiggle-draw 0.8s ease-in-out infinite;
  }

  @keyframes squiggle-draw {
    0% {
      stroke-dashoffset: 24;
      opacity: 0.4;
    }
    50% {
      stroke-dashoffset: 0;
      opacity: 1;
    }
    100% {
      stroke-dashoffset: -24;
      opacity: 0.4;
    }
  }
</style>
