<script lang="ts">
  import { channels } from "../";
  import { projects } from "$lib/stores";
  import Modal from "$lib/components/Modal.svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
    onCreated?: (channelId: string) => void;
  }

  let { open = $bindable(), onClose, onCreated }: Props = $props();

  let name = $state("");
  let description = $state("");
  let workspaceAccess = $state<"selected" | "all">("all");
  let selectedWorkspaces = $state<string[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      error = "Name is required";
      return;
    }

    loading = true;
    error = null;

    try {
      const channel = await channels.create(
        name.trim(),
        description.trim() || undefined,
        workspaceAccess === "selected" ? selectedWorkspaces : []
      );

      // Reset form
      name = "";
      description = "";
      workspaceAccess = "all";
      selectedWorkspaces = [];

      onCreated?.(channel.id);
      onClose();
    } catch (e: any) {
      error = e.message || "Failed to create channel";
    } finally {
      loading = false;
    }
  }

  function toggleWorkspace(id: string) {
    if (selectedWorkspaces.includes(id)) {
      selectedWorkspaces = selectedWorkspaces.filter((w) => w !== id);
    } else {
      selectedWorkspaces = [...selectedWorkspaces, id];
    }
  }
</script>

<Modal {open} {onClose} title="Create Channel" size="md">
  {#snippet children()}
    <div class="space-y-4">
      <!-- Name -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Channel Name
        </label>
        <div class="flex items-center gap-2">
          <span class="text-gray-400 dark:text-gray-500 text-lg">#</span>
          <input
            type="text"
            bind:value={name}
            placeholder="frontend"
            class="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      <!-- Description -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description (optional)
        </label>
        <input
          type="text"
          bind:value={description}
          placeholder="What this channel is for..."
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      <!-- Workspace Access -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Workspace Access
        </label>
        <div class="space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              bind:group={workspaceAccess}
              value="all"
              class="text-purple-600 focus:ring-purple-500"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              All workspaces
            </span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              bind:group={workspaceAccess}
              value="selected"
              class="text-purple-600 focus:ring-purple-500"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              Selected workspaces only
            </span>
          </label>
        </div>
      </div>

      <!-- Workspace Selection (if selected) -->
      {#if workspaceAccess === "selected"}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto">
          {#each $projects as project}
            <label
              class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedWorkspaces.includes(project.id)}
                onchange={() => toggleWorkspace(project.id)}
                class="text-purple-600 focus:ring-purple-500 rounded"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300 truncate">
                {project.name}
              </span>
            </label>
          {/each}
          {#if $projects.length === 0}
            <div class="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              No workspaces available
            </div>
          {/if}
        </div>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p class="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="flex justify-end gap-3">
      <button
        onclick={onClose}
        class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        Cancel
      </button>
      <button
        onclick={handleCreate}
        disabled={loading || !name.trim()}
        class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Creating..." : "Create Channel"}
      </button>
    </div>
  {/snippet}
</Modal>
