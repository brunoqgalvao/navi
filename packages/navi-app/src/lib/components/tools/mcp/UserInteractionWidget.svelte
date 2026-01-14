<script lang="ts">
  /**
   * User Interaction MCP Widget
   *
   * Renders ask_user_question tool calls with beautiful UIs:
   * - During request: Shows "Question incoming" with questions preview
   * - After answer: Shows the answered questions with selected options
   */

  interface QuestionOption {
    label: string;
    description?: string;
  }

  interface QuestionItem {
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
  }

  interface Props {
    toolName: string;
    input: Record<string, any>;
    result?: { content: string; is_error?: boolean };
    compact?: boolean;
  }

  let { toolName, input, result, compact = false }: Props = $props();

  // Parse questions from input
  const questions = $derived<QuestionItem[]>(input.questions || []);

  // Parse answered values from result
  // Result format is: "User answered:\nHeader1: value1\nHeader2: value2"
  const answeredValues = $derived.by(() => {
    const content = result?.content;
    if (!content) return null;

    // First try JSON parsing (in case format changes)
    try {
      const parsed = JSON.parse(content);
      if (parsed.result && typeof parsed.result === 'object') {
        return parsed.result as Record<string, string | string[]>;
      }
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string | string[]>;
      }
    } catch {
      // Not JSON, parse the text format
    }

    // Parse text format: "User answered:\nHeader: value\nHeader2: value2"
    const answers: Record<string, string | string[]> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip "User answered:" header line
      if (line.startsWith('User answered:')) continue;

      // Parse "Header: value" format
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const header = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (header && value) {
          // Check if it's a comma-separated list (multi-select)
          if (value.includes(', ')) {
            answers[header] = value.split(', ').map(v => v.trim());
          } else {
            answers[header] = value;
          }
        }
      }
    }

    return Object.keys(answers).length > 0 ? answers : null;
  });

  const isAnswered = $derived(!!result && !result.is_error);
  const hasError = $derived(result?.is_error === true);
</script>

{#if compact}
  <!-- Compact view for tool pills -->
  <div class="flex items-center gap-2 px-2 py-1 text-xs rounded-md border {isAnswered ? 'border-green-200 bg-green-50/50' : hasError ? 'border-red-200 bg-red-50/50' : 'border-purple-200 bg-purple-50/50'}">
    <svg class="w-3.5 h-3.5 {isAnswered ? 'text-green-500' : hasError ? 'text-red-500' : 'text-purple-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span class="font-medium {isAnswered ? 'text-green-700' : hasError ? 'text-red-700' : 'text-purple-700'}">
      {isAnswered ? 'Answered' : hasError ? 'Failed' : 'Asking...'}
    </span>
    <span class="text-gray-500 truncate">
      {questions.length} question{questions.length !== 1 ? 's' : ''}
    </span>
  </div>
{:else}
  <!-- Full view -->
  <div class="rounded-lg border {isAnswered ? 'border-green-200 bg-gradient-to-br from-green-50/80 to-white' : hasError ? 'border-red-200 bg-gradient-to-br from-red-50/80 to-white' : 'border-purple-200 bg-gradient-to-br from-purple-50/80 to-white'} overflow-hidden">
    <!-- Header -->
    <div class="px-3 py-2 border-b {isAnswered ? 'border-green-100 bg-green-50/50' : hasError ? 'border-red-100 bg-red-50/50' : 'border-purple-100 bg-purple-50/50'}">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-md {isAnswered ? 'bg-green-100' : hasError ? 'bg-red-100' : 'bg-purple-100'}">
          <svg class="w-4 h-4 {isAnswered ? 'text-green-600' : hasError ? 'text-red-600' : 'text-purple-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if isAnswered}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            {:else if hasError}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            {/if}
          </svg>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium {isAnswered ? 'text-green-800' : hasError ? 'text-red-800' : 'text-purple-800'}">
              {isAnswered ? 'User Input Received' : hasError ? 'Question Failed' : 'Asking User'}
            </span>
            {#if !isAnswered && !hasError}
              <span class="flex items-center gap-1 text-xs text-purple-600">
                <span class="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></span>
                waiting for response...
              </span>
            {/if}
          </div>
          <div class="text-xs {isAnswered ? 'text-green-600' : hasError ? 'text-red-600' : 'text-purple-600'}">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Questions -->
    <div class="p-3 space-y-3">
      {#each questions as q, idx}
        <div class="bg-white/70 rounded-lg border {isAnswered ? 'border-green-100' : 'border-gray-100'} p-3">
          <!-- Question header badge -->
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-medium {isAnswered ? 'text-green-700 bg-green-100' : 'text-purple-700 bg-purple-100'} px-2 py-0.5 rounded">
              {q.header}
            </span>
            {#if q.multiSelect}
              <span class="text-[10px] text-gray-400">multi-select</span>
            {/if}
          </div>

          <!-- Question text -->
          <p class="text-sm text-gray-700 mb-2">{q.question}</p>

          <!-- Options or Answer -->
          {#if isAnswered && answeredValues}
            {@const answer = answeredValues[q.header]}
            <div class="mt-2">
              {#if Array.isArray(answer)}
                <div class="flex flex-wrap gap-1">
                  {#each answer as a}
                    <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-md">
                      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                      {a}
                    </span>
                  {/each}
                </div>
              {:else if answer}
                <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-md">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  {answer}
                </span>
              {:else}
                <span class="text-xs text-gray-400 italic">No answer provided</span>
              {/if}
            </div>
          {:else}
            <!-- Show options preview -->
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each q.options.slice(0, 4) as opt}
                <span class="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                  {opt.label}
                </span>
              {/each}
              {#if q.options.length > 4}
                <span class="text-xs text-gray-400 px-2 py-1">
                  +{q.options.length - 4} more
                </span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if hasError && result?.content}
      <div class="px-3 pb-3">
        <div class="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 font-mono">
          {result.content}
        </div>
      </div>
    {/if}
  </div>
{/if}
