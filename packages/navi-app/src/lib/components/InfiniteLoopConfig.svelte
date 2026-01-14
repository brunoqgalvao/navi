<script lang="ts">
  import Modal from "./Modal.svelte";
  import { getServerUrl } from "$lib/api";

  interface Props {
    open: boolean;
    sessionId: string;
    projectId: string;
    prompt: string;
    onClose: () => void;
    onStart: (loopId: string) => void;
  }

  let { open, sessionId, projectId, prompt, onClose, onStart }: Props = $props();

  // Configuration state
  let definitionOfDone = $state<string[]>(["Task is functionally complete"]);
  let newDodItem = $state("");
  let maxIterations = $state(100);
  let maxCost = $state(50);
  let contextResetThreshold = $state(70);
  let verifierModel = $state<"haiku" | "sonnet">("haiku");
  let isStarting = $state(false);
  let error = $state<string | null>(null);

  // Preset DoD suggestions
  const dodPresets = [
    "All tests pass",
    "Build succeeds without errors",
    "No TypeScript errors",
    "Feature deployed to staging",
    "Code review addressed",
    "Documentation updated",
    "No console errors",
    "Performance benchmarks met",
  ];

  function addDodItem() {
    if (newDodItem.trim() && !definitionOfDone.includes(newDodItem.trim())) {
      definitionOfDone = [...definitionOfDone, newDodItem.trim()];
      newDodItem = "";
    }
  }

  function removeDodItem(index: number) {
    definitionOfDone = definitionOfDone.filter((_, i) => i !== index);
  }

  function addPreset(preset: string) {
    if (!definitionOfDone.includes(preset)) {
      definitionOfDone = [...definitionOfDone, preset];
    }
  }

  async function startLoop() {
    if (definitionOfDone.length === 0) {
      error = "Add at least one Definition of Done item";
      return;
    }

    isStarting = true;
    error = null;

    try {
      const res = await fetch(`${getServerUrl()}/api/loops/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          projectId,
          prompt,
          definitionOfDone,
          maxIterations: maxIterations === 100 ? undefined : maxIterations,
          maxCost,
          contextResetThreshold: contextResetThreshold / 100,
          verifierModel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start loop");
      }

      const data = await res.json();
      onStart(data.loopId);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to start loop";
    } finally {
      isStarting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addDodItem();
    }
  }
</script>

<Modal {open} {onClose} title="🔄 Infinite Loop Mode" size="lg">
  {#snippet children()}
    <div class="space-y-6">
      <!-- Description -->
      <div class="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-800 rounded-lg flex items-center justify-center text-xl">
            🔄
          </div>
          <div>
            <h4 class="font-semibold text-emerald-900 dark:text-emerald-100">Ralph Wiggum Mode</h4>
            <p class="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
              Claude will work until your Definition of Done is verified. A separate verifier agent checks progress and resets context when needed.
            </p>
          </div>
        </div>
      </div>

      <!-- Definition of Done -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          ✅ Definition of Done
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          What must be true for the task to be complete? The verifier will check these.
        </p>

        <!-- Current items -->
        <div class="space-y-2 mb-3">
          {#each definitionOfDone as item, i}
            <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <span class="text-emerald-500">☐</span>
              <span class="flex-1 text-sm text-gray-700 dark:text-gray-300">{item}</span>
              <button
                onclick={() => removeDodItem(i)}
                class="text-gray-400 hover:text-red-500 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
        </div>

        <!-- Add new item -->
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newDodItem}
            onkeydown={handleKeydown}
            placeholder="e.g., All tests pass"
            class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onclick={addDodItem}
            disabled={!newDodItem.trim()}
            class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        <!-- Presets -->
        <div class="mt-3">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick add:</p>
          <div class="flex flex-wrap gap-1.5">
            {#each dodPresets as preset}
              <button
                onclick={() => addPreset(preset)}
                disabled={definitionOfDone.includes(preset)}
                class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-md transition-colors"
              >
                + {preset}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Configuration options -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Max Cost -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            💰 Max Cost
          </label>
          <div class="flex items-center gap-2">
            <span class="text-gray-500">$</span>
            <input
              type="number"
              bind:value={maxCost}
              min="1"
              max="500"
              class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <p class="text-xs text-gray-500 mt-1">Stop when this cost is reached</p>
        </div>

        <!-- Context Reset Threshold -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            🧠 Context Reset at
          </label>
          <div class="flex items-center gap-2">
            <input
              type="number"
              bind:value={contextResetThreshold}
              min="50"
              max="95"
              step="5"
              class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span class="text-gray-500">%</span>
          </div>
          <p class="text-xs text-gray-500 mt-1">Reset context when window fills</p>
        </div>

        <!-- Max Iterations -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            🔁 Max Iterations
          </label>
          <input
            type="number"
            bind:value={maxIterations}
            min="1"
            max="1000"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p class="text-xs text-gray-500 mt-1">100 = effectively infinite</p>
        </div>

        <!-- Verifier Model -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            🔍 Verifier Model
          </label>
          <select
            bind:value={verifierModel}
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="haiku">Haiku (fast, cheap)</option>
            <option value="sonnet">Sonnet (thorough)</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">Agent that checks completion</p>
        </div>
      </div>

      <!-- Error message -->
      {#if error}
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="flex justify-end gap-3">
      <button
        onclick={onClose}
        class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        Cancel
      </button>
      <button
        onclick={startLoop}
        disabled={isStarting || definitionOfDone.length === 0}
        class="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
      >
        {#if isStarting}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Starting...
        {:else}
          🚀 Start Infinite Loop
        {/if}
      </button>
    </div>
  {/snippet}
</Modal>
