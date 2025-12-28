<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';

  interface UpdateInfo {
    version: string;
    notes: string;
    date: string;
  }

  let updateAvailable = writable<UpdateInfo | null>(null);
  let isChecking = writable(false);
  let isDownloading = writable(false);
  let downloadProgress = writable(0);
  let error = writable<string | null>(null);
  let showBanner = writable(false);
  let dismissed = writable(false);

  // Check for updates on mount and periodically
  let checkInterval: ReturnType<typeof setInterval>;

  async function checkForUpdates() {
    // Only run in Tauri environment
    if (typeof window === 'undefined' || !('__TAURI__' in window)) {
      return;
    }

    try {
      isChecking.set(true);
      error.set(null);

      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        updateAvailable.set({
          version: update.version,
          notes: update.body || 'No release notes available',
          date: update.date || new Date().toISOString()
        });
        showBanner.set(true);
        dismissed.set(false);
      } else {
        updateAvailable.set(null);
      }
    } catch (e) {
      console.error('Failed to check for updates:', e);
      // Don't show error to user for background checks
    } finally {
      isChecking.set(false);
    }
  }

  async function downloadAndInstall() {
    if (typeof window === 'undefined' || !('__TAURI__' in window)) {
      return;
    }

    try {
      isDownloading.set(true);
      error.set(null);
      downloadProgress.set(0);

      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');

      const update = await check();
      if (!update) {
        error.set('Update no longer available');
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            console.log(`Download started, size: ${contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              downloadProgress.set(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            console.log('Download finished');
            downloadProgress.set(100);
            break;
        }
      });

      // Relaunch the app to apply the update
      await relaunch();
    } catch (e) {
      console.error('Failed to download/install update:', e);
      error.set(e instanceof Error ? e.message : 'Failed to install update');
    } finally {
      isDownloading.set(false);
    }
  }

  function dismissUpdate() {
    dismissed.set(true);
    showBanner.set(false);
  }

  onMount(() => {
    // Check on startup after a short delay
    setTimeout(checkForUpdates, 5000);

    // Check every 6 hours
    checkInterval = setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  });

  onDestroy(() => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  });
</script>

{#if $showBanner && $updateAvailable && !$dismissed}
  <div class="update-banner">
    <div class="update-content">
      <div class="update-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
      <div class="update-text">
        <strong>Update Available</strong>
        <span class="version">v{$updateAvailable.version}</span>
      </div>
      {#if $isDownloading}
        <div class="progress-container">
          <div class="progress-bar" style="width: {$downloadProgress}%"></div>
          <span class="progress-text">{$downloadProgress}%</span>
        </div>
      {:else}
        <button class="update-button" on:click={downloadAndInstall}>
          Install & Restart
        </button>
        <button class="dismiss-button" on:click={dismissUpdate} title="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>
    {#if $error}
      <div class="error-message">{$error}</div>
    {/if}
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 1px solid #0f3460;
    border-radius: 12px;
    padding: 12px 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .update-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .update-icon {
    color: #4cc9f0;
    display: flex;
    align-items: center;
  }

  .update-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .update-text strong {
    color: #e0e0e0;
    font-size: 14px;
  }

  .version {
    color: #4cc9f0;
    font-size: 12px;
    font-weight: 500;
  }

  .update-button {
    background: linear-gradient(135deg, #4cc9f0 0%, #7209b7 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .update-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(76, 201, 240, 0.3);
  }

  .dismiss-button {
    background: transparent;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.2s, background 0.2s;
  }

  .dismiss-button:hover {
    color: #999;
    background: rgba(255, 255, 255, 0.1);
  }

  .progress-container {
    position: relative;
    width: 120px;
    height: 24px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
  }

  .progress-bar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(90deg, #4cc9f0, #7209b7);
    transition: width 0.3s ease;
  }

  .progress-text {
    position: absolute;
    width: 100%;
    text-align: center;
    line-height: 24px;
    font-size: 12px;
    color: white;
    font-weight: 500;
  }

  .error-message {
    color: #ff6b6b;
    font-size: 12px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 107, 107, 0.2);
  }
</style>
