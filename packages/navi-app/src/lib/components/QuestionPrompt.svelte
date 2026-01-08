<script lang="ts">
  import { fly, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import type { QuestionItem } from "../handlers/types";

  interface Props {
    requestId: string;
    questions: QuestionItem[];
    onAnswer: (answers: Record<string, string | string[]>) => void;
  }

  let { requestId, questions, onAnswer }: Props = $props();

  // Track answers for each question by header
  let answers = $state<Record<string, string | string[]>>({});
  let otherInputs = $state<Record<string, string>>({});

  function toggleOption(header: string, label: string, multiSelect: boolean) {
    if (multiSelect) {
      const current = (answers[header] as string[]) || [];
      if (current.includes(label)) {
        answers[header] = current.filter(l => l !== label);
      } else {
        answers[header] = [...current, label];
      }
    } else {
      answers[header] = label;
    }
  }

  function handleOtherInput(header: string, value: string) {
    otherInputs[header] = value;
  }

  function handleSubmit() {
    const finalAnswers: Record<string, string | string[]> = {};
    for (const q of questions) {
      const answer = answers[q.header];
      if (answer === "__other__") {
        finalAnswers[q.header] = otherInputs[q.header] || "";
      } else if (Array.isArray(answer) && answer.includes("__other__")) {
        const filtered = answer.filter(a => a !== "__other__");
        if (otherInputs[q.header]) {
          filtered.push(otherInputs[q.header]);
        }
        finalAnswers[q.header] = filtered;
      } else {
        finalAnswers[q.header] = answer || "";
      }
    }
    onAnswer(finalAnswers);
  }

  function isSelected(header: string, label: string, multiSelect: boolean): boolean {
    if (multiSelect) {
      return ((answers[header] as string[]) || []).includes(label);
    }
    return answers[header] === label;
  }

  const allAnswered = $derived(
    questions.every(q => {
      const answer = answers[q.header];
      if (!answer) return false;
      if (Array.isArray(answer)) return answer.length > 0;
      if (answer === "__other__") return !!otherInputs[q.header]?.trim();
      return true;
    })
  );
</script>

<div
  class="bg-white border border-gray-200 rounded-xl p-4 my-3 shadow-sm"
  in:fly={{ y: 20, duration: 300, easing: quintOut }}
>
  <!-- Header -->
  <div class="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
    <div class="w-8 h-8 rounded-lg bg-accent-100 text-accent-600 flex items-center justify-center">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <div>
      <h3 class="text-sm font-medium text-gray-900">Input needed</h3>
      <p class="text-xs text-gray-500">Select an option to continue</p>
    </div>
  </div>

  <!-- Questions -->
  <div class="space-y-4">
    {#each questions as q, i (q.header)}
      <div
        in:fly={{ y: 10, duration: 200, delay: i * 50 }}
      >
        <!-- Question header -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-medium text-accent-700 bg-accent-50 px-2 py-0.5 rounded">
            {q.header}
          </span>
          {#if q.multiSelect}
            <span class="text-xs text-gray-400">· multiple</span>
          {/if}
        </div>

        <!-- Question text -->
        <p class="text-sm text-gray-700 mb-3">{q.question}</p>

        <!-- Options -->
        <div class="space-y-2">
          {#each q.options as option, optIdx}
            {@const selected = isSelected(q.header, option.label, q.multiSelect)}
            <button
              onclick={() => toggleOption(q.header, option.label, q.multiSelect)}
              class="group w-full text-left p-3 rounded-lg border transition-all duration-150 {selected
                ? 'bg-accent-50 border-accent-300 ring-1 ring-accent-200'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100'}"
              in:scale={{ duration: 150, delay: optIdx * 30, start: 0.98 }}
            >
              <div class="flex items-start gap-3">
                <!-- Checkbox/Radio indicator -->
                {#if q.multiSelect}
                  <div class="mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors {selected ? 'bg-accent-500 border-accent-500' : 'border-gray-300 group-hover:border-gray-400'}">
                    {#if selected}
                      <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    {/if}
                  </div>
                {:else}
                  <div class="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors {selected ? 'border-accent-500' : 'border-gray-300 group-hover:border-gray-400'}">
                    {#if selected}
                      <div class="w-2 h-2 rounded-full bg-accent-500"></div>
                    {/if}
                  </div>
                {/if}

                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm {selected ? 'text-accent-900' : 'text-gray-900'}">{option.label}</div>
                  {#if option.description}
                    <div class="text-xs mt-0.5 {selected ? 'text-accent-700' : 'text-gray-500'}">{option.description}</div>
                  {/if}
                </div>
              </div>
            </button>
          {/each}

          <!-- Other option -->
          <button
            onclick={() => toggleOption(q.header, "__other__", q.multiSelect)}
            class="group w-full text-left p-3 rounded-lg border border-dashed transition-all duration-150 {isSelected(q.header, '__other__', q.multiSelect)
              ? 'bg-accent-50 border-accent-300'
              : 'bg-white border-gray-300 hover:border-gray-400 hover:bg-gray-50'}"
          >
            <div class="flex items-center gap-3">
              {#if q.multiSelect}
                <div class="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 {isSelected(q.header, '__other__', q.multiSelect) ? 'bg-accent-500 border-accent-500' : 'border-gray-300'}">
                  {#if isSelected(q.header, "__other__", q.multiSelect)}
                    <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </div>
              {:else}
                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 {isSelected(q.header, '__other__', q.multiSelect) ? 'border-accent-500' : 'border-gray-300'}">
                  {#if isSelected(q.header, "__other__", q.multiSelect)}
                    <div class="w-2 h-2 rounded-full bg-accent-500"></div>
                  {/if}
                </div>
              {/if}
              <span class="text-sm {isSelected(q.header, '__other__', q.multiSelect) ? 'text-accent-700 font-medium' : 'text-gray-500'}">
                Other...
              </span>
            </div>
          </button>
        </div>

        <!-- Other input field -->
        {#if isSelected(q.header, "__other__", q.multiSelect)}
          <div class="mt-2" in:fly={{ y: -10, duration: 200 }}>
            <input
              type="text"
              bind:value={otherInputs[q.header]}
              oninput={(e) => handleOtherInput(q.header, e.currentTarget.value)}
              placeholder="Type your answer..."
              class="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100 transition-all placeholder:text-gray-400"
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Submit button -->
  <div class="mt-4 pt-3 border-t border-gray-100 flex justify-end">
    <button
      onclick={handleSubmit}
      disabled={!allAnswered}
      class="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150
        {allAnswered
          ? 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'}"
    >
      <span class="flex items-center gap-1.5">
        Continue
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
    </button>
  </div>
</div>
