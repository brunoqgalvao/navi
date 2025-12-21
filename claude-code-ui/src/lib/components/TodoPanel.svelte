<script lang="ts">
  import { todos, type TodoItem } from "../stores";

  let todoList = $state<TodoItem[]>([]);
  let collapsed = $state(false);

  $effect(() => {
    const unsub = todos.subscribe((t) => (todoList = t));
    return unsub;
  });

  const completedCount = $derived(todoList.filter((t) => t.status === "completed").length);
  const totalCount = $derived(todoList.length);
  const inProgressItem = $derived(todoList.find((t) => t.status === "in_progress"));
</script>

{#if todoList.length > 0}
  <div class="fixed bottom-4 right-4 z-50 w-80 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <button
      onclick={() => (collapsed = !collapsed)}
      class="w-full px-4 py-3 flex items-center justify-between bg-[#1f1f23] hover:bg-[#27272a] transition-colors"
    >
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-indigo-500/20 rounded-lg">
          <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
          </svg>
        </div>
        <span class="text-sm font-medium text-white">Execution Plan</span>
        <span class="text-xs text-gray-500">{completedCount}/{totalCount}</span>
      </div>
      <svg
        class={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </button>

    {#if !collapsed}
      <div class="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
        {#each todoList as todo, i}
          <div class="flex items-start gap-3">
            <div class="mt-0.5 shrink-0">
              {#if todo.status === "completed"}
                <div class="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              {:else if todo.status === "in_progress"}
                <div class="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></div>
              {:else}
                <div class="w-5 h-5 rounded-full border-2 border-gray-600"></div>
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <span
                class={`text-sm ${
                  todo.status === "completed"
                    ? "text-gray-500 line-through"
                    : todo.status === "in_progress"
                      ? "text-white font-medium"
                      : "text-gray-400"
                }`}
              >
                {todo.status === "in_progress" && todo.activeForm ? todo.activeForm + "..." : todo.content}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {:else if inProgressItem}
      <div class="px-4 py-2 border-t border-white/5">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin shrink-0"></div>
          <span class="text-xs text-gray-400 truncate">{inProgressItem.activeForm || inProgressItem.content}...</span>
        </div>
      </div>
    {/if}
  </div>
{/if}
