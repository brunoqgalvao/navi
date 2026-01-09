<!--
  Preview (Port) Panel - Multi-instance preview with smart port allocation

  Runs dev servers with automatic port management.
  - Supports multiple instances (different branches)
  - Auto-installs dependencies for worktrees
  - No user interaction needed for port conflicts
-->
<script lang="ts">
  import { portManagerPreviewApi, type PortAllocation, type PortManagerPreviewInfo } from "../api";

  interface Props {
    projectId: string | null;
    sessionId: string | null;
    branch: string | null;
    previewUrl?: string | null;
    onClose?: () => void;
  }

  let { projectId, sessionId, branch, previewUrl, onClose }: Props = $props();

  let iframeRef = $state<HTMLIFrameElement | null>(null);
  let status = $state<"stopped" | "starting" | "running" | "error">("stopped");
  let error = $state<string | null>(null);
  let errorLogs = $state<string[]>([]);
  let showErrorLogs = $state(false);
  let loading = $state(false);
  let currentUrl = $state(previewUrl);
  let currentPort = $state<number | null>(null);
  let iframeKey = $state(Date.now());
  let framework = $state<string | null>(null);

  const effectiveBranch = $derived(branch || "main");

  // Load directly from localhost - proxy breaks CSS/JS relative paths
  const iframeSrc = $derived(() => currentUrl);

  // Sync previewUrl prop to currentUrl
  $effect(() => {
    if (previewUrl) {
      currentUrl = previewUrl;
    }
  });

  // Check status on mount
  $effect(() => {
    if (sessionId) {
      checkStatus();
    }
  });

  async function checkStatus() {
    if (!sessionId) return;
    try {
      const result = await portManagerPreviewApi.getStatus(sessionId);
      if (result.running) {
        currentUrl = result.url || null;
        currentPort = result.ports?.primary || null;
        framework = result.framework || null;
        error = result.error || null;

        if (result.status === "starting" && result.url) {
          status = "starting";
          pollStatus();
        } else if (result.status === "error") {
          status = "error";
          await fetchErrorLogs();
        } else {
          status = "running";
        }
      } else {
        status = "stopped";
      }
    } catch (e) {
      console.error("[PreviewPanel] checkStatus error:", e);
      status = "stopped";
    }
  }

  async function startPreview() {
    if (!sessionId) return;
    loading = true;
    error = null;
    try {
      const result = await portManagerPreviewApi.start(sessionId, true);
      if (result.success) {
        status = "starting";
        currentUrl = result.url || null;
        currentPort = result.ports?.primary || null;
        pollStatus();
      } else if (result.error) {
        error = result.error;
        status = "error";
      }
    } catch (e: any) {
      console.error("[PreviewPanel] Start error:", e);
      error = e.message;
      status = "error";
    } finally {
      loading = false;
    }
  }

  async function fetchErrorLogs() {
    if (!sessionId) return;
    try {
      const result = await portManagerPreviewApi.getLogs(sessionId, 50);
      errorLogs = result.logs || [];
      showErrorLogs = true;
    } catch (e) {
      console.error("[PreviewPanel] Failed to fetch error logs:", e);
    }
  }

  async function stopPreview() {
    if (!sessionId) return;
    loading = true;
    try {
      await portManagerPreviewApi.stop(sessionId);
      status = "stopped";
      currentUrl = null;
      currentPort = null;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function pollStatus() {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      try {
        const result = await portManagerPreviewApi.getStatus(sessionId!);
        if (result.status === "running") {
          status = "running";
          currentUrl = result.url || null;
          currentPort = result.ports?.primary || null;
          framework = result.framework || null;
          iframeKey = Date.now();
          clearInterval(interval);
        } else if (result.status === "error" || !result.running) {
          status = "error";
          error = result.error || "Preview failed";
          await fetchErrorLogs();
          clearInterval(interval);
        } else if (result.status === "starting" && result.url) {
          try {
            await fetch(result.url, { method: 'HEAD', mode: 'no-cors' });
            status = "running";
            currentUrl = result.url;
            iframeKey = Date.now();
            clearInterval(interval);
          } catch {
            // Not responding yet
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    setTimeout(() => clearInterval(interval), 90000);
  }

  function refresh() {
    if (iframeRef && currentUrl) {
      iframeKey = Date.now();
    }
  }

  async function viewLogs() {
    if (!sessionId) return;
    try {
      const result = await portManagerPreviewApi.getLogs(sessionId, 200);
      const logs = result.logs || [];
      if (logs.length > 0) {
        const logWindow = window.open('', '_blank', 'width=900,height=600');
        if (logWindow) {
          logWindow.document.write(`
            <html>
              <head>
                <title>Preview Logs - ${effectiveBranch}</title>
                <style>
                  body { font-family: ui-monospace, monospace; background: #0d1117; color: #c9d1d9; padding: 16px; margin: 0; }
                  pre { white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 1.6; margin: 0; }
                  .line { padding: 2px 8px; border-radius: 2px; }
                  .line:hover { background: #161b22; }
                  .stderr { color: #f85149; }
                </style>
              </head>
              <body>
                <pre>${logs.map(l => {
                  const isStderr = l.startsWith('[stderr]');
                  return `<div class="line ${isStderr ? 'stderr' : ''}">${l.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
                }).join('')}</pre>
              </body>
            </html>
          `);
          logWindow.document.close();
        }
      } else {
        alert('No logs available yet');
      }
    } catch (e: any) {
      alert(`Failed to fetch logs: ${e.message}`);
    }
  }

  function openInBrowser() {
    if (currentUrl) {
      window.open(currentUrl, '_blank');
    }
  }
</script>

<div class="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <span class="text-lg">🔌</span>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full {status === 'running' ? 'bg-green-500' : status === 'starting' ? 'bg-yellow-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-gray-400'}"></span>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{status}</span>
      </div>
      {#if currentUrl}
        <span class="text-xs text-gray-400 truncate font-mono">{currentUrl}</span>
      {/if}
      {#if framework}
        <span class="text-xs text-gray-400">({framework})</span>
      {/if}
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-1">
      {#if status === "running" || status === "starting"}
        <button
          onclick={refresh}
          class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Refresh"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
        <button
          onclick={openInBrowser}
          class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Open in browser"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          onclick={viewLogs}
          class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="View logs"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button
          onclick={stopPreview}
          disabled={loading}
          class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
          title="Stop preview"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      {:else}
        <button
          onclick={startPreview}
          disabled={loading || !sessionId}
          class="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {#if loading}
            <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
            </svg>
          {:else}
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          {/if}
          Start
        </button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden relative">
    {#if (status === "running" || status === "starting") && currentUrl}
      {#key iframeKey}
        <iframe
          bind:this={iframeRef}
          src={iframeSrc()}
          class="w-full h-full border-0"
          title="Preview"
        ></iframe>
      {/key}
      {#if status === "starting"}
        <div class="absolute inset-0 bg-white/90 dark:bg-gray-900/90 flex flex-col items-center justify-center z-10">
          <svg class="w-8 h-8 animate-spin text-green-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
          </svg>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-300">Starting dev server...</p>
        </div>
      {/if}
    {:else if status === "starting" && !currentUrl}
      <div class="flex flex-col items-center justify-center h-full text-gray-500">
        <svg class="w-10 h-10 animate-spin text-green-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
        <p class="text-base font-medium text-gray-700 dark:text-gray-300">Starting dev server...</p>
        <p class="text-sm text-gray-400 mt-1">Installing dependencies if needed</p>
      </div>
    {:else if status === "error"}
      <div class="flex flex-col h-full overflow-hidden">
        <div class="flex-shrink-0 p-6 text-center border-b border-gray-100 dark:border-gray-700">
          <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          </div>
          <p class="text-base font-medium text-gray-700 dark:text-gray-300">Preview failed to start</p>
          {#if error}
            <p class="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
          {/if}
          <div class="flex items-center justify-center gap-2 mt-3">
            <button
              onclick={startPreview}
              disabled={loading}
              class="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onclick={() => showErrorLogs = !showErrorLogs}
              class="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              {showErrorLogs ? 'Hide' : 'Show'} Logs
            </button>
          </div>
        </div>

        {#if showErrorLogs && errorLogs.length > 0}
          <div class="flex-1 overflow-auto bg-gray-900 p-4">
            <pre class="text-xs font-mono text-gray-300 whitespace-pre-wrap">{#each errorLogs as line}<div class="py-0.5 hover:bg-gray-800 px-1 -mx-1 rounded {line.startsWith('[stderr]') ? 'text-red-400' : ''}">{line}</div>{/each}</pre>
          </div>
        {:else if showErrorLogs}
          <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">
            No logs available
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div class="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </div>
        <p class="text-lg font-medium text-gray-700 dark:text-gray-300">Preview</p>
        <p class="text-sm text-gray-400 mt-1 text-center max-w-xs">
          Start a dev server to preview your app. Ports are managed automatically.
        </p>
        {#if !sessionId}
          <p class="text-xs text-amber-600 mt-4">Start a chat first to enable preview</p>
        {:else}
          <button
            onclick={startPreview}
            disabled={loading}
            class="mt-4 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {#if loading}
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
              </svg>
            {:else}
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            {/if}
            Start Preview
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>
