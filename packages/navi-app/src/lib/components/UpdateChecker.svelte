<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    updateStore,
    updateAvailable,
    isCheckingUpdate,
    isDownloadingUpdate,
    updateDownloadProgress,
    updateError,
    showUpdateBanner,
  } from '../stores/update';

  // Check for updates on mount and periodically
  let checkInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    // Get current version on startup
    updateStore.getCurrentVersion();

    // Check on startup after a short delay
    setTimeout(() => updateStore.checkForUpdates(), 5000);

    // Check every 6 hours
    checkInterval = setInterval(() => updateStore.checkForUpdates(), 6 * 60 * 60 * 1000);
  });

  onDestroy(() => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  });
</script>

{#if $showUpdateBanner && $updateAvailable}
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
      {#if $isDownloadingUpdate}
        <div class="progress-container">
          <div class="progress-bar" style="width: {$updateDownloadProgress}%"></div>
          <span class="progress-text">{$updateDownloadProgress}%</span>
        </div>
      {:else}
        <button class="update-button" on:click={() => updateStore.downloadAndInstall()}>
          Install & Restart
        </button>
        <button class="dismiss-button" on:click={() => updateStore.dismiss()} title="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>
    {#if $updateError}
      <div class="error-message">{$updateError}</div>
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
