<script lang="ts">
  /**
   * Email Inbox Panel
   *
   * Displays Navi's email inboxes and messages
   */

  import { onMount, onDestroy } from "svelte";
  import { getServerUrl } from "$lib/api";

  interface Email {
    message_id: string;
    from: string | { address: string; name?: string };
    subject: string;
    preview?: string;
    timestamp: string;
    inbox: string;
  }

  interface Inbox {
    inbox_id: string;
    display_name?: string;
    pod_id: string;
  }

  let inboxes = $state<Inbox[]>([]);
  let selectedInbox = $state<string | null>(null);
  let emails = $state<Email[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Poll for new emails every 30 seconds
  let pollInterval: number | null = null;

  onMount(async () => {
    await loadInboxes();
    // Start polling
    pollInterval = window.setInterval(async () => {
      if (selectedInbox) {
        await loadEmails(selectedInbox);
      }
    }, 30000);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  async function loadInboxes() {
    loading = true;
    error = null;
    try {
      const response = await fetch(`${getServerUrl()}/api/email/inboxes`);
      if (!response.ok) throw new Error("Failed to load inboxes");
      const data = await response.json();
      inboxes = data.inboxes || [];

      // Auto-select first inbox
      if (inboxes.length > 0 && !selectedInbox) {
        selectedInbox = inboxes[0].inbox_id;
        await loadEmails(selectedInbox);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load inboxes";
      console.error("Failed to load inboxes:", e);
    } finally {
      loading = false;
    }
  }

  async function loadEmails(inboxId: string) {
    loading = true;
    error = null;
    try {
      const response = await fetch(`${getServerUrl()}/api/email/inbox/${encodeURIComponent(inboxId)}/messages?limit=50`);
      if (!response.ok) throw new Error("Failed to load emails");
      const data = await response.json();
      emails = data.messages || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load emails";
      console.error("Failed to load emails:", e);
    } finally {
      loading = false;
    }
  }

  function selectInbox(inboxId: string) {
    selectedInbox = inboxId;
    loadEmails(inboxId);
  }

  function formatEmail(addr: string | { address: string; name?: string }): string {
    if (typeof addr === 'string') return addr;
    return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
  }

  function formatDate(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
  }

  async function createNewInbox() {
    const name = prompt("Enter inbox name (e.g., 'navi-github'):");
    if (!name) return;

    try {
      const response = await fetch(`${getServerUrl()}/api/email/inboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name })
      });

      if (!response.ok) throw new Error("Failed to create inbox");

      await loadInboxes();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create inbox";
    }
  }
</script>

<div class="h-full flex flex-col bg-white dark:bg-gray-900">
  <!-- Header -->
  <div class="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Email Inboxes
      </h2>
      <button
        onclick={createNewInbox}
        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
        title="Create new inbox"
      >
        <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- Inbox Selector -->
    {#if inboxes.length > 0}
      <select
        bind:value={selectedInbox}
        onchange={() => selectedInbox && selectInbox(selectedInbox)}
        class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {#each inboxes as inbox}
          <option value={inbox.inbox_id}>
            {inbox.display_name || inbox.inbox_id}
          </option>
        {/each}
      </select>
    {:else if !loading}
      <p class="text-sm text-gray-500 dark:text-gray-400">
        No inboxes found. Create one to get started.
      </p>
    {/if}
  </div>

  <!-- Email List -->
  <div class="flex-1 overflow-y-auto">
    {#if loading && emails.length === 0}
      <div class="flex items-center justify-center h-32">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    {:else if error}
      <div class="p-4">
        <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      </div>
    {:else if emails.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center p-4">
        <svg class="w-12 h-12 text-gray-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <path d="m22 6-10 7L2 6"/>
        </svg>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          No emails yet
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          New messages will appear here
        </p>
      </div>
    {:else}
      <div class="divide-y divide-gray-200 dark:divide-gray-700">
        {#each emails as email (email.message_id)}
          <button
            class="w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
            onclick={() => {
              // TODO: Open email detail view or inject into chat
            }}
          >
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-medium">
                {formatEmail(email.from).charAt(0).toUpperCase()}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {formatEmail(email.from)}
                  </p>
                  <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                    {formatDate(email.timestamp)}
                  </span>
                </div>

                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mb-1">
                  {email.subject}
                </p>

                {#if email.preview}
                  <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {email.preview}
                  </p>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
