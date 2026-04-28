<script lang="ts">
  import Modal from "./Modal.svelte";
  import { api } from "../api";
  import { DEFAULT_CLAUDE_FAST_MODEL } from "../../../shared/anthropic-models";

  interface BatchRunConfig {
    batchGoal: string;
    tasks: string[];
    promptTemplate: string;
  }

  interface BatchPreset {
    id: string;
    name: string;
    batchGoal: string;
    taskLines: string;
    promptTemplate: string;
    updatedAt: number;
  }

  interface Props {
    open: boolean;
    initialPrompt?: string;
    projectPath?: string;
    onClose: () => void;
    onRun: (config: BatchRunConfig) => Promise<void> | void;
  }

  let { open, initialPrompt = "", projectPath, onClose, onRun }: Props = $props();

  const DEFAULT_TEMPLATE = `Work on this scoped task in your dedicated git worktree.

Batch goal:
{{batch_goal}}

Assigned task:
{{task}}

Requirements:
- Stay within this task's scope.
- Use the long Claude Code context window when it helps, but keep the task focused.
- Make concrete code changes when needed.
- Run relevant checks if practical.
- Summarize what changed, what remains, and any blockers.`;
  const PRESETS_STORAGE_KEY = "navi.batch.presets.v1";

  let batchGoal = $state("");
  let taskLines = $state("");
  let promptTemplate = $state(DEFAULT_TEMPLATE);
  let error = $state<string | null>(null);
  let isRunning = $state(false);
  let isSuggesting = $state(false);
  let wasOpen = $state(false);
  let presets = $state<BatchPreset[]>([]);
  let selectedPresetId = $state("");
  let presetName = $state("");

  function normalizeTaskLine(line: string): string {
    return line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim();
  }

  function extractTasks(raw: string): string[] {
    const tasks: string[] = [];
    const seen = new Set<string>();

    for (const line of raw.split("\n")) {
      const task = normalizeTaskLine(line);
      if (!task) continue;
      if (seen.has(task)) continue;
      seen.add(task);
      tasks.push(task);
    }

    return tasks;
  }

  function loadPresets(): BatchPreset[] {
    if (typeof localStorage === "undefined") return [];

    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as BatchPreset[] : [];
    } catch {
      return [];
    }
  }

  function persistPresets(next: BatchPreset[]) {
    const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    presets = sorted;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(sorted));
    }
  }

  function getSuggestedPresetName(): string {
    const firstMeaningfulLine = batchGoal
      .split("\n")
      .map((line) => normalizeTaskLine(line))
      .find(Boolean);

    return (firstMeaningfulLine || "Batch preset").slice(0, 60);
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;

    selectedPresetId = preset.id;
    presetName = preset.name;
    batchGoal = preset.batchGoal;
    taskLines = preset.taskLines;
    promptTemplate = preset.promptTemplate;
    error = null;
  }

  function savePreset() {
    const name = (presetName.trim() || getSuggestedPresetName()).slice(0, 80);
    if (!name) {
      error = "Add a preset name or a batch goal before saving.";
      return;
    }

    const id = selectedPresetId || crypto.randomUUID();
    const preset: BatchPreset = {
      id,
      name,
      batchGoal: batchGoal.trim(),
      taskLines: taskLines.trim(),
      promptTemplate: promptTemplate.trim(),
      updatedAt: Date.now(),
    };

    persistPresets([preset, ...presets.filter((item) => item.id !== id)]);
    selectedPresetId = id;
    presetName = name;
    error = null;
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    persistPresets(presets.filter((item) => item.id !== selectedPresetId));
    selectedPresetId = "";
    presetName = "";
    error = null;
  }

  function seedFromPrompt(prompt: string) {
    const trimmed = prompt.trim();
    presets = loadPresets();
    selectedPresetId = "";
    presetName = "";
    batchGoal = trimmed;
    const parsed = extractTasks(trimmed);
    taskLines = parsed.length > 1 ? parsed.join("\n") : "";
    promptTemplate = DEFAULT_TEMPLATE;
    error = null;
  }

  $effect(() => {
    if (open && !wasOpen) {
      seedFromPrompt(initialPrompt);
      wasOpen = true;
      return;
    }

    if (!open && wasOpen) {
      wasOpen = false;
      isRunning = false;
      error = null;
    }
  });

  const parsedTasks = $derived(extractTasks(taskLines));

  function useGoalLinesAsTasks() {
    taskLines = extractTasks(batchGoal).join("\n");
  }

  async function suggestTasks() {
    const goal = batchGoal.trim();
    if (!goal) {
      error = "Add a batch goal before asking Claude to suggest tasks.";
      return;
    }

    isSuggesting = true;
    error = null;

    try {
      const response = await api.ephemeral.chat({
        prompt: `Break the engineering goal below into 3 to 8 independent, scoped tasks for parallel Claude Code worktrees.

Return only plain text lines.
- One task per line
- No bullets
- No numbering
- Favor vertical slices over tiny micro-tasks
- Assume each task can use a large 1M-token context window
- Each task should still be implementable by one coding session

        Goal:
${goal}`,
        projectPath,
        model: DEFAULT_CLAUDE_FAST_MODEL,
        maxTokens: 500,
        provider: "sdk",
      });

      const tasks = extractTasks(response.result);
      if (tasks.length === 0) {
        throw new Error("Claude did not return any usable tasks.");
      }

      taskLines = tasks.join("\n");
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to suggest tasks";
    } finally {
      isSuggesting = false;
    }
  }

  async function handleRun() {
    const tasks = extractTasks(taskLines);

    if (tasks.length === 0) {
      error = "Add at least one task. One line equals one worktree session.";
      return;
    }

    if (!promptTemplate.includes("{{task}}")) {
      error = "Prompt template must include {{task}}.";
      return;
    }

    isRunning = true;
    error = null;

    try {
      await onRun({
        batchGoal: batchGoal.trim(),
        tasks,
        promptTemplate: promptTemplate.trim(),
      });
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to start batch run";
    } finally {
      isRunning = false;
    }
  }
</script>

<Modal {open} {onClose} title="Batch Worktrees" size="xl">
  {#snippet children()}
    <div class="space-y-5">
      <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
        Create one worktree-backed session per task. Worktree creation runs sequentially to avoid git lock contention, then each spawned session works independently.
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
          <label for="batch-preset-select" class="text-sm font-medium text-gray-700 dark:text-gray-200">Load Preset</label>
          <select
            id="batch-preset-select"
            value={selectedPresetId}
            onchange={(event) => applyPreset((event.currentTarget as HTMLSelectElement).value)}
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a saved preset</option>
            {#each presets as preset}
              <option value={preset.id}>{preset.name}</option>
            {/each}
          </select>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {#if presets.length === 0}
              No saved presets yet.
            {:else}
              {presets.length} preset{presets.length === 1 ? "" : "s"} available.
            {/if}
          </p>
        </div>

        <div class="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
          <label for="batch-preset-name" class="text-sm font-medium text-gray-700 dark:text-gray-200">Save Current As Preset</label>
          <div class="flex gap-2">
            <input
              id="batch-preset-name"
              bind:value={presetName}
              type="text"
              placeholder={getSuggestedPresetName()}
              class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onclick={savePreset}
              class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Save
            </button>
            <button
              type="button"
              onclick={deletePreset}
              disabled={!selectedPresetId}
              class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {#if error}
        <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      {/if}

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <label for="batch-goal" class="text-sm font-medium text-gray-700 dark:text-gray-200">Batch Goal</label>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick={suggestTasks}
              disabled={isSuggesting}
              class="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-300 dark:hover:text-blue-200"
            >
              {isSuggesting ? "Claude is suggesting..." : "Suggest Tasks"}
            </button>
            <button
              type="button"
              onclick={useGoalLinesAsTasks}
              class="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
            >
              Use Goal Lines As Tasks
            </button>
          </div>
        </div>
        <textarea
          id="batch-goal"
          bind:value={batchGoal}
          rows="4"
          placeholder="Describe the overall migration or paste a bullet list you want to fan out."
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        ></textarea>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Optional. Used for shared context across all spawned sessions.
        </p>
      </div>

      <div class="space-y-2">
        <label for="batch-tasks" class="text-sm font-medium text-gray-700 dark:text-gray-200">Tasks</label>
        <textarea
          id="batch-tasks"
          bind:value={taskLines}
          rows="8"
          placeholder={"One task per line\nRefactor auth form validation\nMigrate dashboard charts to new data hook\nAdd regression tests for export flow"}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        ></textarea>
        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{parsedTasks.length} task{parsedTasks.length === 1 ? "" : "s"} ready</span>
          <span>Best used with 2+ narrow tasks.</span>
        </div>
      </div>

      <div class="space-y-2">
        <label for="batch-prompt-template" class="text-sm font-medium text-gray-700 dark:text-gray-200">Prompt Template</label>
        <textarea
          id="batch-prompt-template"
          bind:value={promptTemplate}
          rows="10"
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        ></textarea>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Available placeholders: <code>&#123;&#123;batch_goal&#125;&#125;</code> and <code>&#123;&#123;task&#125;&#125;</code>
        </p>
      </div>
    </div>
  {/snippet}

  {#snippet footer()}
    <button
      type="button"
      onclick={onClose}
      disabled={isRunning}
      class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={handleRun}
      disabled={isRunning}
      class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
    >
      {#if isRunning}
        Launching...
      {:else if parsedTasks.length > 0}
        Launch {parsedTasks.length} Batch
      {:else}
        Launch Batch
      {/if}
    </button>
  {/snippet}
</Modal>
