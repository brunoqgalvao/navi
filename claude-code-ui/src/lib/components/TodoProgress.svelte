<script lang="ts">
  import type { TodoItem } from "../stores";

  interface Props {
    todos: TodoItem[];
    showWhenEmpty?: boolean;
  }

  let { todos, showWhenEmpty = false }: Props = $props();

  const completedCount = $derived(todos.filter(t => t.status === "completed").length);
  const hasInProgress = $derived(todos.some(t => t.status === "in_progress"));
  
  // Only show if there are todos OR if showWhenEmpty is true
  const shouldShow = $derived(todos.length > 0 || showWhenEmpty);
</script>

{#if shouldShow}
  <div class="flex gap-4 w-full">
    <div class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm">
      <div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
    </div>
    <div class="flex-1">
      {#if todos.length > 0}
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
            </svg>
            <span class="text-xs font-medium text-gray-600">{completedCount}/{todos.length}</span>
          </div>
          <div class="space-y-1.5 max-h-32 overflow-y-auto">
            {#each todos as todo}
              <div class="flex items-start gap-2">
                <div class="mt-0.5 shrink-0">
                  {#if todo.status === "completed"}
                    <div class="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                      <svg class="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </div>
                  {:else if todo.status === "in_progress"}
                    <div class="w-4 h-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin"></div>
                  {:else}
                    <div class="w-4 h-4 rounded-full border-2 border-gray-300"></div>
                  {/if}
                </div>
                <span class={`text-xs ${todo.status === "completed" ? "text-gray-400 line-through" : todo.status === "in_progress" ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                  {todo.status === "in_progress" && todo.activeForm ? todo.activeForm + "..." : todo.content}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="flex items-center gap-1.5 pt-2">
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
          <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
        </div>
      {/if}
    </div>
  </div>
{/if}
