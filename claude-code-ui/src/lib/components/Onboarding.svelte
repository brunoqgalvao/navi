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
      submitApiKey();
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

  const introSteps = ["intro-1", "intro-2", "intro-3"];
  $effect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (introSteps.includes(step)) {
        if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
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
</script>

<div class="fixed inset-0 z-[100] bg-white flex items-center justify-center">
  <div class="max-w-lg w-full mx-4">
    
    {#if step === "intro-1"}
      <div class="text-center space-y-8 animate-in fade-in duration-500">
        <div class="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          <span class="text-white font-bold text-3xl">N</span>
        </div>
        
        <div class="space-y-3">
          <h1 class="text-2xl font-semibold text-gray-900">Welcome to Navi</h1>
          <p class="text-gray-500 text-sm leading-relaxed max-w-md mx-auto">
            Your capable local assistant. Already on it.
          </p>
        </div>
        
        <div class="flex items-center justify-center gap-2">
          {#each [0, 1, 2] as i}
            <div class="w-2 h-2 rounded-full transition-colors {i === 0 ? 'bg-gray-900' : 'bg-gray-300'}"></div>
          {/each}
        </div>
        
        <button
          onclick={nextIntro}
          class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium shadow-sm transition-all hover:shadow-md"
        >
          Continue
        </button>
        
        <p class="text-xs text-gray-400">Press Enter or arrow keys to navigate</p>
      </div>
    {/if}

    {#if step === "intro-2"}
      <div class="text-center space-y-8 animate-in fade-in duration-500">
        <div class="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto border border-gray-200">
          <svg class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        
        <div class="space-y-3">
          <h2 class="text-xl font-semibold text-gray-900">What is Navi?</h2>
          <p class="text-gray-500 text-sm leading-relaxed max-w-md mx-auto">
            Navi is your local AI assistant powered by Claude Code. It handles your digital chaos - writing, editing, and executing tasks across your workspaces.
          </p>
          <div class="flex flex-wrap justify-center gap-2 pt-2">
            <span class="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">Multi-file editing</span>
            <span class="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">Terminal access</span>
            <span class="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">Web search</span>
            <span class="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">File preview</span>
          </div>
        </div>
        
        <div class="flex items-center justify-center gap-2">
          {#each [0, 1, 2] as i}
            <div class="w-2 h-2 rounded-full transition-colors {i === 1 ? 'bg-gray-900' : 'bg-gray-300'}"></div>
          {/each}
        </div>
        
        <div class="flex justify-center gap-3">
          <button
            onclick={prevIntro}
            class="text-gray-600 hover:text-gray-900 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Back
          </button>
          <button
            onclick={nextIntro}
            class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium shadow-sm transition-all hover:shadow-md"
          >
            Continue
          </button>
        </div>
      </div>
    {/if}

    {#if step === "intro-3"}
      <div class="text-center space-y-8 animate-in fade-in duration-500">
        <div class="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto border border-orange-200">
          <span class="text-orange-600 font-bold text-3xl">A</span>
        </div>
        
        <div class="space-y-3">
          <h2 class="text-xl font-semibold text-gray-900">Powered by Claude</h2>
          <p class="text-gray-500 text-sm leading-relaxed max-w-md mx-auto">
            Navi uses Claude from Anthropic - you'll need an Anthropic account or API key to use it. Let's set that up next.
          </p>
        </div>
        
        <div class="flex items-center justify-center gap-2">
          {#each [0, 1, 2] as i}
            <div class="w-2 h-2 rounded-full transition-colors {i === 2 ? 'bg-gray-900' : 'bg-gray-300'}"></div>
          {/each}
        </div>
        
        <div class="flex justify-center gap-3">
          <button
            onclick={prevIntro}
            class="text-gray-600 hover:text-gray-900 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Back
          </button>
          <button
            onclick={nextIntro}
            class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium shadow-sm transition-all hover:shadow-md"
          >
            Get Started
          </button>
        </div>
      </div>
    {/if}

    {#if step === "checking"}
      <div class="text-center space-y-6 animate-in fade-in duration-300">
        <div class="w-12 h-12 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto"></div>
        <p class="text-gray-500 text-sm">Checking your setup...</p>
      </div>
    {/if}

    {#if step === "choose-auth"}
      <div class="space-y-8 animate-in fade-in duration-500">
        <div class="text-center space-y-3">
          <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-900">Multiple Auth Methods Found</h2>
          <p class="text-gray-500 text-sm">You have both OAuth and an API key configured. Choose which one to use:</p>
        </div>

        <div class="space-y-3">
          <button
            onclick={() => setPreferredAuth("oauth")}
            disabled={settingPreferred}
            class="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 text-left transition-all group disabled:opacity-50"
          >
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 group-hover:text-gray-900 flex items-center gap-2">
                  Use Anthropic OAuth
                  {#if authStatus?.authMethod === "oauth"}
                    <span class="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Current</span>
                  {/if}
                </div>
                <div class="text-sm text-gray-500 mt-1">Login through your Anthropic account. Usage counts against your subscription.</div>
              </div>
              <svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </button>

          <button
            onclick={() => setPreferredAuth("api_key")}
            disabled={settingPreferred}
            class="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 text-left transition-all group disabled:opacity-50"
          >
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 group-hover:text-gray-900 flex items-center gap-2">
                  Use API Key
                  {#if authStatus?.authMethod === "api_key"}
                    <span class="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Current</span>
                  {/if}
                </div>
                <div class="text-sm text-gray-500 mt-1">Pay-as-you-go pricing. Billed directly to your API account.</div>
              </div>
              <svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </button>
        </div>

        <p class="text-xs text-gray-400 text-center">You can change this later in Settings</p>
      </div>
    {/if}

    {#if step === "setup"}
      <div class="space-y-8 animate-in fade-in duration-500">
        <div class="text-center space-y-3">
          <h2 class="text-xl font-semibold text-gray-900">
            {#if authStatus?.hasApiKey || authStatus?.hasOAuth}
              Add Another Auth Method
            {:else}
              Setup Required
            {/if}
          </h2>
          <p class="text-gray-500 text-sm">
            {#if authStatus?.hasApiKey}
              API key detected. You can also set up OAuth for your Anthropic account.
            {:else if authStatus?.hasOAuth}
              OAuth detected. You can also add an API key for pay-as-you-go usage.
            {:else}
              Choose how you want to authenticate with Claude
            {/if}
          </p>
        </div>

        {#if authStatus?.hasApiKey}
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div class="flex-1">
              <span class="text-sm font-medium text-emerald-800">API Key configured</span>
            </div>
            <button
              onclick={() => step = "complete"}
              class="text-sm text-emerald-700 hover:text-emerald-900 font-medium"
            >
              Continue with API Key
            </button>
          </div>
        {/if}

        {#if authStatus?.hasOAuth}
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div class="flex-1">
              <span class="text-sm font-medium text-emerald-800">OAuth connected</span>
            </div>
            <button
              onclick={() => step = "complete"}
              class="text-sm text-emerald-700 hover:text-emerald-900 font-medium"
            >
              Continue with OAuth
            </button>
          </div>
        {/if}

        <div class="space-y-3">
          {#if !authStatus?.hasOAuth}
            {#if authStatus?.claudeInstalled}
              <button
                onclick={() => step = "terminal-login"}
                class="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 text-left transition-all group"
              >
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 group-hover:text-gray-900">
                      {authStatus?.hasApiKey ? "Add OAuth Login" : "Login with Anthropic Account"}
                    </div>
                    <div class="text-sm text-gray-500 mt-1">Use your Anthropic account to authenticate. Recommended for most users.</div>
                    <div class="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      Claude Code CLI detected
                    </div>
                  </div>
                  <svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </div>
              </button>
            {:else}
              <div class="w-full bg-gray-50 border border-gray-200 rounded-xl p-5 text-left">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-500">Login with Anthropic Account</div>
                    <div class="text-sm text-gray-400 mt-1">Claude Code CLI not found. Install it first or use an API key.</div>
                    <a 
                      href="https://docs.anthropic.com/en/docs/claude-code" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      class="text-xs text-blue-600 hover:text-blue-700 mt-2 inline-flex items-center gap-1"
                    >
                      Learn how to install Claude Code
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            {/if}
          {/if}

          {#if !authStatus?.hasApiKey}
            <button
              onclick={() => step = "api-key"}
              class="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 text-left transition-all group"
            >
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 group-hover:text-gray-900">
                    {authStatus?.hasOAuth ? "Add API Key" : "Use API Key"}
                  </div>
                  <div class="text-sm text-gray-500 mt-1">Enter your Anthropic API key directly. Get one from console.anthropic.com</div>
                </div>
                <svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </button>
          {/if}

          {#if !authStatus?.hasApiKey && !authStatus?.hasOAuth}
            <button
              onclick={() => step = "no-account"}
              class="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 text-left transition-all group"
            >
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 group-hover:text-gray-900">I don't have an account yet</div>
                  <div class="text-sm text-gray-500 mt-1">Learn how to get started with Anthropic</div>
                </div>
                <svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </button>
          {/if}
        </div>

        <div class="text-center">
          <button
            onclick={onComplete}
            class="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    {/if}

    {#if step === "no-account"}
      <div class="space-y-6 animate-in fade-in duration-500">
        <button
          onclick={() => step = "setup"}
          class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Back
        </button>

        <div class="space-y-3">
          <h2 class="text-xl font-semibold text-gray-900">Get an Anthropic Account</h2>
          <p class="text-gray-500 text-sm">
            To use Navi, you'll need access to Claude. Here are your options:
          </p>
        </div>

        <div class="space-y-4">
          <a 
            href="https://claude.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            class="block bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 transition-all group"
          >
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                <span class="text-orange-600 font-bold text-lg">C</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 group-hover:text-gray-900 flex items-center gap-2">
                  Claude Pro Subscription
                  <span class="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Recommended</span>
                </div>
                <div class="text-sm text-gray-500 mt-1">$20/month - Includes Claude Code access with generous usage limits</div>
                <div class="text-xs text-blue-600 mt-2 flex items-center gap-1">
                  claude.ai
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </div>
              </div>
            </div>
          </a>

          <a 
            href="https://console.anthropic.com" 
            target="_blank" 
            rel="noopener noreferrer"
            class="block bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-5 transition-all group"
          >
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 group-hover:text-gray-900">API Access (Pay as you go)</div>
                <div class="text-sm text-gray-500 mt-1">Get an API key and pay only for what you use. Good for developers.</div>
                <div class="text-xs text-blue-600 mt-2 flex items-center gap-1">
                  console.anthropic.com
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </div>
              </div>
            </div>
          </a>
        </div>

        <div class="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div class="flex gap-3">
            <svg class="w-5 h-5 text-gray-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div class="text-sm text-gray-600">
              <p class="font-medium text-gray-700">After signing up:</p>
              <ol class="mt-2 space-y-1 ml-4 list-decimal text-gray-500">
                <li>Install Claude Code CLI (for OAuth) or get an API key</li>
                <li>Return here and complete the setup</li>
              </ol>
            </div>
          </div>
        </div>

        <button
          onclick={() => checkAuthStatus()}
          class="w-full bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg text-sm font-medium transition-all"
        >
          I've signed up - Continue setup
        </button>
      </div>
    {/if}

    {#if step === "api-key"}
      <div class="space-y-6 animate-in fade-in duration-500">
        <button
          onclick={() => step = "setup"}
          class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Back
        </button>

        <div class="space-y-3">
          <h2 class="text-xl font-semibold text-gray-900">Enter API Key</h2>
          <p class="text-gray-500 text-sm">
            Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700 underline">console.anthropic.com</a>
          </p>
        </div>

        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700">Anthropic API Key</label>
            <input
              type="password"
              bind:value={apiKey}
              onkeydown={handleKeydown}
              placeholder="sk-ant-..."
              class="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 font-mono focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"
            />
          </div>

          {#if error}
            <div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          {/if}

          <button
            onclick={submitApiKey}
            disabled={isLoading || !apiKey.trim()}
            class="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed"
          >
            {#if isLoading}
              <span class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Saving...
              </span>
            {:else}
              Save & Continue
            {/if}
          </button>
        </div>

        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div class="text-xs text-gray-500 space-y-2">
            <p class="font-medium text-gray-700">Your API key will be:</p>
            <ul class="space-y-1 ml-4 list-disc">
              <li>Stored locally in ~/.claude-code-ui/.env</li>
              <li>Never sent to any third-party servers</li>
              <li>Used only to communicate with Anthropic's API</li>
            </ul>
          </div>
        </div>
      </div>
    {/if}

    {#if step === "terminal-login"}
      <div class="space-y-6 animate-in fade-in duration-500">
        <button
          onclick={() => step = "setup"}
          class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          Back
        </button>

        <div class="space-y-3">
          <h2 class="text-xl font-semibold text-gray-900">Login with Anthropic</h2>
          <p class="text-gray-500 text-sm">Run this command in your terminal to authenticate:</p>
        </div>

        <div class="bg-gray-900 rounded-xl p-4 font-mono text-sm">
          <div class="flex items-center justify-between">
            <code class="text-emerald-400">claude login</code>
            <button
              onclick={() => navigator.clipboard.writeText("claude login")}
              class="text-gray-500 hover:text-white transition-colors p-1"
              title="Copy to clipboard"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex gap-3">
              <svg class="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div class="text-sm text-blue-800">
                <p class="font-medium">After running the command:</p>
                <ol class="mt-2 space-y-1 ml-4 list-decimal">
                  <li>A browser window will open</li>
                  <li>Log in with your Anthropic account</li>
                  <li>Return here and click "I've logged in"</li>
                </ol>
              </div>
            </div>
          </div>

          <button
            onclick={handleOAuthComplete}
            disabled={isLoading}
            class="w-full bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            {#if isLoading}
              <span class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Checking...
              </span>
            {:else}
              I've logged in
            {/if}
          </button>
        </div>
      </div>
    {/if}

    {#if step === "complete"}
      <div class="text-center space-y-8 animate-in fade-in duration-500">
        <div class="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        
        <div class="space-y-3">
          <h2 class="text-2xl font-semibold text-gray-900">You're all set!</h2>
          <p class="text-gray-500 text-sm">
            {#if authStatus?.authMethod === "oauth"}
              Using your Anthropic account
            {:else if authStatus?.authMethod === "api_key"}
              Using your API key
            {:else}
              Ready to start using Navi
            {/if}
          </p>
        </div>
        
        <button
          onclick={onComplete}
          class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl text-sm font-medium shadow-sm transition-all hover:shadow-md"
        >
          Start Using Navi
        </button>
      </div>
    {/if}

  </div>
</div>
