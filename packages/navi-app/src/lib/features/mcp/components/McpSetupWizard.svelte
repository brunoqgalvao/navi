<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { MCPServerPreset, MCPSetupStep } from "../api";

  interface Props {
    preset?: MCPServerPreset;
    customMode?: boolean;
    onComplete: (config: WizardResult) => void;
    onCancel: () => void;
  }

  export interface WizardResult {
    name: string;
    type: "stdio" | "sse" | "streamable-http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    // Credentials to store securely (separate from env)
    // These will be stored encrypted in DB, not in .mcp.json
    credentials?: Record<string, string>;
  }

  let { preset, customMode = false, onComplete, onCancel }: Props = $props();

  // Wizard state
  let currentStepIndex = $state(0);
  let stepValues = $state<Record<string, string>>({});
  let validationErrors = $state<Record<string, string>>({});
  let showPassword = $state<Record<string, boolean>>({});

  // Custom server state (when no preset)
  let customName = $state("");
  let customType = $state<"stdio" | "sse" | "streamable-http">("stdio");
  let customCommand = $state("npx");
  let customArgs = $state("");
  let customUrl = $state("");
  let customEnvVars = $state<{ key: string; value: string }[]>([]);
  let customStep = $state<"name" | "type" | "command" | "url" | "env" | "confirm">("name");

  // For custom mode, these are the steps
  const customSteps = ["name", "type", "command", "env", "confirm"] as const;
  const customStepsSSE = ["name", "type", "url", "env", "confirm"] as const;

  // Get steps based on mode
  const steps = $derived(preset?.setupSteps ?? []);
  const currentStep = $derived(steps[currentStepIndex]);
  const isLastStep = $derived(currentStepIndex === steps.length - 1);
  const progress = $derived(steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0);

  // Validation
  function validateStep(step: MCPSetupStep, value: string): string | null {
    if (step.required && !value?.trim()) {
      return "This field is required";
    }
    if (step.validation) {
      if (step.validation.minLength && value.length < step.validation.minLength) {
        return step.validation.message || `Minimum ${step.validation.minLength} characters required`;
      }
      if (step.validation.pattern) {
        const regex = new RegExp(step.validation.pattern);
        if (!regex.test(value)) {
          return step.validation.message || "Invalid format";
        }
      }
    }
    return null;
  }

  function handleNext() {
    if (!currentStep) return;

    // Skip validation for info steps
    if (currentStep.type !== "info") {
      const value = stepValues[currentStep.id] || "";
      const error = validateStep(currentStep, value);
      if (error) {
        validationErrors = { ...validationErrors, [currentStep.id]: error };
        return;
      }
      validationErrors = { ...validationErrors, [currentStep.id]: "" };
    }

    if (isLastStep) {
      completeWizard();
    } else {
      currentStepIndex++;
    }
  }

  function handleBack() {
    if (currentStepIndex > 0) {
      currentStepIndex--;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleNext();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  }

  function completeWizard() {
    if (!preset) return;

    // Build the final config - separate credentials from regular env vars
    const env: Record<string, string> = {};
    const credentials: Record<string, string> = {};
    let args = [...(preset.args || [])];

    for (const step of steps) {
      const value = stepValues[step.id];
      if (!value) continue;

      if (step.storeAs.env) {
        // Secret types go to credentials (stored encrypted)
        // Other types go to regular env (stored in .mcp.json)
        if (step.type === "secret") {
          credentials[step.storeAs.env] = value;
        } else {
          env[step.storeAs.env] = value;
        }
      }
      if (step.storeAs.arg) {
        args.push(value);
      }
      if (step.storeAs.argReplace) {
        args = args.map(arg => arg === step.storeAs.argReplace ? value : arg);
      }
    }

    const result: WizardResult = {
      name: preset.name,
      type: preset.type,
    };

    if (preset.type === "stdio") {
      result.command = preset.command;
      result.args = args;
    } else {
      result.url = preset.url;
    }

    // Regular env vars (non-secret)
    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    // Credentials (secret) - stored encrypted, not in .mcp.json
    if (Object.keys(credentials).length > 0) {
      result.credentials = credentials;
    }

    onComplete(result);
  }

  // Custom mode handlers
  function handleCustomNext() {
    const stepsForType = customType === "stdio" ? customSteps : customStepsSSE;
    const currentIndex = stepsForType.indexOf(customStep as any);

    if (customStep === "name" && !customName.trim()) {
      validationErrors = { custom: "Server name is required" };
      return;
    }
    if (customStep === "command" && customType === "stdio" && !customCommand.trim()) {
      validationErrors = { custom: "Command is required" };
      return;
    }
    if (customStep === "url" && customType !== "stdio" && !customUrl.trim()) {
      validationErrors = { custom: "URL is required" };
      return;
    }

    validationErrors = {};

    if (customStep === "confirm") {
      completeCustomWizard();
    } else if (currentIndex < stepsForType.length - 1) {
      customStep = stepsForType[currentIndex + 1] as any;
    }
  }

  function handleCustomBack() {
    const stepsForType = customType === "stdio" ? customSteps : customStepsSSE;
    const currentIndex = stepsForType.indexOf(customStep as any);
    if (currentIndex > 0) {
      customStep = stepsForType[currentIndex - 1] as any;
    }
  }

  function addEnvVar() {
    customEnvVars = [...customEnvVars, { key: "", value: "" }];
  }

  function removeEnvVar(index: number) {
    customEnvVars = customEnvVars.filter((_, i) => i !== index);
  }

  function completeCustomWizard() {
    const env: Record<string, string> = {};
    for (const { key, value } of customEnvVars) {
      if (key.trim() && value.trim()) {
        env[key.trim()] = value.trim();
      }
    }

    const result: WizardResult = {
      name: customName.trim(),
      type: customType,
    };

    if (customType === "stdio") {
      result.command = customCommand.trim();
      if (customArgs.trim()) {
        result.args = customArgs.split(/\s+/).filter(Boolean);
      }
    } else {
      result.url = customUrl.trim();
    }

    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    onComplete(result);
  }

  function toggleShowPassword(stepId: string) {
    showPassword = { ...showPassword, [stepId]: !showPassword[stepId] };
  }

  // Custom mode progress
  const customProgress = $derived(() => {
    const stepsForType = customType === "stdio" ? customSteps : customStepsSSE;
    const currentIndex = stepsForType.indexOf(customStep as any);
    return ((currentIndex + 1) / stepsForType.length) * 100;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="space-y-6" onkeydown={handleKeydown}>
  {#if customMode}
    <!-- Custom Server Wizard -->
    <div class="space-y-4">
      <!-- Progress bar -->
      <div class="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          style="width: {customProgress()}%"
        ></div>
      </div>

      <!-- Step content -->
      <div class="min-h-[200px]">
        {#if customStep === "name"}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">🔌</span>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Add MCP Server</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">Enter a name for this server</p>
              </div>
            </div>
            <input
              type="text"
              bind:value={customName}
              placeholder="my-mcp-server"
              class="w-full px-4 py-3 text-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autofocus
            />
            {#if validationErrors.custom}
              <p class="text-sm text-red-500">{validationErrors.custom}</p>
            {/if}
          </div>

        {:else if customStep === "type"}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">⚙️</span>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Server Type</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">How does this server run?</p>
              </div>
            </div>
            <div class="grid gap-3">
              <button
                onclick={() => customType = "stdio"}
                class="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors {customType === 'stdio' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
              >
                <span class="text-2xl">⚡</span>
                <div class="text-left">
                  <div class="font-medium text-gray-900 dark:text-gray-100">Local Command (stdio)</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">Runs via npx, node, python, etc.</div>
                </div>
                {#if customType === "stdio"}
                  <span class="ml-auto text-blue-500">✓</span>
                {/if}
              </button>
              <button
                onclick={() => customType = "sse"}
                class="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors {customType === 'sse' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
              >
                <span class="text-2xl">🌐</span>
                <div class="text-left">
                  <div class="font-medium text-gray-900 dark:text-gray-100">Remote Server (SSE)</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">Connects to a URL endpoint</div>
                </div>
                {#if customType === "sse"}
                  <span class="ml-auto text-blue-500">✓</span>
                {/if}
              </button>
              <button
                onclick={() => customType = "streamable-http"}
                class="flex items-center gap-4 p-4 rounded-xl border-2 transition-colors {customType === 'streamable-http' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
              >
                <span class="text-2xl">🔗</span>
                <div class="text-left">
                  <div class="font-medium text-gray-900 dark:text-gray-100">HTTP Streamable</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">HTTP-based streaming protocol</div>
                </div>
                {#if customType === "streamable-http"}
                  <span class="ml-auto text-blue-500">✓</span>
                {/if}
              </button>
            </div>
          </div>

        {:else if customStep === "command"}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">💻</span>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Command</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">How to start this server</p>
              </div>
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Command</label>
                <input
                  type="text"
                  bind:value={customCommand}
                  placeholder="npx"
                  class="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Arguments (space-separated)</label>
                <input
                  type="text"
                  bind:value={customArgs}
                  placeholder="-y @modelcontextprotocol/server-example"
                  class="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>
            </div>
            {#if validationErrors.custom}
              <p class="text-sm text-red-500">{validationErrors.custom}</p>
            {/if}
          </div>

        {:else if customStep === "url"}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">🌐</span>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Server URL</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">The MCP server endpoint</p>
              </div>
            </div>
            <input
              type="url"
              bind:value={customUrl}
              placeholder="https://mcp.example.com/mcp"
              class="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            {#if validationErrors.custom}
              <p class="text-sm text-red-500">{validationErrors.custom}</p>
            {/if}
          </div>

        {:else if customStep === "env"}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">🔐</span>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Environment Variables</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">Optional: Add API keys or configuration</p>
              </div>
            </div>
            <div class="space-y-2">
              {#each customEnvVars as envVar, i}
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={envVar.key}
                    placeholder="KEY"
                    class="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <input
                    type="password"
                    bind:value={envVar.value}
                    placeholder="value"
                    class="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <button
                    onclick={() => removeEnvVar(i)}
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
              <button
                onclick={addEnvVar}
                class="flex items-center gap-2 px-4 py-2 text-sm text-blue-500 hover:text-blue-600 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add environment variable
              </button>
            </div>
          </div>

        {:else if customStep === "confirm"}
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl">✅</span>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Ready to Add</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">Review your configuration</p>
              </div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 font-mono text-sm">
              <div><span class="text-gray-500">Name:</span> {customName}</div>
              <div><span class="text-gray-500">Type:</span> {customType}</div>
              {#if customType === "stdio"}
                <div><span class="text-gray-500">Command:</span> {customCommand} {customArgs}</div>
              {:else}
                <div><span class="text-gray-500">URL:</span> {customUrl}</div>
              {/if}
              {#if customEnvVars.filter(e => e.key && e.value).length > 0}
                <div><span class="text-gray-500">Env vars:</span> {customEnvVars.filter(e => e.key).map(e => e.key).join(", ")}</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Navigation -->
      <div class="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onclick={customStep === "name" ? onCancel : handleCustomBack}
          class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          {customStep === "name" ? "Cancel" : "← Back"}
        </button>
        <button
          onclick={handleCustomNext}
          class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          {customStep === "confirm" ? "Add Server" : "Continue →"}
        </button>
      </div>
    </div>

  {:else if preset && steps.length > 0}
    <!-- Preset Wizard -->
    <div class="space-y-4">
      <!-- Header with icon -->
      <div class="flex items-center gap-4">
        <span class="text-4xl">{preset.icon}</span>
        <div>
          <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{preset.name}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">{preset.description}</p>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          style="width: {progress}%"
        ></div>
      </div>

      <!-- Step indicator -->
      <div class="text-sm text-gray-500 dark:text-gray-400">
        Step {currentStepIndex + 1} of {steps.length}
      </div>

      <!-- Step content -->
      {#if currentStep}
        <div class="min-h-[180px] space-y-4">
          <div>
            <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100">{currentStep.label}</h4>
            {#if currentStep.description}
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line">{currentStep.description}</p>
            {/if}
          </div>

          {#if currentStep.helpUrl}
            <a
              href={currentStep.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 text-sm font-medium"
            >
              {currentStep.helpText || "Get API key →"}
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          {/if}

          {#if currentStep.type === "input"}
            <input
              type="text"
              bind:value={stepValues[currentStep.id]}
              placeholder={currentStep.placeholder}
              class="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autofocus
            />

          {:else if currentStep.type === "secret"}
            <div class="relative">
              <input
                type={showPassword[currentStep.id] ? "text" : "password"}
                bind:value={stepValues[currentStep.id]}
                placeholder={currentStep.placeholder}
                class="w-full px-4 py-3 pr-12 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                autofocus
              />
              <button
                type="button"
                onclick={() => toggleShowPassword(currentStep.id)}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {#if showPassword[currentStep.id]}
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                {:else}
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                {/if}
              </button>
            </div>

          {:else if currentStep.type === "directory"}
            <input
              type="text"
              bind:value={stepValues[currentStep.id]}
              placeholder={currentStep.placeholder}
              class="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              autofocus
            />
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Tip: You can drag a folder from Finder into this field
            </p>

          {:else if currentStep.type === "select" && currentStep.options}
            <div class="space-y-2">
              {#each currentStep.options as option}
                <button
                  onclick={() => stepValues[currentStep.id] = option.value}
                  class="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors {stepValues[currentStep.id] === option.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}"
                >
                  <span class="text-gray-900 dark:text-gray-100">{option.label}</span>
                  {#if stepValues[currentStep.id] === option.value}
                    <span class="ml-auto text-blue-500">✓</span>
                  {/if}
                </button>
              {/each}
            </div>

          {:else if currentStep.type === "info"}
            <!-- Info step - just shows the description, no input -->
          {/if}

          {#if validationErrors[currentStep.id]}
            <p class="text-sm text-red-500">{validationErrors[currentStep.id]}</p>
          {/if}
        </div>
      {/if}

      <!-- Navigation -->
      <div class="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onclick={currentStepIndex === 0 ? onCancel : handleBack}
          class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          {currentStepIndex === 0 ? "Cancel" : "← Back"}
        </button>
        <button
          onclick={handleNext}
          class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          {isLastStep ? "Add Server" : "Continue →"}
        </button>
      </div>
    </div>

  {:else if preset && steps.length === 0}
    <!-- No setup needed - just confirm -->
    <div class="space-y-4">
      <div class="flex items-center gap-4">
        <span class="text-4xl">{preset.icon}</span>
        <div>
          <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{preset.name}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">{preset.description}</p>
        </div>
      </div>

      <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
        <p class="text-green-700 dark:text-green-300 text-sm">
          ✓ This server works out of the box - no configuration needed!
        </p>
      </div>

      <div class="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onclick={onCancel}
          class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={() => onComplete({
            name: preset.name,
            type: preset.type,
            command: preset.command,
            args: preset.args,
            url: preset.url,
          })}
          class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          Add Server
        </button>
      </div>
    </div>
  {/if}
</div>
