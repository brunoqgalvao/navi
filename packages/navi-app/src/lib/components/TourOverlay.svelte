<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { tour, type TourStep } from "../stores";

  interface Props {
    tourSteps: Record<string, TourStep[]>;
  }

  let { tourSteps }: Props = $props();

  let tooltipEl: HTMLElement | null = $state(null);
  let targetRect = $state<DOMRect | null>(null);
  let tooltipPosition = $state({ top: 0, left: 0 });
  let arrowPosition = $state<"top" | "bottom" | "left" | "right">("bottom");

  const steps = $derived($tour.tourId ? tourSteps[$tour.tourId] || [] : []);
  const currentStep = $derived(steps[$tour.currentStep]);
  const isLastStep = $derived($tour.currentStep === steps.length - 1);
  const isFirstStep = $derived($tour.currentStep === 0);

  function updatePosition() {
    if (!currentStep) return;
    
    const target = document.querySelector(currentStep.target);
    if (!target) {
      targetRect = null;
      return;
    }

    const rect = target.getBoundingClientRect();
    targetRect = rect;

    tick().then(() => {
      if (!tooltipEl || !targetRect) return;

      const tooltipRect = tooltipEl.getBoundingClientRect();
      const padding = 12;
      const arrowSize = 8;
      const position = currentStep.position || "bottom";

      let top = 0;
      let left = 0;

      switch (position) {
        case "bottom":
          top = targetRect.bottom + padding + arrowSize;
          left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          arrowPosition = "top";
          break;
        case "top":
          top = targetRect.top - tooltipRect.height - padding - arrowSize;
          left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          arrowPosition = "bottom";
          break;
        case "left":
          top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
          left = targetRect.left - tooltipRect.width - padding - arrowSize;
          arrowPosition = "right";
          break;
        case "right":
          top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
          left = targetRect.right + padding + arrowSize;
          arrowPosition = "left";
          break;
      }

      left = Math.max(16, Math.min(left, window.innerWidth - tooltipRect.width - 16));
      top = Math.max(16, Math.min(top, window.innerHeight - tooltipRect.height - 16));

      tooltipPosition = { top, left };
    });
  }

  function handleNext() {
    if (isLastStep) {
      tour.complete();
    } else {
      tour.next();
    }
  }

  function handlePrev() {
    if (!isFirstStep) {
      tour.prev();
    }
  }

  function handleSkip() {
    tour.skip();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!$tour.active) return;
    
    if (e.key === "Escape") {
      handleSkip();
    } else if (e.key === "ArrowRight" || e.key === "Enter") {
      handleNext();
    } else if (e.key === "ArrowLeft") {
      handlePrev();
    }
  }

  $effect(() => {
    if ($tour.active && currentStep) {
      updatePosition();
    }
  });

  onMount(() => {
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", handleKeydown);
    }
  });
</script>

{#if $tour.active && currentStep}
  <div class="fixed inset-0 z-[1000] pointer-events-none">
    {#if targetRect}
      <div 
        class="absolute rounded-xl ring-2 ring-blue-500 ring-offset-2 pointer-events-none animate-pulse-ring"
        style="
          left: {targetRect.left - 4}px;
          top: {targetRect.top - 4}px;
          width: {targetRect.width + 8}px;
          height: {targetRect.height + 8}px;
        "
      ></div>
    {/if}

    <div
      bind:this={tooltipEl}
      class="absolute bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-80 pointer-events-auto animate-fade-in"
      style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
    >
      <div 
        class="absolute w-3 h-3 bg-white border-gray-200 transform rotate-45"
        class:border-t={arrowPosition === "bottom"}
        class:border-l={arrowPosition === "bottom"}
        class:border-b={arrowPosition === "top"}
        class:border-r={arrowPosition === "top"}
        class:border-l-arrow={arrowPosition === "right"}
        class:border-t-arrow={arrowPosition === "right"}
        class:border-r-arrow={arrowPosition === "left"}
        class:border-b-arrow={arrowPosition === "left"}
        style="
          {arrowPosition === 'top' ? 'top: -7px; left: 50%; margin-left: -6px;' : ''}
          {arrowPosition === 'bottom' ? 'bottom: -7px; left: 50%; margin-left: -6px;' : ''}
          {arrowPosition === 'left' ? 'left: -7px; top: 50%; margin-top: -6px;' : ''}
          {arrowPosition === 'right' ? 'right: -7px; top: 50%; margin-top: -6px;' : ''}
        "
      ></div>

      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-400 font-medium">
          {$tour.currentStep + 1} / {steps.length}
        </span>
        <button
          onclick={handleSkip}
          class="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip tour
        </button>
      </div>

      <h3 class="text-base font-semibold text-gray-900 mb-1">
        {currentStep.title}
      </h3>
      <p class="text-sm text-gray-600 mb-4">
        {currentStep.content}
      </p>

      <div class="flex items-center justify-between">
        <div class="flex gap-1">
          {#each steps as _, i}
            <button
              onclick={() => tour.goTo(i)}
              class="w-2 h-2 rounded-full transition-colors"
              class:bg-gray-900={i === $tour.currentStep}
              class:bg-gray-200={i !== $tour.currentStep}
            ></button>
          {/each}
        </div>

        <div class="flex gap-2">
          {#if !isFirstStep}
            <button
              onclick={handlePrev}
              class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Back
            </button>
          {/if}
          <button
            onclick={handleNext}
            class="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-out;
  }

  @keyframes pulse-ring {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
    }
  }

  .animate-pulse-ring {
    animation: pulse-ring 2s ease-in-out infinite;
  }

  .border-l-arrow {
    border-left-width: 1px;
    border-top-width: 1px;
  }

  .border-r-arrow {
    border-right-width: 1px;
    border-bottom-width: 1px;
  }

  .border-t-arrow {
    border-top-width: 1px;
    border-right-width: 1px;
  }

  .border-b-arrow {
    border-bottom-width: 1px;
    border-left-width: 1px;
  }
</style>
