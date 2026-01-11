<script lang="ts">
  /**
   * AuthGate Component
   *
   * Wraps content that requires authentication.
   * Shows a sign-up/sign-in prompt if not authenticated.
   *
   * Usage:
   * <AuthGate feature="email" featureDescription="your personal Navi email inbox">
   *   <EmailPanel />
   * </AuthGate>
   */

  import { auth, isAuthenticated, authLoading } from "$lib/stores/auth";
  import type { Snippet } from "svelte";

  interface Props {
    feature: string;
    featureDescription?: string;
    featureIcon?: string;
    children: Snippet;
  }

  let {
    feature,
    featureDescription = "this feature",
    featureIcon = "lock",
    children,
  }: Props = $props();

  let mode: "signin" | "signup" = $state("signup");
  let email = $state("");
  let password = $state("");
  let name = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;

    try {
      if (mode === "signup") {
        await auth.signUp(email, password, name || undefined);
      } else {
        await auth.signIn(email, password);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Authentication failed";
    } finally {
      loading = false;
    }
  }

  function toggleMode() {
    mode = mode === "signin" ? "signup" : "signin";
    error = null;
  }

  // Feature-specific icons
  const icons: Record<string, string> = {
    email: `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/>`,
    cloud: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`,
    browser: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="6" r="0.5"/><circle cx="9" cy="6" r="0.5"/>`,
    lock: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  };
</script>

{#if $authLoading}
  <!-- Loading state -->
  <div class="h-full flex items-center justify-center bg-white dark:bg-gray-900">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
{:else if $isAuthenticated}
  <!-- Authenticated - render children -->
  {@render children()}
{:else}
  <!-- Not authenticated - show sign up prompt -->
  <div class="h-full flex flex-col items-center justify-center bg-white dark:bg-gray-900 p-6">
    <div class="w-full max-w-sm">
      <!-- Feature icon -->
      <div class="flex justify-center mb-6">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            {@html icons[featureIcon] || icons.lock}
          </svg>
        </div>
      </div>

      <!-- Header -->
      <div class="text-center mb-6">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {mode === "signup" ? "Create your Navi account" : "Welcome back"}
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {mode === "signup"
            ? `Sign up to unlock ${featureDescription}`
            : `Sign in to access ${featureDescription}`}
        </p>
      </div>

      <!-- Form -->
      <form onsubmit={handleSubmit} class="space-y-4">
        {#if mode === "signup"}
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name (optional)
            </label>
            <input
              id="name"
              type="text"
              bind:value={name}
              placeholder="Your name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        {/if}

        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            required
            placeholder="you@example.com"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            minlength={8}
            placeholder="••••••••"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {#if error}
          <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {#if loading}
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          {/if}
          {mode === "signup" ? "Create Account" : "Sign In"}
        </button>
      </form>

      <!-- Toggle mode -->
      <div class="mt-6 text-center">
        <button
          type="button"
          onclick={toggleMode}
          class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </button>
      </div>

      <!-- Benefits for signup -->
      {#if mode === "signup"}
        <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p class="text-xs text-gray-500 dark:text-gray-400 text-center mb-3">
            What you'll get:
          </p>
          <ul class="space-y-2">
            <li class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg class="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              Personal Navi email address
            </li>
            <li class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg class="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              Autonomous service sign-ups
            </li>
            <li class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg class="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              Cloud execution with E2B
            </li>
          </ul>
        </div>
      {/if}
    </div>
  </div>
{/if}
