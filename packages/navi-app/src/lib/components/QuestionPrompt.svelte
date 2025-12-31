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
  let hoveredOption = $state<string | null>(null);

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
  class="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200/60 rounded-2xl p-5 my-4 shadow-sm"
  in:fly={{ y: 20, duration: 300, easing: quintOut }}
>
  <!-- Header -->
  <div class="flex items-center gap-3 mb-4">
    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200/50">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-gray-900">Claude needs your input</h3>
      <p class="text-xs text-gray-500">Please answer to continue</p>
    </div>
  </div>

  <!-- Questions -->
  <div class="space-y-5">
    {#each questions as q, i (q.header)}
      <div
        class="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50 shadow-sm"
        in:fly={{ y: 10, duration: 200, delay: i * 50 }}
      >
        <!-- Question header -->
        <div class="flex items-center gap-2 mb-2">
          <span class="inline-flex items-center px-2.5 py-1 text-xs font-semibold bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 rounded-lg border border-indigo-200/50">
            {q.header}
          </span>
          {#if q.multiSelect}
            <span class="text-xs text-gray-400 italic">select multiple</span>
          {/if}
        </div>

        <!-- Question text -->
        <p class="text-sm text-gray-700 mb-3 leading-relaxed">{q.question}</p>

        <!-- Options grid -->
        <div class="grid gap-2" class:grid-cols-2={q.options.length <= 4}>
          {#each q.options as option, optIdx}
            {@const selected = isSelected(q.header, option.label, q.multiSelect)}
            <button
              onclick={() => toggleOption(q.header, option.label, q.multiSelect)}
              onmouseenter={() => hoveredOption = `${q.header}-${option.label}`}
              onmouseleave={() => hoveredOption = null}
              class="group relative text-left p-3 rounded-xl border-2 transition-all duration-200 {selected
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 border-transparent text-white shadow-lg shadow-indigo-200/50'
                : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md'}"
              in:scale={{ duration: 150, delay: optIdx * 30, start: 0.95 }}
            >
              <div class="flex items-start gap-2.5">
                <!-- Checkbox/Radio indicator -->
                {#if q.multiSelect}
                  <div class="mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors {selected ? 'bg-white/20 border-white/50' : 'border-gray-300 group-hover:border-indigo-400'}">
                    {#if selected}
                      <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    {/if}
                  </div>
                {:else}
                  <div class="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors {selected ? 'bg-white/20 border-white/50' : 'border-gray-300 group-hover:border-indigo-400'}">
                    {#if selected}
                      <div class="w-2 h-2 rounded-full bg-white"></div>
                    {/if}
                  </div>
                {/if}

                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm {selected ? 'text-white' : 'text-gray-900'}">{option.label}</div>
                  <div class="text-xs mt-0.5 line-clamp-2 {selected ? 'text-white/80' : 'text-gray-500'}">{option.description}</div>
                </div>
              </div>
            </button>
          {/each}

          <!-- Other option -->
          <button
            onclick={() => toggleOption(q.header, "__other__", q.multiSelect)}
            class="group relative text-left p-3 rounded-xl border-2 border-dashed transition-all duration-200 {isSelected(q.header, '__other__', q.multiSelect)
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 border-transparent text-white shadow-lg shadow-indigo-200/50'
              : 'bg-white/50 border-gray-300 hover:border-indigo-300 hover:bg-white'}"
          >
            <div class="flex items-center gap-2.5">
              {#if q.multiSelect}
                <div class="w-4 h-4 rounded border-2 flex items-center justify-center {isSelected(q.header, '__other__', q.multiSelect) ? 'bg-white/20 border-white/50' : 'border-gray-300'}">
                  {#if isSelected(q.header, "__other__", q.multiSelect)}
                    <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </div>
              {:else}
                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center {isSelected(q.header, '__other__', q.multiSelect) ? 'bg-white/20 border-white/50' : 'border-gray-300'}">
                  {#if isSelected(q.header, "__other__", q.multiSelect)}
                    <div class="w-2 h-2 rounded-full bg-white"></div>
                  {/if}
                </div>
              {/if}
              <span class="text-sm {isSelected(q.header, '__other__', q.multiSelect) ? 'text-white font-medium' : 'text-gray-600'}">
                Other...
              </span>
            </div>
          </button>
        </div>

        <!-- Other input field -->
        {#if isSelected(q.header, "__other__", q.multiSelect)}
          <div class="mt-3" in:fly={{ y: -10, duration: 200 }}>
            <input
              type="text"
              bind:value={otherInputs[q.header]}
              oninput={(e) => handleOtherInput(q.header, e.currentTarget.value)}
              placeholder="Type your answer..."
              class="w-full px-4 py-2.5 text-sm bg-white border-2 border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all placeholder:text-gray-400"
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Submit button -->
  <div class="mt-5 flex justify-end">
    <button
      onclick={handleSubmit}
      disabled={!allAnswered}
      class="group relative px-6 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 overflow-hidden
        {allAnswered
          ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 hover:-translate-y-0.5'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'}"
    >
      <span class="relative z-10 flex items-center gap-2">
        Continue
        <svg class="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
      {#if allAnswered}
        <div class="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      {/if}
    </button>
  </div>
</div>
