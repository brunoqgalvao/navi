<script lang="ts">
  interface Todo {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm?: string;
  }

  interface Props {
    todos: Todo[];
    expanded?: boolean;
    onToggle?: () => void;
  }

  let { todos = [], expanded = false, onToggle }: Props = $props();

  const stats = $derived.by(() => {
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const total = todos.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, inProgress, pending, total, percent };
  });

  const currentTask = $derived(todos.find(t => t.status === 'in_progress'));
</script>

<div class="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
  <button
    onclick={() => onToggle?.()}
    class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
  >
    <!-- Icon -->
    <div class="w-6 h-6 rounded-md bg-pink-100 flex items-center justify-center shrink-0">
      <svg class="w-3.5 h-3.5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
      </svg>
    </div>

    <!-- Progress bar and stats -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-medium text-gray-700">
          {stats.completed}/{stats.total}
        </span>
        <span class="text-[10px] text-gray-400">
          {stats.percent}%
        </span>
        {#if currentTask}
          <span class="text-[10px] text-blue-600 truncate ml-1">
            {currentTask.activeForm || currentTask.content}
          </span>
        {/if}
      </div>
      <!-- Progress bar -->
      <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div class="h-full flex">
          {#if stats.completed > 0}
            <div
              class="bg-green-500 transition-all duration-300"
              style="width: {(stats.completed / stats.total) * 100}%"
            ></div>
          {/if}
          {#if stats.inProgress > 0}
            <div
              class="bg-blue-500 animate-pulse transition-all duration-300"
              style="width: {(stats.inProgress / stats.total) * 100}%"
            ></div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Expand icon -->
    <svg
      class="w-4 h-4 text-gray-400 transition-transform shrink-0 {expanded ? 'rotate-180' : ''}"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if expanded}
    <div class="px-3 pb-2 pt-1 border-t border-gray-100 space-y-1 max-h-48 overflow-y-auto">
      {#each todos as todo, idx}
        <div class="flex items-start gap-2 py-1 {idx > 0 ? 'border-t border-gray-50' : ''}">
          <div class="mt-0.5 shrink-0">
            {#if todo.status === "completed"}
              <div class="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg class="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
            {:else if todo.status === "in_progress"}
              <div class="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
            {:else}
              <div class="w-4 h-4 rounded-full border-2 border-gray-300"></div>
            {/if}
          </div>
          <div class="flex-1 min-w-0">
            <span class={`text-xs leading-relaxed ${
              todo.status === "completed"
                ? "text-gray-400 line-through"
                : todo.status === "in_progress"
                  ? "text-gray-900 font-medium"
                  : "text-gray-600"
            }`}>
              {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
