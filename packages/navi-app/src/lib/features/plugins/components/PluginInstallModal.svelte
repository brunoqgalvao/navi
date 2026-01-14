<script lang="ts">
  import { pluginApi } from "../api";
  import { currentProject } from "$lib/stores/projects";
  import { showError, showSuccess } from "$lib/errorHandler";
  import Modal from "$lib/components/Modal.svelte";

  interface Props {
    open: boolean;
    onInstalled?: () => void;
  }

  let { open = $bindable(), onInstalled }: Props = $props();

  let url = $state("");
  let scope: "user" | "project" = $state("user");
  let installing = $state(false);
  let error_message = $state("");

  // Example plugins for quick access
  const examplePlugins = [
    {
      name: "code-review",
      url: "https://github.com/anthropics/claude-code-plugins",
      description: "Automated PR review with parallel agents",
    },
    {
      name: "feature-dev",
      url: "https://github.com/anthropics/claude-code-plugins",
      description: "Structured feature development workflow",
    },
  ];

  async function install() {
    if (!url.trim()) {
      error_message = "Please enter a plugin URL";
      return;
    }

    // Basic URL validation
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("git@")) {
      error_message = "Please enter a valid git URL";
      return;
    }

    installing = true;
    error_message = "";

    try {
      const result = await pluginApi.install(
        url.trim(),
        scope,
        scope === "project" ? $currentProject?.path : undefined
      );

      if (result.success && result.plugin) {
        showSuccess(
          "Plugin installed",
          `${result.plugin.name} v${result.plugin.version} installed successfully`
        );
        url = "";
        open = false;
        onInstalled?.();
      } else {
        error_message = "Installation failed - plugin may be invalid";
      }
    } catch (err) {
      error_message = err instanceof Error ? err.message : "Installation failed";
      showError({
        title: "Installation failed",
        message: error_message,
      });
    } finally {
      installing = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !installing) {
      install();
    }
  }

  function close() {
    if (!installing) {
      url = "";
      error_message = "";
      open = false;
    }
  }
</script>

<Modal {open} onClose={close} title="Install Plugin" size="md">
  {#snippet children()}
    <div class="space-y-4">
      <!-- URL Input -->
      <div>
        <label for="plugin-url" class="block text-sm font-medium text-gray-300 mb-1.5">
          Plugin URL
        </label>
        <input
          id="plugin-url"
          type="text"
          bind:value={url}
          onkeydown={handleKeydown}
          placeholder="https://github.com/user/plugin-name"
          disabled={installing}
          class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        />
        <p class="mt-1.5 text-xs text-gray-500">
          Enter a git repository URL containing a Claude Code plugin
        </p>
      </div>

      <!-- Scope selection -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Install scope
        </label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              bind:group={scope}
              value="user"
              disabled={installing}
              class="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span class="text-sm">User (all projects)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              bind:group={scope}
              value="project"
              disabled={installing || !$currentProject}
              class="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span class="text-sm">This project only</span>
          </label>
        </div>
      </div>

      <!-- Error message -->
      {#if error_message}
        <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p class="text-sm text-red-400">{error_message}</p>
        </div>
      {/if}

      <!-- Divider -->
      <div class="relative py-2">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-700"></div>
        </div>
        <div class="relative flex justify-center text-xs">
          <span class="px-2 bg-gray-900 text-gray-500">or try an example</span>
        </div>
      </div>

      <!-- Example plugins -->
      <div class="space-y-2">
        {#each examplePlugins as example}
          <button
            onclick={() => url = example.url}
            disabled={installing}
            class="w-full p-3 text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <div class="font-medium text-sm">{example.name}</div>
            <div class="text-xs text-gray-400 mt-0.5">{example.description}</div>
          </button>
        {/each}
      </div>

      <!-- Info box -->
      <div class="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p class="text-xs text-blue-300">
          Plugins extend Claude Code with custom commands, agents, skills, and hooks.
          They're cloned from git repositories and stored locally.
        </p>
      </div>
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="flex justify-end gap-3">
      <button
        onclick={close}
        disabled={installing}
        class="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        onclick={install}
        disabled={installing || !url.trim()}
        class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {#if installing}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Installing...
        {:else}
          Install Plugin
        {/if}
      </button>
    </div>
  {/snippet}
</Modal>
