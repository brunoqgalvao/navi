<script lang="ts">
  import { getServerUrl } from "$lib/api";
  import { currentSession } from "$lib/stores/session";
  import { showError, showSuccess } from "$lib/errorHandler";
  import {
    ShieldAlert,
    Target,
    HeartPulse,
    Users,
    Globe,
    Loader2,
    Zap,
    X,
  } from "lucide-svelte";

  // Agent type definitions
  const AGENT_TYPES = [
    {
      id: "red-team",
      name: "Red Team",
      description: "Security analysis & edge case hunting",
      icon: ShieldAlert,
      color: "red",
      placeholder: "Analyze auth implementation for vulnerabilities...",
    },
    {
      id: "browser-agent",
      name: "Browser Agent",
      description: "Visual testing & UI inspection",
      icon: Globe,
      color: "cyan",
      placeholder: "Take screenshot and check for layout issues...",
    },
    {
      id: "goal-agent",
      name: "Goal Agent",
      description: "Pursue goals until verified complete",
      icon: Target,
      color: "emerald",
      placeholder: "Make all tests pass and ensure build succeeds...",
    },
    {
      id: "healer-agent",
      name: "Healer",
      description: "Fix build & type errors automatically",
      icon: HeartPulse,
      color: "pink",
      placeholder: "Fix the TypeScript errors in src/...",
    },
    {
      id: "consensus-agent",
      name: "Consensus",
      description: "Multi-model voting for decisions",
      icon: Users,
      color: "purple",
      placeholder: "Should we use REST or GraphQL for this API?",
    },
  ] as const;

  type AgentTypeId = (typeof AGENT_TYPES)[number]["id"];

  let selectedAgent = $state<AgentTypeId | null>(null);
  let taskInput = $state("");
  let urlInput = $state("http://localhost:3000");
  let isSpawning = $state(false);
  let recentSpawns = $state<Array<{ id: string; type: string; task: string; status: string }>>([]);

  function selectAgent(id: AgentTypeId) {
    selectedAgent = selectedAgent === id ? null : id;
    taskInput = "";
  }

  async function spawnAgent() {
    if (!selectedAgent || !taskInput.trim()) return;
    if (!$currentSession?.sessionId) {
      showError({ message: "Start a chat session first" });
      return;
    }

    isSpawning = true;

    try {
      const context: Record<string, unknown> = {};

      // Add context based on agent type
      if (selectedAgent === "browser-agent") {
        context.url = urlInput;
      }
      if (selectedAgent === "goal-agent") {
        context.verificationCriteria = "Verify the goal is fully achieved with tests passing";
      }

      const res = await fetch(`${getServerUrl()}/api/experimental/agents/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: $currentSession.sessionId,
          agentType: selectedAgent,
          task: taskInput,
          context,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const data = await res.json();

      // Add to recent spawns
      recentSpawns = [
        {
          id: data.childSessionId,
          type: selectedAgent,
          task: taskInput.slice(0, 50) + (taskInput.length > 50 ? "..." : ""),
          status: "working",
        },
        ...recentSpawns.slice(0, 4),
      ];

      showSuccess(
        "Agent Spawned",
        `${AGENT_TYPES.find((a) => a.id === selectedAgent)?.name} is working on your task`
      );

      // Reset form
      selectedAgent = null;
      taskInput = "";
    } catch (err: any) {
      showError({ title: "Spawn Failed", message: err.message });
    } finally {
      isSpawning = false;
    }
  }

  function getAgentConfig(id: string) {
    return AGENT_TYPES.find((a) => a.id === id);
  }

  function getColorClasses(color: string) {
    const colors: Record<string, { bg: string; border: string; text: string; hover: string }> = {
      red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-600", hover: "hover:bg-red-100" },
      cyan: { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-600", hover: "hover:bg-cyan-100" },
      emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-600", hover: "hover:bg-emerald-100" },
      pink: { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-600", hover: "hover:bg-pink-100" },
      purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-600", hover: "hover:bg-purple-100" },
    };
    return colors[color] || colors.purple;
  }
</script>

<div class="p-4 space-y-4">
  <div class="flex items-center gap-2 mb-4">
    <Zap class="w-5 h-5 text-amber-500" />
    <h2 class="font-semibold text-gray-800">Experimental Agents</h2>
  </div>

  <!-- Agent Type Grid -->
  <div class="grid grid-cols-2 gap-2">
    {#each AGENT_TYPES as agent}
      {@const colors = getColorClasses(agent.color)}
      {@const isSelected = selectedAgent === agent.id}
      <button
        onclick={() => selectAgent(agent.id)}
        class="p-3 rounded-lg border-2 transition-all text-left {isSelected
          ? `${colors.bg} ${colors.border} ring-2 ring-offset-1 ring-${agent.color}-300`
          : 'bg-white border-gray-200 hover:border-gray-300'}"
      >
        <div class="flex items-center gap-2 mb-1">
          <svelte:component this={agent.icon} class="w-4 h-4 {isSelected ? colors.text : 'text-gray-500'}" />
          <span class="font-medium text-sm {isSelected ? colors.text : 'text-gray-700'}">
            {agent.name}
          </span>
        </div>
        <p class="text-xs text-gray-500 line-clamp-1">{agent.description}</p>
      </button>
    {/each}
  </div>

  <!-- Task Input (shown when agent selected) -->
  {#if selectedAgent}
    {@const agent = getAgentConfig(selectedAgent)}
    {@const colors = agent ? getColorClasses(agent.color) : getColorClasses("purple")}

    <div class="space-y-3 pt-2 border-t border-gray-100">
      {#if selectedAgent === "browser-agent"}
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Target URL</label>
          <input
            type="text"
            bind:value={urlInput}
            placeholder="http://localhost:3000"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </div>
      {/if}

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Task Description</label>
        <textarea
          bind:value={taskInput}
          placeholder={agent?.placeholder}
          rows="3"
          class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-{agent?.color}-300 resize-none"
        ></textarea>
      </div>

      <div class="flex gap-2">
        <button
          onclick={spawnAgent}
          disabled={!taskInput.trim() || isSpawning}
          class="flex-1 flex items-center justify-center gap-2 px-4 py-2 {colors.bg} {colors.text} rounded-lg font-medium text-sm {colors.hover} disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {#if isSpawning}
            <Loader2 class="w-4 h-4 animate-spin" />
            Spawning...
          {:else}
            {#if agent}
              <svelte:component this={agent.icon} class="w-4 h-4" />
              Spawn {agent.name}
            {/if}
          {/if}
        </button>
        <button
          onclick={() => (selectedAgent = null)}
          class="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/if}

  <!-- Recent Spawns -->
  {#if recentSpawns.length > 0}
    <div class="pt-3 border-t border-gray-100">
      <h3 class="text-xs font-medium text-gray-500 mb-2">Recent Agents</h3>
      <div class="space-y-1">
        {#each recentSpawns as spawn}
          {@const agent = getAgentConfig(spawn.type)}
          {@const colors = agent ? getColorClasses(agent.color) : getColorClasses("purple")}
          <div class="flex items-center gap-2 p-2 rounded-lg {colors.bg} {colors.border} border">
            {#if agent}
              <svelte:component this={agent.icon} class="w-3 h-3 {colors.text}" />
            {/if}
            <span class="text-xs text-gray-700 flex-1 truncate">{spawn.task}</span>
            <span class="text-xs {colors.text} font-medium">{spawn.status}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
