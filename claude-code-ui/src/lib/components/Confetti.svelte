<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    trigger?: boolean;
    onComplete?: () => void;
  }

  let { trigger = false, onComplete }: Props = $props();

  let pieces = $state<{ id: number; x: number; color: string; delay: number; size: number }[]>([]);
  let container: HTMLDivElement;

  const colors = [
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#f59e0b", // amber
    "#10b981", // emerald
    "#3b82f6", // blue
  ];

  function createConfetti() {
    const newPieces = [];
    for (let i = 0; i < 30; i++) {
      newPieces.push({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.3,
        size: 6 + Math.random() * 6,
      });
    }
    pieces = newPieces;

    setTimeout(() => {
      pieces = [];
      onComplete?.();
    }, 2000);
  }

  $effect(() => {
    if (trigger) {
      createConfetti();
    }
  });
</script>

{#if pieces.length > 0}
  <div bind:this={container} class="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
    {#each pieces as piece (piece.id)}
      <div
        class="confetti-piece rounded-sm"
        style="
          left: {piece.x}%;
          top: 40%;
          background-color: {piece.color};
          width: {piece.size}px;
          height: {piece.size}px;
          animation-delay: {piece.delay}s;
          animation-duration: {1 + Math.random() * 0.5}s;
        "
      ></div>
    {/each}
  </div>
{/if}
