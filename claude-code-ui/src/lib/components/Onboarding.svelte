<script lang="ts">
  import { api } from "../api";

  interface Props {
    onComplete: () => void;
  }

  let { onComplete }: Props = $props();

  type Step = "intro-1" | "intro-2" | "intro-3" | "checking" | "setup" | "choose-auth" | "api-key" | "terminal-login" | "no-account" | "complete";
  type AuthStatus = {
    claudeInstalled: boolean;
    claudePath: string;
    authenticated: boolean;
    authMethod: "oauth" | "api_key" | null;
    hasApiKey: boolean;
    hasOAuth: boolean;
    preferredAuth: "oauth" | "api_key" | null;
  };

  let step = $state<Step>("intro-1");
  let authStatus = $state<AuthStatus | null>(null);
  let apiKey = $state("");
  let error = $state("");
  let isLoading = $state(false);
  let settingPreferred = $state(false);

  async function checkAuthStatus() {
    step = "checking";
    try {
      authStatus = await api.auth.status();
      if (authStatus.hasApiKey && authStatus.hasOAuth) {
        step = "choose-auth";
      } else if (authStatus.authenticated) {
        step = "complete";
      } else {
        step = "setup";
      }
    } catch (e) {
      step = "setup";
      authStatus = {
        claudeInstalled: false,
        claudePath: "",
        authenticated: false,
        authMethod: null,
        hasApiKey: false,
        hasOAuth: false,
        preferredAuth: null,
      };
    }
  }

  async function setPreferredAuth(method: "oauth" | "api_key") {
    settingPreferred = true;
    try {
      await api.auth.setPreferred(method);
      if (authStatus) {
        authStatus = { ...authStatus, authMethod: method, preferredAuth: method };
      }
      step = "complete";
    } catch (e) {
      console.error("Failed to set preferred auth:", e);
    } finally {
      settingPreferred = false;
    }
  }

  async function submitApiKey() {
    if (!apiKey.trim()) {
      error = "Please enter an API key";
      return;
    }
    
    isLoading = true;
    error = "";
    
    try {
      await api.auth.setApiKey(apiKey.trim());
      authStatus = await api.auth.status();
      if (authStatus.authenticated) {
        if (authStatus.hasOAuth) {
          step = "choose-auth";
        } else {
          step = "complete";
        }
      } else {
        error = "API key saved but authentication failed. Please check your key.";
      }
    } catch (e: any) {
      error = e.message || "Failed to save API key";
    } finally {
      isLoading = false;
    }
  }

  async function handleOAuthComplete() {
    isLoading = true;
    try {
      authStatus = await api.auth.status();
      if (authStatus.hasOAuth) {
        if (authStatus.hasApiKey) {
          step = "choose-auth";
        } else {
          step = "complete";
        }
      }
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !isLoading) {
      if (step === "api-key") {
        submitApiKey();
      } else if (step.startsWith("intro-")) {
        nextIntro();
      }
    }
  }

  function nextIntro() {
    if (step === "intro-1") step = "intro-2";
    else if (step === "intro-2") step = "intro-3";
    else if (step === "intro-3") checkAuthStatus();
  }

  function prevIntro() {
    if (step === "intro-2") step = "intro-1";
    else if (step === "intro-3") step = "intro-2";
  }

  function handleComplete() {
    onComplete();
  }

  const introSteps = ["intro-1", "intro-2", "intro-3"];
  $effect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (introSteps.includes(step)) {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          nextIntro();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevIntro();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function getCurrentIntroIndex(): number {
    if (step === "intro-1") return 0;
    if (step === "intro-2") return 1;
    if (step === "intro-3") return 2;
    return -1;
  }
</script>

<div class="fixed inset-0 z-[100] bg-white flex items-center justify-center">
  <div class="max-w-lg w-full mx-6">
    
    {#if step === "intro-1"}
      <div class="text-center space-y-8">
        <div class="w-20 h-20 mx-auto bg-gray-900 rounded-2xl flex items-center justify-center">
          <svg width="40" height="32" viewBox="0 0 160 120" stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none">
            <path d="M 35 30 L 10 60 L 35 90" />
            <path d="M 70 95 L 90 25" />
            <path d="M 125 30 L 150 60 L 125 90" />
          </svg>
        </div>
        
        <div class="space-y-3">
          <h1 class="text-2xl font-semibold text-gray-900">Welcome to Navi</h1>
          <p class="text-gray-500 leading-relaxed">
            Your local AI coding assistant. Navi runs entirely on your machine, keeping your code private while giving you the full power of Claude.
          </p>
        </div>
        
        <div class="flex items-center justify-center gap-2">
          {#each [0, 1, 2] as i}
            <div class="w-2 h-2 rounded-full transition-all {i === 0 ? 'bg-gray-900' : 'bg-gray-200'}"></div>
          {/each}
        </div>
        
        <button
          onclick={nextIntro}
          class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
        >
          Get Started
        </button>
        
        <p class="text-xs text-gray-400">Press Enter or use arrow keys to navigate</p>
      </div>
    {/if}

    {#if step === "intro-2"}
      <div class="text-center space-y-8">
        <div class="w-20 h-20 mx-auto bg-indigo-50 rounded-2xl flex items-center justify-center">
          <svg class="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        
        <div class="space-y-3">
          <h2 class="text-2xl font-semibold text-gray-900">What Navi Can Do</h2>
          <p class="text-gray-500 leading-relaxed">
            Edit multiple files at once, run terminal commands, search the web, and navigate your codebase - all through natural conversation.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 text-left max-w-sm mx-auto">
          <div class="bg-gray-50 rounded-xl p-3">
            <div class="text-sm font-medium text-gray-900">Multi-file editing</div>
            <div class="text-xs text-gray-500 mt-0.5">Refactor across your entire project</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3">
            <div class="text-sm font-medium text-gray-900">Terminal access</div>
            <div class="text-xs text-gray-500 mt-0.5">Run commands, tests, and builds</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3">
            <div class="text-sm font-medium text-gray-900">Web search</div>
            <div class="text-xs text-gray-500 mt-0.5">Find docs and solutions online</div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3">
            <div class="text-sm font-medium text-gray-900">File preview</div>
            <div class="text-xs text-gray-500 mt-0.5">See changes as they happen</div>
          </div>
        </div>
        
        <div class="flex items-center justify-center gap-2">
          {#each [0, 1, 2] as i}
            <div class="w-2 h-2 rounded-full transition-all {i === 1 ? 'bg-gray-900' : 'bg-gray-200'}"></div>
          {/each}
        </div>
        
        <div class="flex justify-center gap-3">
          <button onclick={prevIntro} class="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-medium transition-colors">
            Back
          </button>
          <button
            onclick={nextIntro}
            class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    {/if}

    {#if step === "intro-3"}
      <div class="text-center space-y-8">
        <div class="w-20 h-20 mx-auto bg-amber-50 rounded-2xl flex items-center justify-center">
          <svg class="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        
        <div class="space-y-3">
          <h2 class="text-2xl font-semibold text-gray-900">Private & Secure</h2>
          <p class="text-gray-500 leading-relaxed">
            Your code stays on your machine. Navi communicates directly with Anthropic's API - no middleman, no data storage, no tracking.
          </p>
        </div>

        <div class="bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto space-y-3">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div class="text-sm text-gray-600">Code processed locally, sent only to Anthropic</div>
          </div>
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div class="text-sm text-gray-600">Credentials stored locally in your home directory</div>
          </div>
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div class="text-sm text-gray-600">Open source - inspect the code yourself</div>
          </div>
        </div>
        
        <div class="flex items-center justify-center gap-2">
          {#each [0, 1, 2] as i}
            <div class="w-2 h-2 rounded-full transition-all {i === 2 ? 'bg-gray-900' : 'bg-gray-200'}"></div>
          {/each}
        </div>
        
        <div class="flex justify-center gap-3">
          <button onclick={prevIntro} class="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-medium transition-colors">
            Back
          </button>
          <button
            onclick={nextIntro}
            class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Set Up Authentication
          </button>
        </div>
      </div>
    {/if}

    {#if step === "checking"}
      <div class="text-center space-y-4">
        <div class="w-10 h-10 mx-auto">
          <div class="w-full h-full rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin"></div>
        </div>
        <p class="text-sm text-gray-500">Checking setup...</p>
      </div>
    {/if}

    {#if step === "choose-auth"}
      <div class="space-y-6">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-900">Choose Auth Method</h2>
          <p class="text-sm text-gray-500">You have both OAuth and API key configured</p>
        </div>

        <div class="space-y-2">
          <button
            onclick={() => setPreferredAuth("oauth")}
            disabled={settingPreferred}
            class="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all disabled:opacity-50"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm">Anthropic OAuth</div>
                <div class="text-xs text-gray-500">Use your subscription</div>
              </div>
            </div>
          </button>

          <button
            onclick={() => setPreferredAuth("api_key")}
            disabled={settingPreferred}
            class="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all disabled:opacity-50"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm">API Key</div>
                <div class="text-xs text-gray-500">Pay as you go</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    {/if}

    {#if step === "setup"}
      <div class="space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-xl font-semibold text-gray-900">Connect to Claude</h2>
          <p class="text-sm text-gray-500">Choose how to authenticate</p>
        </div>

        <div class="space-y-2">
          {#if authStatus?.claudeInstalled}
            <button
              onclick={() => step = "terminal-login"}
              class="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 text-sm">Login with Anthropic</div>
                  <div class="text-xs text-gray-500">Use your account subscription</div>
                </div>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </button>
          {/if}

          <button
            onclick={() => step = "api-key"}
            class="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm">Use API Key</div>
                <div class="text-xs text-gray-500">Pay as you go pricing</div>
              </div>
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </button>

          <button
            onclick={() => step = "no-account"}
            class="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-all"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm">I need an account</div>
                <div class="text-xs text-gray-500">Get started with Anthropic</div>
              </div>
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </button>
        </div>

        <button onclick={onComplete} class="w-full text-sm text-gray-400 hover:text-gray-600">
          Skip for now
        </button>
      </div>
    {/if}

    {#if step === "no-account"}
      <div class="space-y-6">
        <button onclick={() => step = "setup"} class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Back
        </button>

        <div class="space-y-2">
          <h2 class="text-xl font-semibold text-gray-900">Get Started</h2>
          <p class="text-sm text-gray-500">Sign up for Claude access</p>
        </div>

        <div class="space-y-2">
          <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" class="block w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 transition-all">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                <span class="text-orange-600 font-bold">C</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm">Claude Pro - $20/mo</div>
                <div class="text-xs text-gray-500">Includes Claude Code access</div>
              </div>
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </div>
          </a>

          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" class="block w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 transition-all">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm">API Access</div>
                <div class="text-xs text-gray-500">Pay as you go</div>
              </div>
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </div>
          </a>
        </div>

        <button onclick={() => checkAuthStatus()} class="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-medium transition-colors">
          I've signed up
        </button>
      </div>
    {/if}

    {#if step === "api-key"}
      <div class="space-y-6">
        <button onclick={() => step = "setup"} class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Back
        </button>

        <div class="space-y-2">
          <h2 class="text-xl font-semibold text-gray-900">Enter API Key</h2>
          <p class="text-sm text-gray-500">
            Get yours at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">console.anthropic.com</a>
          </p>
        </div>

        <div class="space-y-3">
          <input
            type="password"
            bind:value={apiKey}
            onkeydown={handleKeydown}
            placeholder="sk-ant-..."
            class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:border-gray-400 focus:outline-none"
          />

          {#if error}
            <p class="text-sm text-red-600">{error}</p>
          {/if}

          <button
            onclick={submitApiKey}
            disabled={isLoading || !apiKey.trim()}
            class="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white py-3 rounded-xl text-sm font-medium transition-colors"
          >
            {isLoading ? "Saving..." : "Continue"}
          </button>
        </div>

        <p class="text-xs text-gray-400 text-center">Stored locally, never shared</p>
      </div>
    {/if}

    {#if step === "terminal-login"}
      <div class="space-y-6">
        <button onclick={() => step = "setup"} class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Back
        </button>

        <div class="space-y-2">
          <h2 class="text-xl font-semibold text-gray-900">Login with Anthropic</h2>
          <p class="text-sm text-gray-500">Run this in your terminal:</p>
        </div>

        <div class="bg-gray-900 rounded-xl p-4 font-mono text-sm">
          <div class="flex items-center justify-between">
            <code class="text-green-400">claude login</code>
            <button
              onclick={() => navigator.clipboard.writeText("claude login")}
              class="text-gray-500 hover:text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
        </div>

        <button
          onclick={handleOAuthComplete}
          disabled={isLoading}
          class="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isLoading ? "Checking..." : "I've logged in"}
        </button>
      </div>
    {/if}

    {#if step === "complete"}
      <div class="text-center space-y-6">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        
        <div class="space-y-1">
          <h2 class="text-xl font-semibold text-gray-900">You're all set!</h2>
          <p class="text-sm text-gray-500">
            {#if authStatus?.authMethod === "oauth"}
              Connected via Anthropic
            {:else}
              API key configured
            {/if}
          </p>
        </div>
        
        <button
          onclick={handleComplete}
          class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium transition-colors"
        >
          Start using Navi
        </button>
      </div>
    {/if}

  </div>
</div>
