<script lang="ts">
  import { getApiBase } from "../config";
  import { pendingErrorReport, formatErrorForReport, type ErrorReport } from "../errorHandler";

  interface Props {
    open: boolean;
    onClose: () => void;
    initialReport?: ErrorReport | null;
  }

  let { open, onClose, initialReport = null }: Props = $props();

  type FeedbackType = "bug" | "feature" | "general";

  let feedbackType: FeedbackType = $state("bug");
  let title = $state("");
  let description = $state("");
  let email = $state("");
  let includeSystemInfo = $state(true);
  let submitting = $state(false);
  let submitted = $state(false);
  let error = $state<string | null>(null);
  let isErrorReport = $state(false);

  // Watch for initialReport changes and pre-fill the form
  $effect(() => {
    if (initialReport && open) {
      const formatted = formatErrorForReport(initialReport);
      feedbackType = "bug";
      title = formatted.title;
      description = formatted.description;
      isErrorReport = true;
    }
  });

  const feedbackTypes: { id: FeedbackType; label: string; icon: string; description: string }[] = [
    {
      id: "bug",
      label: "Bug Report",
      icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
      description: "Something isn't working correctly"
    },
    {
      id: "feature",
      label: "Feature Request",
      icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
      description: "Suggest a new feature or improvement"
    },
    {
      id: "general",
      label: "General Feedback",
      icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
      description: "Share your thoughts or questions"
    }
  ];

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function resetForm() {
    feedbackType = "bug";
    title = "";
    description = "";
    email = "";
    includeSystemInfo = true;
    submitted = false;
    error = null;
    isErrorReport = false;
    // Clear the pending error report store
    pendingErrorReport.set(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      error = "Please fill in the title and description";
      return;
    }

    submitting = true;
    error = null;

    try {
      const systemInfo = includeSystemInfo ? {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString()
      } : null;

      const response = await fetch(`${getApiBase()}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          title: title.trim(),
          description: description.trim(),
          email: email.trim() || null,
          systemInfo
        })
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      submitted = true;
    } catch (e: any) {
      error = e.message || "Failed to submit feedback. Please try again.";
    } finally {
      submitting = false;
    }
  }

  function openGitHubIssue() {
    const issueTitle = encodeURIComponent(title);
    const issueBody = encodeURIComponent(`## Description\n${description}\n\n## Type\n${feedbackType}\n\n---\n*Submitted via Navi feedback*`);
    window.open(`https://github.com/anthropics/claude-code/issues/new?title=${issueTitle}&body=${issueBody}`, "_blank");
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 {isErrorReport ? 'bg-red-100' : 'bg-purple-100'} rounded-lg">
            {#if isErrorReport}
              <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            {:else}
              <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            {/if}
          </div>
          <h3 class="font-semibold text-lg text-gray-900">{isErrorReport ? 'Report Error' : 'Send Feedback'}</h3>
        </div>
        <button onclick={handleClose} class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-6 overflow-y-auto">
        {#if submitted}
          <div class="text-center py-8">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 class="text-lg font-semibold text-gray-900 mb-2">Thank you!</h4>
            <p class="text-gray-600 mb-6">Your feedback has been received. We appreciate you taking the time to help improve Navi.</p>
            <div class="flex gap-3 justify-center">
              <button
                onclick={handleClose}
                class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onclick={resetForm}
                class="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors"
              >
                Send Another
              </button>
            </div>
          </div>
        {:else}
          <div class="space-y-5">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">What type of feedback?</label>
              <div class="grid grid-cols-3 gap-2">
                {#each feedbackTypes as type}
                  <button
                    onclick={() => feedbackType = type.id}
                    class="p-3 rounded-lg border-2 text-center transition-all {feedbackType === type.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}"
                  >
                    <svg class="w-5 h-5 mx-auto mb-1 {feedbackType === type.id ? 'text-gray-900' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={type.icon} />
                    </svg>
                    <div class="text-xs font-medium {feedbackType === type.id ? 'text-gray-900' : 'text-gray-600'}">{type.label}</div>
                  </button>
                {/each}
              </div>
              <p class="text-xs text-gray-500 mt-2">{feedbackTypes.find(t => t.id === feedbackType)?.description}</p>
            </div>

            <div>
              <label for="feedback-title" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                id="feedback-title"
                type="text"
                bind:value={title}
                placeholder={feedbackType === "bug" ? "Brief description of the issue..." : feedbackType === "feature" ? "What feature would you like?" : "Subject of your feedback..."}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-gray-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label for="feedback-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="feedback-description"
                bind:value={description}
                placeholder={feedbackType === "bug" ? "Steps to reproduce, expected behavior, what actually happened..." : feedbackType === "feature" ? "Describe the feature and how it would help you..." : "Share your thoughts..."}
                rows="4"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-gray-900 focus:outline-none transition-colors resize-none"
              ></textarea>
            </div>

            <div>
              <label for="feedback-email" class="block text-sm font-medium text-gray-700 mb-1">
                Email <span class="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                bind:value={email}
                placeholder="your@email.com"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-gray-900 focus:outline-none transition-colors"
              />
              <p class="text-xs text-gray-500 mt-1">If you'd like us to follow up with you</p>
            </div>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={includeSystemInfo}
                class="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span class="text-sm text-gray-600">Include system info (browser, screen size) to help debug issues</span>
            </label>

            {#if error}
              <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      {#if !submitted}
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <button
            onclick={openGitHubIssue}
            class="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5 transition-colors"
            title="Open on GitHub"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Open on GitHub
          </button>
          <div class="flex gap-2">
            <button
              onclick={handleClose}
              class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onclick={handleSubmit}
              disabled={submitting || !title.trim() || !description.trim()}
              class="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {#if submitting}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              {:else}
                Send Feedback
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
