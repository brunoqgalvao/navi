<!--
  NativePreviewPanel - Lightweight native preview panel

  Runs dev servers natively (no Docker).
  - One preview at a time
  - Auto-switches when changing worktrees/sessions
  - Fast startup, no container overhead
  - Compliance checking (validates project can be previewed)
-->
<script lang="ts">
  import { nativePreviewApi, getServerUrl, type PreviewComplianceResult, type PortConflictInfo } from "../api";

  interface Props {
    projectId: string | null;
    sessionId: string | null;
    branch: string | null;
    previewUrl?: string | null;
    onClose?: () => void;
    /** Callback to ask Claude to fix an error. Receives the error message and logs. */
    onAskClaude?: (message: string) => void;
  }

  let { projectId, sessionId, branch, previewUrl, onClose, onAskClaude }: Props = $props();

  let iframeRef = $state<HTMLIFrameElement | null>(null);
  let status = $state<"stopped" | "starting" | "running" | "error" | "switching" | "unavailable" | "conflict">("stopped");
  let error = $state<string | null>(null);
  let errorLogs = $state<string[]>([]);
  let showErrorLogs = $state(false);
  let loading = $state(false);
  let currentUrl = $state(previewUrl);
  let currentPort = $state<number | null>(null);
  let iframeKey = $state(Date.now());
  let framework = $state<string | null>(null);
  let compliance = $state<PreviewComplianceResult | null>(null);
  let checkingCompliance = $state(false);
  let portConflict = $state<PortConflictInfo | null>(null);
  let resolvingConflict = $state(false);

  const effectiveBranch = $derived(branch || "main");

  // Use the preview proxy to add CORS headers for cross-origin resources (fonts, etc)
  // The proxy at /api/preview/proxy/:port/* handles this and also injects the branch indicator
  const iframeSrc = $derived(() => {
    const proxyUrl = currentPort
      ? `${getServerUrl()}/api/preview/proxy/${currentPort}/`
      : currentUrl;
    console.log("[NativePreviewPanel] iframeSrc:", { currentPort, currentUrl, proxyUrl });
    return proxyUrl;
  });

  // Sync previewUrl prop to currentUrl
  $effect(() => {
    if (previewUrl) {
      currentUrl = previewUrl;
    }
  });

  // Check compliance and status on mount and when session changes
  $effect(() => {
    if (sessionId) {
      checkComplianceAndStatus();
    }
  });

  async function checkComplianceAndStatus() {
    if (!sessionId) return;
    console.log("[NativePreviewPanel] checkComplianceAndStatus", { sessionId, branch: effectiveBranch });
    checkingCompliance = true;

    try {
      // First check if preview is even possible
      const complianceResult = await nativePreviewApi.checkCompliance(sessionId);
      compliance = complianceResult;
      console.log("[NativePreviewPanel] Compliance:", complianceResult);

      if (!complianceResult.canPreview) {
        status = "unavailable";
        error = complianceResult.reason || null;
        checkingCompliance = false;
        return;
      }

      // Now check if there's an active preview
      await checkStatusAndMaybeSwitch();
    } catch (e) {
      console.error("[NativePreviewPanel] checkComplianceAndStatus error:", e);
      status = "stopped";
    } finally {
      checkingCompliance = false;
    }
  }

  async function checkStatusAndMaybeSwitch() {
    if (!sessionId) return;
    console.log("[NativePreviewPanel] checkStatusAndMaybeSwitch", { sessionId, branch: effectiveBranch });

    try {
      // Check status for THIS session only (not global!)
      // Each project can have its own preview running on a different port
      const result = await nativePreviewApi.getStatus(sessionId);
      console.log("[NativePreviewPanel] Session status:", result);

      if (result.running) {
        // This session's project has a preview running
        currentUrl = result.url || null;
        currentPort = result.port || null;
        framework = result.framework || null;
        error = result.error || null;

        if (result.status === "starting") {
          status = "starting";
          pollStatus();
        } else if (result.status === "error") {
          status = "error";
          await fetchErrorLogs();
        } else {
          status = "running";
        }
      } else {
        // No preview running for this session's project
        status = "stopped";
      }
    } catch (e) {
      console.error("[NativePreviewPanel] checkStatusAndMaybeSwitch error:", e);
      status = "stopped";
    }
  }

  async function checkStatus() {
    if (!sessionId) return;
    console.log("[NativePreviewPanel] checkStatus", { sessionId, branch: effectiveBranch });
    try {
      const result = await nativePreviewApi.getStatus(sessionId);
      console.log("[NativePreviewPanel] status result:", result);
      if (result.running) {
        currentUrl = result.url || null;
        currentPort = result.port || null;
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
      console.error("[NativePreviewPanel] checkStatus error:", e);
      status = "stopped";
    }
  }

  async function startPreview() {
    console.log("[NativePreviewPanel] startPreview", { sessionId, projectId, branch: effectiveBranch });
    if (!sessionId) {
      console.log("[NativePreviewPanel] No sessionId, cannot start");
      return;
    }
    loading = true;
    error = null;
    portConflict = null;
    try {
      console.log("[NativePreviewPanel] Calling nativePreviewApi.start");
      const result = await nativePreviewApi.start(sessionId);
      console.log("[NativePreviewPanel] Start result:", result);
      if (result.success) {
        status = "starting";
        currentUrl = result.url || null;
        currentPort = result.port || null;
        pollStatus();
      } else if ('conflict' in result && result.conflict) {
        // Port conflict detected - show dialog for user to choose
        portConflict = result.conflict;
        status = "conflict";
      } else if ('error' in result && result.error) {
        error = result.error;
        status = "error";
      }
    } catch (e: any) {
      console.error("[NativePreviewPanel] Start error:", e);
      error = e.message;
      status = "error";
    } finally {
      loading = false;
    }
  }

  async function resolvePortConflict(action: 'use_alternative' | 'kill_and_use_original') {
    if (!sessionId || !portConflict) return;

    resolvingConflict = true;
    try {
      console.log("[NativePreviewPanel] Resolving conflict with action:", action);
      const result = await nativePreviewApi.resolveConflict(sessionId, action);
      console.log("[NativePreviewPanel] Resolve result:", result);

      if (result.success) {
        portConflict = null;
        status = "starting";
        currentUrl = result.url || null;
        currentPort = result.port || null;
        pollStatus();
      } else if ('conflict' in result && result.conflict) {
        // Another conflict (shouldn't happen often)
        portConflict = result.conflict;
      } else if ('error' in result && result.error) {
        error = result.error;
        status = "error";
        portConflict = null;
      }
    } catch (e: any) {
      console.error("[NativePreviewPanel] Resolve conflict error:", e);
      error = e.message;
      status = "error";
      portConflict = null;
    } finally {
      resolvingConflict = false;
    }
  }

  async function fetchErrorLogs() {
    if (!sessionId) return;
    try {
      const result = await nativePreviewApi.getLogs(sessionId, 50);
      errorLogs = result.logs || [];
      showErrorLogs = true;
    } catch (e) {
      console.error("[NativePreviewPanel] Failed to fetch error logs:", e);
    }
  }

  async function stopPreview() {
    if (!sessionId) return;
    loading = true;
    try {
      await nativePreviewApi.stop(sessionId);
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
    console.log("[NativePreviewPanel] Starting status polling...");
    const interval = setInterval(async () => {
      try {
        const result = await nativePreviewApi.getStatus(sessionId!);
        console.log("[NativePreviewPanel] Poll result:", result.status);
        if (result.status === "running") {
          status = "running";
          currentUrl = result.url || null;
          currentPort = result.port || null;
          framework = result.framework || null;
          iframeKey = Date.now();
          clearInterval(interval);
        } else if (result.status === "error" || !result.running) {
          status = "error";
          error = result.error || "Preview failed";
          await fetchErrorLogs();
          clearInterval(interval);
        } else if (result.status === "starting" && result.url) {
          // Check if URL is responding
          try {
            await fetch(result.url, { method: 'HEAD', mode: 'no-cors' });
            console.log("[NativePreviewPanel] URL responding, marking as running");
            status = "running";
            currentUrl = result.url;
            // CRITICAL: Also update currentPort so iframeSrc uses the proxy
            if (result.port) {
              currentPort = result.port;
            }
            console.log("[NativePreviewPanel] Set currentPort:", currentPort, "currentUrl:", currentUrl);
            iframeKey = Date.now();
            clearInterval(interval);
          } catch {
            // Not responding yet, keep polling
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    setTimeout(() => clearInterval(interval), 60000); // 1 minute timeout
  }

  function refresh() {
    if (iframeRef && currentUrl) {
      iframeKey = Date.now();
    }
  }

  async function viewLogs() {
    if (!sessionId) return;
    try {
      const result = await nativePreviewApi.getLogs(sessionId, 200);
      const logs = result.logs || [];
      if (logs.length > 0) {
        const logWindow = window.open('', '_blank', 'width=900,height=600');
        if (logWindow) {
          logWindow.document.write(`
            <html>
              <head>
                <title>Native Preview Logs - ${effectiveBranch}</title>
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

  function askClaudeToFix() {
    if (!onAskClaude) return;

    // Build a helpful message for Claude with the error context
    const logsContext = errorLogs.length > 0
      ? `\n\nDev server logs:\n\`\`\`\n${errorLogs.slice(-30).join('\n')}\n\`\`\``
      : '';

    const message = `The preview failed to start with the following error:

${error || 'Unknown error'}${logsContext}

Can you help fix this issue so the preview can start successfully?`;

    onAskClaude(message);
  }
</script>

<div class="flex flex-col h-full bg-gray-50">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <span class="text-lg">⚡</span>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full {status === 'running' ? 'bg-green-500' : status === 'starting' ? 'bg-yellow-500 animate-pulse' : status === 'error' ? 'bg-red-500' : status === 'conflict' ? 'bg-amber-500' : 'bg-gray-400'}"></span>
        <span class="text-sm font-medium text-gray-700 capitalize">{status === 'conflict' ? 'port conflict' : status}</span>
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
          class="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
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
          src={iframeSrc()}
          class="w-full h-full border-0"
          title="Native Preview"
        ></iframe>
      {/key}
      {#if status === "starting"}
        <div class="absolute inset-0 bg-white/90 flex flex-col items-center justify-center z-10">
          <svg class="w-10 h-10 animate-spin text-emerald-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
          </svg>
          <p class="text-sm font-medium text-gray-600">Starting dev server...</p>
          <p class="text-xs text-gray-400 mt-1">This should be quick</p>
        </div>
      {/if}
    {:else if status === "switching"}
      <div class="flex flex-col items-center justify-center h-full text-gray-500">
        <svg class="w-12 h-12 animate-spin text-amber-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
        <p class="text-lg font-medium">Switching preview...</p>
        <p class="text-sm text-gray-400 mt-1">Stopping old preview and starting new one for this branch</p>
      </div>
    {:else if status === "starting" && !currentUrl}
      <div class="flex flex-col items-center justify-center h-full text-gray-500">
        <svg class="w-12 h-12 animate-spin text-emerald-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
        <p class="text-lg font-medium">Starting dev server...</p>
        <p class="text-sm text-gray-400 mt-1">Running locally, no container overhead</p>
      </div>
    {:else if status === "error"}
      <div class="flex flex-col h-full overflow-hidden">
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
          <div class="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <button
              onclick={startPreview}
              disabled={loading}
              class="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onclick={() => showErrorLogs = !showErrorLogs}
              class="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {showErrorLogs ? 'Hide' : 'Show'} Logs
            </button>
            {#if onAskClaude}
              <button
                onclick={askClaudeToFix}
                class="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3m9 0a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3"/>
                </svg>
                Ask Claude
              </button>
            {/if}
          </div>
        </div>

        {#if showErrorLogs && errorLogs.length > 0}
          <div class="flex-1 overflow-auto bg-gray-900 p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Dev Server Logs</span>
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
    {:else if status === "conflict" && portConflict}
      <!-- Port conflict dialog -->
      <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div class="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <p class="text-lg font-medium text-gray-700">Port Conflict Detected</p>
        <p class="text-sm text-gray-500 mt-2 text-center max-w-md">
          Port <span class="font-mono font-medium text-amber-700">{portConflict.requestedPort}</span> is already in use by
          <span class="font-medium">{portConflict.conflictProcess.name}</span>
          {#if portConflict.conflictProcess.isDevServer}
            <span class="text-gray-400">(dev server)</span>
          {/if}
        </p>

        <div class="mt-6 flex flex-col gap-3 w-full max-w-sm">
          <!-- Option 1: Use alternative port -->
          <button
            onclick={() => resolvePortConflict('use_alternative')}
            disabled={resolvingConflict}
            class="w-full px-4 py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {#if resolvingConflict}
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
              </svg>
            {:else}
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            {/if}
            Use port {portConflict.alternativePort} instead
          </button>

          <!-- Option 2: Kill and use original -->
          <button
            onclick={() => resolvePortConflict('kill_and_use_original')}
            disabled={resolvingConflict}
            class="w-full px-4 py-3 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {#if resolvingConflict}
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
              </svg>
            {:else}
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {/if}
            Stop existing process & use port {portConflict.requestedPort}
          </button>

          <!-- Cancel -->
          <button
            onclick={() => { portConflict = null; status = "stopped"; }}
            disabled={resolvingConflict}
            class="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <p class="text-xs text-gray-400 mt-4 text-center max-w-sm">
          {#if portConflict.conflictProcess.isDevServer}
            The existing process appears to be a dev server from another project.
          {:else}
            The existing process may be important. Use caution when stopping it.
          {/if}
        </p>
      </div>
    {:else if status === "unavailable"}
      <!-- Preview not available for this project -->
      <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-10 h-10 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M4.93 4.93l14.14 14.14" />
          </svg>
        </div>
        <p class="text-lg font-medium text-gray-700">Preview Unavailable</p>
        <p class="text-sm text-gray-500 mt-1 text-center max-w-sm">
          {error || "This project cannot be previewed"}
        </p>
        {#if compliance?.suggestions?.length}
          <div class="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-sm">
            <p class="text-xs font-medium text-amber-800 mb-2">To enable preview:</p>
            <ul class="text-xs text-amber-700 space-y-1">
              {#each compliance.suggestions as suggestion}
                <li class="flex items-start gap-2">
                  <span class="text-amber-500 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <button
          onclick={checkComplianceAndStatus}
          class="mt-4 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Re-check
        </button>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        {#if checkingCompliance}
          <svg class="w-10 h-10 animate-spin text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
          </svg>
          <p class="text-sm text-gray-500">Checking preview availability...</p>
        {:else}
          <div class="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <span class="text-4xl">⚡</span>
          </div>
          <p class="text-lg font-medium text-gray-700">Native Preview</p>
          <p class="text-sm text-gray-400 mt-1 text-center max-w-sm">
            Run your dev server locally. Fast startup, no Docker required.
            Auto-detects framework and package manager.
          </p>
          {#if compliance?.framework}
            <p class="text-xs text-emerald-600 mt-2">Detected: {compliance.framework}</p>
          {/if}
          {#if compliance?.resolvedPath}
            <p class="text-xs text-gray-400 mt-1 font-mono truncate max-w-xs" title={compliance.resolvedPath}>
              📁 {compliance.resolvedPath.split('/').slice(-2).join('/')}
            </p>
          {/if}
          {#if compliance?.needsInstall}
            <p class="text-xs text-amber-600 mt-2">📦 Dependencies will be installed automatically</p>
          {/if}
          {#if !sessionId}
            <p class="text-xs text-amber-600 mt-3">Start a chat first to enable preview</p>
          {:else}
            <button
              onclick={startPreview}
              disabled={loading}
              class="mt-4 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
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
        {/if}
      </div>
    {/if}
  </div>
</div>
