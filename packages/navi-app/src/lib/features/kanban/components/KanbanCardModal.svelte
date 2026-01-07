<script lang="ts">
  import Modal from "../../../components/Modal.svelte";
  import type { KanbanCard, KanbanStatus } from "../types";
  import { KANBAN_COLUMNS } from "../types";

  interface Props {
    open: boolean;
    card: KanbanCard | null;
    mode: "create" | "edit";
    initialStatus?: KanbanStatus;
    onClose: () => void;
    onSave: (data: { title: string; spec: string; status: KanbanStatus }) => void;
    onDelete?: () => void;
  }

  let { open, card, mode, initialStatus = "spec", onClose, onSave, onDelete }: Props = $props();

  let title = $state("");
  let spec = $state("");
  let status = $state<KanbanStatus>("spec");

  $effect(() => {
    if (open) {
      if (mode === "edit" && card) {
        title = card.title;
        spec = card.spec || "";
        status = card.status;
      } else {
        title = "";
        spec = "";
        status = initialStatus;
      }
    }
  });

  function handleSave() {
    if (!title.trim()) return;
    onSave({ title: title.trim(), spec: spec.trim(), status });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && e.metaKey) {
      handleSave();
    }
  }
</script>

<Modal {open} onClose={onClose} title={mode === "create" ? "New Task" : "Edit Task"} size="lg">
  {#snippet children()}
    <div class="space-y-4" onkeydown={handleKeydown} role="form">
      <!-- Title -->
      <div>
        <label for="title" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          id="title"
          type="text"
          bind:value={title}
          placeholder="What needs to be done?"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none"
          autofocus
        />
      </div>

      <!-- Spec / Description -->
      <div>
        <label for="spec" class="block text-sm font-medium text-gray-700 mb-1"
          >Spec / Description</label
        >
        <textarea
          id="spec"
          bind:value={spec}
          placeholder="Detailed requirements, acceptance criteria, context..."
          rows="6"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none resize-none font-mono text-sm"
        ></textarea>
        <p class="text-xs text-gray-400 mt-1">
          This will be sent to Navi when you start the task
        </p>
      </div>

      <!-- Status -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
        <div class="flex flex-wrap gap-2">
          {#each KANBAN_COLUMNS as column}
            <button
              type="button"
              onclick={() => (status = column.id)}
              class={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                status === column.id
                  ? "bg-accent-100 text-accent-700 ring-2 ring-offset-1 ring-accent-400"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {column.title}
            </button>
          {/each}
        </div>
      </div>

      <!-- Session link info -->
      {#if mode === "edit" && card?.session_id}
        <div class="p-3 bg-accent-50 rounded-lg">
          <p class="text-sm text-accent-700">
            💬 Linked to: <span class="font-medium">{card.session_title || "Chat"}</span>
          </p>
        </div>
      {/if}

      <!-- Blocked warning -->
      {#if mode === "edit" && card?.blocked}
        <div class="p-3 bg-red-50 rounded-lg border border-red-200">
          <p class="text-sm text-red-700 flex items-center gap-2">
            <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Blocked: {card.status_message || "Needs attention"}
          </p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="flex items-center justify-between">
      <div>
        {#if mode === "edit" && onDelete}
          <button
            onclick={onDelete}
            class="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            Delete
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleSave}
          disabled={!title.trim()}
          class="px-4 py-2 text-sm font-medium text-white bg-accent-500 hover:bg-accent-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>
