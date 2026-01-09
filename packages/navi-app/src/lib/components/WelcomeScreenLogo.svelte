<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    onComplete: () => void;
    duration?: number;
  }

  let { onComplete, duration = 2800 }: Props = $props();

  let phase = $state<"draw" | "hold" | "fade" | "reveal" | "done">("draw");

  onMount(() => {
    setTimeout(() => {
      phase = "hold";
    }, 1000);

    setTimeout(() => {
      phase = "fade";
    }, 1500);

    setTimeout(() => {
      phase = "reveal";
    }, 2000);

    setTimeout(() => {
      phase = "done";
      onComplete();
    }, duration);
  });
</script>

<div 
  class="fixed inset-0 z-[200] flex items-center justify-center bg-white dark:bg-gray-900 transition-opacity duration-500"
  class:opacity-0={phase === "done"}
  class:pointer-events-none={phase === "done"}
>
  <div class="logo-container">
    <svg 
      width="160" 
      height="120" 
      viewBox="0 0 160 120" 
      class="logo-svg"
      class:fade-out={phase === "fade" || phase === "reveal" || phase === "done"}
    >
      <g stroke="#3f3f46" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path 
          d="M 35 30 L 10 60 L 35 90" 
          class="bracket left-bracket"
          class:draw={phase !== "done"}
        />
        
        <path 
          d="M 70 95 L 90 25" 
          class="slash"
          class:draw={phase !== "done"}
        />
        
        <path 
          d="M 125 30 L 150 60 L 125 90" 
          class="bracket right-bracket"
          class:draw={phase !== "done"}
        />
      </g>
    </svg>
    
    <div class="navi-text" class:show={phase === "reveal" || phase === "done"}>Navi</div>
  </div>
</div>

<style>
  .logo-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }

  .logo-svg {
    transition: opacity 0.4s ease, transform 0.4s ease;
  }

  .logo-svg.fade-out {
    opacity: 0;
    transform: scale(0.7);
  }

  :global(.dark) .logo-svg g {
    stroke: #d4d4d8;
  }

  .left-bracket {
    stroke-dasharray: 180;
    stroke-dashoffset: 180;
  }

  .slash {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
  }

  .right-bracket {
    stroke-dasharray: 180;
    stroke-dashoffset: 180;
  }

  .left-bracket.draw {
    animation: draw-left 0.5s ease-out forwards;
  }

  .slash.draw {
    animation: draw-slash 0.35s ease-out 0.25s forwards;
  }

  .right-bracket.draw {
    animation: draw-right 0.5s ease-out 0.4s forwards;
  }

  @keyframes draw-left {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes draw-slash {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes draw-right {
    to {
      stroke-dashoffset: 0;
    }
  }

  .navi-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.9);
    font-size: 1.75rem;
    font-weight: 600;
    color: #18181b;
    letter-spacing: -0.02em;
    opacity: 0;
    transition: opacity 0.4s ease, transform 0.4s ease;
  }

  :global(.dark) .navi-text {
    color: #f5f5f5;
  }

  .navi-text.show {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
</style>
