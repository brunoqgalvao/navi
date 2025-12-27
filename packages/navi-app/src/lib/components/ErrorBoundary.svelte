<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    fallback?: import("svelte").Snippet<[{ error: Error; reset: () => void }]>;
    onError?: (error: Error, errorInfo: string) => void;
    children: import("svelte").Snippet;
  }

  let { fallback, onError, children }: Props = $props();

  let error: Error | null = $state(null);
  let errorInfo: string = $state("");

  function reset() {
    error = null;
    errorInfo = "";
  }

  // Catch unhandled errors from children
  onMount(() => {
    const handleError = (event: ErrorEvent) => {
      // Check if error is from our component tree
      // This is a best-effort approach since Svelte doesn't have React-style error boundaries
      console.error("[ErrorBoundary] Caught error:", event.error);
      error = event.error instanceof Error ? event.error : new Error(String(event.error));
      errorInfo = event.message || "Unknown error occurred";
      onError?.(error, errorInfo);
      event.preventDefault(); // Prevent the error from propagating
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[ErrorBoundary] Unhandled promise rejection:", event.reason);
      error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      errorInfo = "Unhandled promise rejection";
      onError?.(error, errorInfo);
      event.preventDefault();
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  });
</script>

{#if error}
  {#if fallback}
    {@render fallback({ error, reset })}
  {:else}
    <div class="error-boundary">
      <div class="error-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div class="error-content">
        <h3>Something went wrong</h3>
        <p class="error-message">{error.message}</p>
        <button class="retry-btn" onclick={reset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Try Again
        </button>
      </div>
    </div>
  {/if}
{:else}
  {@render children()}
{/if}

<style>
  .error-boundary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    height: 100%;
    min-height: 150px;
    background: #1a1b26;
    color: #a9b1d6;
  }

  .error-icon {
    color: #f7768e;
  }

  .error-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #c0caf5;
  }

  .error-message {
    margin: 0;
    font-size: 12px;
    color: #565f89;
    max-width: 300px;
    word-break: break-word;
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    color: #7aa2f7;
    background: rgba(122, 162, 247, 0.1);
    border: 1px solid rgba(122, 162, 247, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .retry-btn:hover {
    background: rgba(122, 162, 247, 0.2);
    border-color: rgba(122, 162, 247, 0.5);
  }
</style>
