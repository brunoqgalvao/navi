<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    onComplete: () => void;
    duration?: number;
  }

  let { onComplete, duration = 2500 }: Props = $props();

  let phase = $state<"loading" | "reveal" | "done">("loading");

  onMount(() => {
    setTimeout(() => {
      phase = "reveal";
    }, duration - 600);

    setTimeout(() => {
      phase = "done";
      onComplete();
    }, duration);
  });
</script>

<div 
  class="fixed inset-0 z-[200] flex items-center justify-center bg-white transition-opacity duration-500"
  class:opacity-0={phase === "done"}
  class:pointer-events-none={phase === "done"}
>
  <div class="relative">
    <div class="orbit-container" class:scale-up={phase === "reveal"}>
      <svg width="120" height="120" viewBox="0 0 120 120" class="orbit-svg">
        <defs>
          <linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#000;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#000;stop-opacity:0" />
          </linearGradient>
        </defs>
        
        <circle 
          cx="60" 
          cy="60" 
          r="40" 
          fill="none" 
          stroke="url(#orbitGradient)" 
          stroke-width="3"
          stroke-linecap="round"
          class="orbit-path"
        />
      </svg>
      
      <div class="orbit-dot"></div>
      
      <div class="center-dot" class:pulse={phase === "loading"}></div>
    </div>
    
    {#if phase === "reveal"}
      <div class="absolute inset-0 flex items-center justify-center fade-in">
        <span class="text-2xl font-semibold text-gray-900 tracking-tight">Navi</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .orbit-container {
    position: relative;
    width: 120px;
    height: 120px;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s;
  }

  .orbit-container.scale-up {
    transform: scale(0);
    opacity: 0;
  }

  .orbit-svg {
    animation: rotate 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  .orbit-path {
    stroke-dasharray: 251;
    stroke-dashoffset: 180;
  }

  .orbit-dot {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #000;
    border-radius: 50%;
    top: 50%;
    left: 50%;
    margin-left: -6px;
    margin-top: -6px;
    transform: translateX(40px);
    animation: orbit 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    box-shadow: 
      0 0 0 2px rgba(0, 0, 0, 0.1),
      -4px 0 8px rgba(0, 0, 0, 0.15),
      -8px 0 12px rgba(0, 0, 0, 0.1),
      -12px 0 16px rgba(0, 0, 0, 0.05);
  }

  .center-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #000;
    border-radius: 50%;
    top: 50%;
    left: 50%;
    margin-left: -4px;
    margin-top: -4px;
  }

  .center-dot.pulse {
    animation: pulse-center 1.5s ease-in-out infinite;
  }

  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes orbit {
    from { transform: rotate(0deg) translateX(40px); }
    to { transform: rotate(360deg) translateX(40px); }
  }

  @keyframes pulse-center {
    0%, 100% { 
      transform: scale(1);
      opacity: 1;
    }
    50% { 
      transform: scale(1.3);
      opacity: 0.7;
    }
  }

  .fade-in {
    animation: fade-up 0.4s ease-out forwards;
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
