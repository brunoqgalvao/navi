<script lang="ts">
  /**
   * Quick Agent Buttons
   *
   * Inline buttons above the chat input for spawning experimental agents quickly.
   * These provide one-click access to common agent tasks.
   */
  import { getServerUrl } from "$lib/api";
  import { currentSession } from "$lib/stores/session";
  import { currentProject } from "$lib/stores";
  import { showError, showSuccess } from "$lib/errorHandler";
  import {
    ShieldAlert,
    Target,
    HeartPulse,
    Users,
    Globe,
    Loader2,
    Sparkles,
  } from "lucide-svelte";

  interface Props {
    onAgentSpawned?: (agentType: string, childSessionId: string) => void;
  }

  let { onAgentSpawned }: Props = $props();

  let activeSpawn = $state<string | null>(null);
  let isVisible = $state(true);

  const quickActions = [
    {
      id: "red-team",
      label: "Security Scan",
      icon: ShieldAlert,
      color: "red",
      task: () =>
        `Perform a security analysis of the current project. Look for vulnerabilities, injection risks, auth issues, and edge cases. Focus on: ${$currentProject?.path || "the codebase"}`,
    },
    {
      id: "healer-agent",
      label: "Fix Errors",
      icon: HeartPulse,
      color: "pink",
      task: () =>
        `Run type check and fix any TypeScript or build errors in the project at ${$currentProject?.path || "."}`,
    },
    {
      id: "browser-agent",
      label: "Check UI",
      icon: Globe,
      color: "cyan",
      task: () => "Take a screenshot of the current preview and check for visual issues or bugs",
      context: { url: "http://localhost:3000" },
    },
    {
      id: "consensus-agent",
      label: "Get Consensus",
      icon: Users,
      color: "purple",
      requiresInput: true,
    },
  ];

  async function spawnQuickAgent(
    agentType: string,
    task: string | (() => string),
    context?: Record<string, unknown>
  ) {
    if (!$currentSession?.sessionId) {
      showError({ message: "Start a chat session first" });
      return;
    }

    activeSpawn = agentType;

    try {
      const taskStr = typeof task === "function" ? task() : task;

      const res = await fetch(`${getServerUrl()}/api/experimental/agents/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: $currentSession.sessionId,
          agentType,
          task: taskStr,
          context: context || {},
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();

      showSuccess("Agent Spawned", `${agentType} is working on your task`);

      onAgentSpawned?.(agentType, data.childSessionId);
    } catch (err: any) {
      showError({ message: err.message });
    } finally {
      activeSpawn = null;
    }
  }

  function getColorClasses(color: string) {
    const colors: Record<string, string> = {
      red: "text-red-600 hover:bg-red-50 border-red-200",
      pink: "text-pink-600 hover:bg-pink-50 border-pink-200",
      cyan: "text-cyan-600 hover:bg-cyan-50 border-cyan-200",
      purple: "text-purple-600 hover:bg-purple-50 border-purple-200",
      emerald: "text-emerald-600 hover:bg-emerald-50 border-emerald-200",
    };
    return colors[color] || colors.purple;
  }
</script>

{#if isVisible && $currentSession}
  <div class="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-100">
    <Sparkles class="w-3 h-3 text-amber-500 mr-1" />
    <span class="text-xs text-gray-500 mr-2">Quick agents:</span>

    {#each quickActions as action}
      {#if !action.requiresInput}
        <button
          onclick={() => spawnQuickAgent(action.id, action.task!, action.context)}
          disabled={activeSpawn !== null}
          class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border bg-white transition-colors disabled:opacity-50 {getColorClasses(
            action.color
          )}"
        >
          {#if activeSpawn === action.id}
            <Loader2 class="w-3 h-3 animate-spin" />
          {:else}
            <action.icon class="w-3 h-3" />
          {/if}
          {action.label}
        </button>
      {/if}
    {/each}

    <button
      onclick={() => (isVisible = false)}
      class="ml-auto text-xs text-gray-400 hover:text-gray-600"
    >
      Hide
    </button>
  </div>
{/if}
