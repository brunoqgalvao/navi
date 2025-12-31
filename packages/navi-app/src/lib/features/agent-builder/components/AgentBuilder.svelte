<script lang="ts">
  import { onMount } from "svelte";
  import {
    agentBuilderView,
    currentAgent,
    loadLibrary,
    createAgent,
    openAgent,
    isLoading,
    loadError,
  } from "../stores";
  import type { AgentDefinition } from "../types";
  import AgentLibrary from "./AgentLibrary.svelte";
  import AgentBuilderLayout from "./AgentBuilderLayout.svelte";

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  let showCreateModal = $state(false);
  let createType = $state<"agent" | "skill">("agent");
  let newName = $state("");
  let newDescription = $state("");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  // Load library on mount
  onMount(() => {
    loadLibrary();
  });

  function handleBack() {
    if ($agentBuilderView === "editor") {
      agentBuilderView.set("library");
      currentAgent.set(null);
    } else {
      onClose?.();
    }
  }

  function handleCreateNew(type: "agent" | "skill") {
    createType = type;
    newName = "";
    newDescription = "";
    createError = null;
    showCreateModal = true;
  }

  async function handleCreateSubmit() {
    if (!newName.trim()) {
      createError = "Name is required";
      return;
    }

    creating = true;
    createError = null;

    const agent = await createAgent(newName.trim(), newDescription.trim(), createType);

    creating = false;

    if (agent) {
      showCreateModal = false;
      openAgent(agent);
    } else {
      createError = "Failed to create. Check if name already exists.";
    }
  }

  function handleSelectAgent(agent: AgentDefinition) {
    openAgent(agent);
  }
</script>

<div class="h-full">
  {#if $agentBuilderView === "library"}
    <AgentLibrary onCreateNew={handleCreateNew} onSelectAgent={handleSelectAgent} />
  {:else}
    <AgentBuilderLayout onBack={handleBack} />
  {/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30"
    onclick={(e) => e.target === e.currentTarget && (showCreateModal = false)}
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div class="p-2 {createType === 'skill' ? 'bg-amber-100' : 'bg-indigo-100'} rounded-lg">
          {#if createType === "skill"}
            <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          {:else}
            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          {/if}
        </div>
        <h3 class="font-semibold text-lg text-gray-900">
          Create New {createType === "skill" ? "Skill" : "Agent"}
        </h3>
      </div>

      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            bind:value={newName}
            placeholder={createType === "skill" ? "my-skill" : "my-agent"}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-400"
            onkeydown={(e) => e.key === "Enter" && handleCreateSubmit()}
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            bind:value={newDescription}
            placeholder="What does this {createType} do?"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-400"
          />
        </div>

        {#if createError}
          <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {createError}
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
        <button
          onclick={() => (showCreateModal = false)}
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleCreateSubmit}
          disabled={creating}
          class="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  </div>
{/if}
