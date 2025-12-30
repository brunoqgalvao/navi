<script lang="ts">
  import { agentsApi, type Agent, type CreateAgentInput, type UpdateAgentInput } from "../api";

  interface Props {
    open: boolean;
    onClose: () => void;
    agent?: Agent | null;
    projectId?: string | null;
    onSave?: (agent: Agent) => void;
  }

  let { open, onClose, agent = null, projectId = null, onSave }: Props = $props();

  let name = $state("");
  let description = $state("");
  let instructions = $state("");
  let model = $state<"haiku" | "sonnet" | "opus" | "">("");
  let selectedTools = $state<string[]>([]);

  let saving = $state(false);
  let loading = $state(false);
  let error: string | null = $state(null);

  const availableTools = [
    "Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep",
    "WebFetch", "WebSearch", "TodoWrite", "NotebookEdit"
    // Note: Task is NOT included - subagents cannot spawn other subagents
  ];

  const modelOptions = [
    { value: "", label: "Inherit from parent" },
    { value: "haiku", label: "Haiku (fast, cheap)" },
    { value: "sonnet", label: "Sonnet (balanced)" },
    { value: "opus", label: "Opus (powerful)" },
  ];

  $effect(() => {
    if (open && agent) {
      loadAgent();
    } else if (open && !agent) {
      resetForm();
    }
  });

  async function loadAgent() {
    if (!agent) return;
    loading = true;
    try {
      const fullAgent = await agentsApi.get(agent.id);
      name = fullAgent.name;
      description = fullAgent.description;
      instructions = fullAgent.body || "";
      model = fullAgent.model || "";
      selectedTools = fullAgent.tools || [];
    } catch (e: any) {
      error = e.message || "Failed to load agent";
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    name = "";
    description = "";
    instructions = `You are a specialized agent for [purpose].

## Your Role

Describe the agent's expertise and responsibilities.

## Guidelines

- Guideline 1
- Guideline 2

## Output Format

Describe how the agent should format its responses.
`;
    model = "";
    selectedTools = [];
    error = null;
  }

  function toggleTool(tool: string) {
    if (selectedTools.includes(tool)) {
      selectedTools = selectedTools.filter((t) => t !== tool);
    } else {
      selectedTools = [...selectedTools, tool];
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      error = "Name is required";
      return;
    }
    if (!description.trim()) {
      error = "Description is required (Claude uses this to decide when to invoke the agent)";
      return;
    }

    saving = true;
    error = null;

    try {
      let savedAgent: Agent;

      if (agent) {
        const updates: UpdateAgentInput = {
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim(),
          model: model || undefined,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
        };
        savedAgent = await agentsApi.update(agent.id, updates);
      } else {
        const input: CreateAgentInput = {
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim(),
          model: model || undefined,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
        };

        if (projectId) {
          savedAgent = await agentsApi.createForProject(projectId, input);
        } else {
          savedAgent = await agentsApi.create(input);
        }
      }

      onSave?.(savedAgent);
      onClose();
    } catch (e: any) {
      error = e.message || "Failed to save agent";
    } finally {
      saving = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-indigo-100 rounded-lg">
            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-lg text-gray-900">
              {agent ? "Edit Agent" : "Create New Agent"}
            </h3>
            {#if agent}
              <p class="text-xs text-gray-400 font-mono truncate max-w-md">{agent.path}</p>
            {/if}
          </div>
        </div>
        <button
          onclick={onClose}
          class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        {#if loading}
          <div class="flex items-center justify-center h-full">
            <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        {:else}
          <div class="space-y-6">
            <!-- Info box -->
            <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-700">
              <div class="flex gap-2">
                <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <strong>Agents</strong> are isolated task executors that Claude can spawn via the Task tool.
                  They run in their own context and can work in parallel. Unlike Skills (which inject instructions into the main agent),
                  Agents maintain separate context and only return relevant findings.
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  bind:value={name}
                  placeholder="code-reviewer"
                  class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
                />
                <p class="text-xs text-gray-400 mt-1">Used as filename: {name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "agent-name"}.md</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select
                  bind:value={model}
                  class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
                >
                  {#each modelOptions as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Description
                <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                bind:value={description}
                placeholder="Expert code review specialist. Use for security and quality reviews."
                class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none transition-colors"
              />
              <p class="text-xs text-gray-400 mt-1">Claude uses this to decide when to invoke the agent. Be specific!</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Agent Instructions</label>
              <textarea
                bind:value={instructions}
                rows="12"
                placeholder="You are a specialized agent for..."
                class="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors resize-none"
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Allowed Tools</label>
              <p class="text-xs text-gray-500 mb-3">
                Restrict which tools this agent can use. Leave empty to inherit all tools from parent.
                <strong>Note:</strong> Agents cannot spawn other agents (no Task tool).
              </p>
              <div class="flex flex-wrap gap-2">
                {#each availableTools as tool}
                  <button
                    type="button"
                    onclick={() => toggleTool(tool)}
                    class="px-3 py-1.5 text-sm rounded-lg border transition-colors {selectedTools.includes(tool)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}"
                  >
                    {tool}
                  </button>
                {/each}
              </div>
              {#if selectedTools.length === 0}
                <p class="text-xs text-amber-600 mt-2">All tools will be available (inherits from parent)</p>
              {:else}
                <p class="text-xs text-gray-500 mt-2">{selectedTools.length} tool{selectedTools.length !== 1 ? 's' : ''} selected</p>
              {/if}
            </div>

            {#if error}
              <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
        <div class="text-xs text-gray-400">
          Saved to: {projectId ? ".claude/agents/" : "~/.claude/agents/"}
        </div>
        <div class="flex gap-3">
          <button
            onclick={onClose}
            class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={handleSave}
            disabled={saving || loading}
            class="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : agent ? "Save Changes" : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
