<!--
  ContainerPreviewPanel - Embedded browser for container previews

  Shows the preview URL in an iframe with controls for:
  - Status indicator
  - Refresh
  - Open in browser
  - View logs
  - Stop preview
-->
<script lang="ts">
  import { containerPreviewApi, getServerUrl } from "../api";

  interface Props {
    projectId: string | null;
    sessionId: string | null;
    branch: string | null;
    previewUrl: string | null;
    onClose?: () => void;
  }

  let { projectId, sessionId, branch, previewUrl, onClose }: Props = $props();

  let iframeRef = $state<HTMLIFrameElement | null>(null);
  let status = $state<"stopped" | "starting" | "running" | "paused" | "error">("stopped");
  let error = $state<string | null>(null);
  let errorLogs = $state<string[]>([]);
  let showErrorLogs = $state(false);
  let loading = $state(false);
  let currentUrl = $state(previewUrl);
  let iframeKey = $state(Date.now()); // Used to force iframe refresh
  let branchIndicatorInjected = $state(false);

  // Track active polling interval for cleanup
  let statusPollInterval: ReturnType<typeof setInterval> | null = null;

  const effectiveBranch = $derived(branch || "main");

  // Convert direct URL to proxy URL for iframe (injects branch indicator)
  // Direct URL: http://localhost:4001 -> Proxy URL: http://localhost:3001/api/preview/proxy/4001/
  const proxyUrl = $derived(() => {
    if (!currentUrl) return null;
    try {
      const url = new URL(currentUrl);
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      return `${getServerUrl()}/api/preview/proxy/${port}${url.pathname}`;
    } catch {
      return currentUrl; // Fallback to direct URL if parsing fails
    }
  });

  // Sync previewUrl prop to currentUrl
  $effect(() => {
    if (previewUrl) {
      currentUrl = previewUrl;
    }
  });

  // Check status on mount
  $effect(() => {
    if (projectId && effectiveBranch) {
      checkStatus();
    }
  });

  async function checkStatus() {
    if (!projectId) return;
    try {
      const result = await containerPreviewApi.getStatusByBranch(projectId, effectiveBranch);
      if (result.exists) {
        currentUrl = result.url || null;
        error = result.error || null;

        // If status is "starting" but URL exists, verify if it's actually responding
        if (result.status === "starting" && result.url) {
          try {
            await fetch(result.url, { method: 'HEAD', mode: 'no-cors' });
            // If fetch succeeds, it's actually running
            status = "running";
          } catch {
            // Not responding yet, keep as starting
            status = "starting";
            // Start polling to wait for it
            pollStatus();
          }
        } else if (result.status === "error") {
          status = "error";
          // Fetch logs to show what went wrong
          await fetchErrorLogs();
        } else {
          status = (result.status as any) || "running";
        }
      } else {
        status = "stopped";
      }
    } catch (e) {
      console.error("[ContainerPreviewPanel] checkStatus error:", e);
      status = "stopped";
    }
  }

  async function startPreview() {
    if (!sessionId) {
      return;
    }
    loading = true;
    error = null;
    try {
      const result = await containerPreviewApi.start(sessionId);
      if (result.success && result.preview) {
        status = (result.preview.status as any) || "starting";
        currentUrl = result.preview.url;
        pollStatus();
      } else if (result.error) {
        error = result.error;
        status = "error";
      }
    } catch (e: any) {
      console.error("[ContainerPreviewPanel] Start error:", e);
      error = e.message;
      status = "error";
    } finally {
      loading = false;
    }
  }

  async function fetchErrorLogs() {
    if (!sessionId) return;
    try {
      const result = await containerPreviewApi.getLogs(sessionId, 50);
      errorLogs = result.logs || [];
      showErrorLogs = true;
    } catch (e) {
      console.error("[ContainerPreviewPanel] Failed to fetch error logs:", e);
    }
  }

  async function stopPreview() {
    if (!projectId) return;
    loading = true;
    try {
      await containerPreviewApi.stopByBranch(projectId, effectiveBranch);
      status = "stopped";
      currentUrl = null;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function pollStatus() {
    if (!projectId) return;
    // Clear any existing interval first
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
    statusPollInterval = setInterval(async () => {
      try {
        const result = await containerPreviewApi.getStatusByBranch(projectId!, effectiveBranch);
        if (result.status === "running") {
          status = "running";
          currentUrl = result.url || null;
          // Force iframe refresh by updating the key
          iframeKey = Date.now();
          if (statusPollInterval) clearInterval(statusPollInterval);
          statusPollInterval = null;
        } else if (result.status === "error") {
          status = "error";
          error = result.error || "Preview failed";
          await fetchErrorLogs();
          if (statusPollInterval) clearInterval(statusPollInterval);
          statusPollInterval = null;
        } else if (result.status === "starting" && result.url) {
          // Server says "starting" but let's check if URL is actually responding
          try {
            const response = await fetch(result.url, { method: 'HEAD', mode: 'no-cors' });
            // no-cors mode means we can't check response.ok, but if it doesn't throw, it's likely up
            status = "running";
            currentUrl = result.url;
            iframeKey = Date.now();
            if (statusPollInterval) clearInterval(statusPollInterval);
            statusPollInterval = null;
          } catch {
            // URL not responding yet, keep polling
          }
        }
      } catch {
        if (statusPollInterval) clearInterval(statusPollInterval);
        statusPollInterval = null;
      }
    }, 2000);
    // Timeout after 120s
    setTimeout(() => {
      if (statusPollInterval) clearInterval(statusPollInterval);
      statusPollInterval = null;
    }, 120000);
  }

  // Cleanup on component unmount
  $effect(() => {
    return () => {
      if (statusPollInterval) {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
      }
    };
  });

  function refresh() {
    if (iframeRef && currentUrl) {
      iframeRef.src = proxyUrl() || currentUrl;
    }
  }

  async function viewLogs() {
    if (!sessionId) return;
    try {
      const result = await containerPreviewApi.getLogs(sessionId, 200);
      const logs = result.logs || [];
      if (logs.length > 0) {
        const logWindow = window.open('', '_blank', 'width=900,height=600');
        if (logWindow) {
          logWindow.document.write(`
            <html>
              <head>
                <title>Container Preview Logs - ${effectiveBranch}</title>
                <style>
                  body { font-family: ui-monospace, monospace; background: #0d1117; color: #c9d1d9; padding: 16px; margin: 0; }
                  pre { white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 1.6; margin: 0; }
                  .line { padding: 2px 8px; border-radius: 2px; }
                  .line:hover { background: #161b22; }
                </style>
              </head>
              <body>
                <pre>${logs.map(l => `<div class="line">${l.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`).join('')}</pre>
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

  async function resetConfig() {
    if (!projectId) return;
    try {
      await containerPreviewApi.resetConfig(projectId);
      // Show brief success feedback
      alert("Preview config reset! The next preview will auto-detect your framework again.");
    } catch (e: any) {
      alert(`Failed to reset config: ${e.message}`);
    }
  }

  // Inject branch indicator into iframe when it loads
  $effect(() => {
    if (!iframeRef || status !== "running" || !effectiveBranch) {
      return;
    }

    const handleIframeLoad = () => {
      try {
        // Send branch info to the iframe
        const targetOrigin = currentUrl ? new URL(currentUrl).origin : '*';
        iframeRef?.contentWindow?.postMessage({
          type: 'navi:branchInfo',
          branch: effectiveBranch,
          meta: 'Container Preview'
        }, targetOrigin);
      } catch (e) {
        console.warn('[ContainerPreviewPanel] Could not send branch info:', e);
      }
    };

    iframeRef.addEventListener('load', handleIframeLoad);
    return () => iframeRef?.removeEventListener('load', handleIframeLoad);
  });

  // Listen for requests from iframe
  $effect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'navi:getBranchInfo' && effectiveBranch) {
        const targetOrigin = currentUrl ? new URL(currentUrl).origin : '*';
        event.source?.postMessage({
          type: 'navi:branchInfo',
          branch: effectiveBranch,
          meta: 'Container Preview'
        }, { targetOrigin } as any);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<div class="flex flex-col h-full bg-gray-50">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <span class="text-lg">🐳</span>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full {status === 'running' ? 'bg-green-500' : status === 'starting' ? 'bg-yellow-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-gray-400'}"></span>
        <span class="text-sm font-medium text-gray-700 capitalize">{status}</span>
      </div>
      {#if currentUrl}
        <span class="text-xs text-gray-400 truncate font-mono">{currentUrl}</span>
      {/if}
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-1">
      {#if status === "running" || status === "starting"}
        <button
          onclick={refresh}
          class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          title="Refresh"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
        <button
          onclick={openInBrowser}
          class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          title="Open in browser"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          onclick={viewLogs}
          class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          title="View logs"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button
          onclick={stopPreview}
          disabled={loading}
          class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
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
          class="px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
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
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden relative">
    {#if (status === "running" || status === "starting") && currentUrl}
      {#key iframeKey}
        <iframe
          bind:this={iframeRef}
          src={proxyUrl() || currentUrl}
          class="w-full h-full border-0"
          title="Container Preview"
        ></iframe>
      {/key}
      {#if status === "starting"}
        <!-- Loading overlay while container is starting -->
        <div class="absolute inset-0 bg-white/90 flex flex-col items-center justify-center z-10">
          <svg class="w-10 h-10 animate-spin text-cyan-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
          </svg>
          <p class="text-sm font-medium text-gray-600">Starting dev server...</p>
          <p class="text-xs text-gray-400 mt-1">This may take a moment</p>
        </div>
      {/if}
    {:else if status === "starting" && !currentUrl}
      <div class="flex flex-col items-center justify-center h-full text-gray-500">
        <svg class="w-12 h-12 animate-spin text-cyan-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
        <p class="text-lg font-medium">Starting container...</p>
        <p class="text-sm text-gray-400 mt-1">Installing dependencies and starting dev server</p>
      </div>
    {:else if status === "error"}
      <div class="flex flex-col h-full overflow-hidden">
        <!-- Error header -->
        <div class="flex-shrink-0 p-6 text-center border-b border-gray-100">
          <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          </div>
          <p class="text-base font-medium text-gray-700">Preview failed to start</p>
          {#if error}
            <p class="text-sm text-red-600 mt-1">{error}</p>
          {/if}
          <div class="flex items-center justify-center gap-2 mt-3">
            <button
              onclick={startPreview}
              disabled={loading}
              class="px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onclick={() => showErrorLogs = !showErrorLogs}
              class="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {showErrorLogs ? 'Hide' : 'Show'} Logs
            </button>
            <button
              onclick={resetConfig}
              disabled={!projectId}
              class="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
              title="Clear cached config and re-detect framework"
            >
              Reset Config
            </button>
          </div>
        </div>

        <!-- Error logs -->
        {#if showErrorLogs && errorLogs.length > 0}
          <div class="flex-1 overflow-auto bg-gray-900 p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Build / Startup Logs</span>
              <button
                onclick={fetchErrorLogs}
                class="text-xs text-gray-400 hover:text-gray-300"
              >
                Refresh
              </button>
            </div>
            <pre class="text-xs font-mono text-gray-300 whitespace-pre-wrap">{#each errorLogs as line}<div class="py-0.5 hover:bg-gray-800 px-1 -mx-1 rounded">{line}</div>{/each}</pre>
          </div>
        {:else if showErrorLogs}
          <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">
            No logs available
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div class="w-20 h-20 rounded-full bg-cyan-50 flex items-center justify-center mb-4">
          <span class="text-4xl">🐳</span>
        </div>
        <p class="text-lg font-medium text-gray-700">Container Preview</p>
        <p class="text-sm text-gray-400 mt-1 text-center max-w-sm">
          Run your dev server in an isolated Docker container.
          Auto-detects framework and package manager.
        </p>
        {#if !sessionId}
          <p class="text-xs text-amber-600 mt-3">Start a chat first to enable preview</p>
        {:else}
          <button
            onclick={startPreview}
            disabled={loading}
            class="mt-4 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
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
          {#if projectId}
            <button
              onclick={resetConfig}
              class="mt-2 text-xs text-gray-400 hover:text-gray-600 hover:underline"
              title="Clear cached framework detection and re-detect on next start"
            >
              Reset cached config
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>
