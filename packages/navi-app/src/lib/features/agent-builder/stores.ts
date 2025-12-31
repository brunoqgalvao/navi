// Agent Builder Stores
import { writable, derived, get } from "svelte/store";
import type {
  AgentDefinition,
  AgentFileNode,
  EditorState,
  EditorType,
  TestRun,
} from "./types";
import { agentBuilderApi } from "./api";

// Loading states
export const isLoading = writable(false);
export const loadError = writable<string | null>(null);

// Current agent being edited
export const currentAgent = writable<AgentDefinition | null>(null);

// File tree for current agent
export const agentFileTree = writable<AgentFileNode | null>(null);

// Currently selected file/editor
export const editorState = writable<EditorState>({
  currentPath: null,
  editorType: null,
  isDirty: false,
  content: "",
});

// Test runs
export const testRuns = writable<TestRun[]>([]);
export const currentTestRun = writable<TestRun | null>(null);

// UI state
export const agentBuilderView = writable<"library" | "editor">("library");
export const rightPanelCollapsed = writable(false);

// All agents in library (global + project)
export const agentLibrary = writable<AgentDefinition[]>([]);
export const skillLibraryForBuilder = writable<AgentDefinition[]>([]);

// Derived: is the current view a skill or agent
export const isEditingSkill = derived(currentAgent, ($agent) => {
  return $agent?.type === "skill";
});

// Derived: can show test harness (only if agent has schema)
export const canShowTestHarness = derived(currentAgent, ($agent) => {
  return $agent?.type === "agent" && ($agent.inputSchema || $agent.outputSchema);
});

// Actions
export function selectFile(path: string, editorType: EditorType) {
  editorState.update((state) => ({
    ...state,
    currentPath: path,
    editorType,
    isDirty: false,
  }));
}

export function setEditorContent(content: string) {
  editorState.update((state) => ({
    ...state,
    content,
  }));
}

export function markDirty() {
  editorState.update((state) => ({
    ...state,
    isDirty: true,
  }));
}

export function markClean() {
  editorState.update((state) => ({
    ...state,
    isDirty: false,
  }));
}

export function closeEditor() {
  editorState.set({
    currentPath: null,
    editorType: null,
    isDirty: false,
    content: "",
  });
}

// Test harness actions
export function startTestRun(agentId: string, input: Record<string, unknown>): TestRun {
  const run: TestRun = {
    id: crypto.randomUUID(),
    agentId,
    input,
    status: "pending",
    startedAt: new Date(),
    logs: [],
  };

  testRuns.update((runs) => [run, ...runs]);
  currentTestRun.set(run);

  return run;
}

export function updateTestRun(id: string, updates: Partial<TestRun>) {
  testRuns.update((runs) =>
    runs.map((run) => (run.id === id ? { ...run, ...updates } : run))
  );

  const current = get(currentTestRun);
  if (current?.id === id) {
    currentTestRun.update((run) => (run ? { ...run, ...updates } : run));
  }
}

export function addTestLog(
  runId: string,
  level: "info" | "warn" | "error" | "debug",
  message: string,
  data?: unknown
) {
  const entry = {
    timestamp: new Date(),
    level,
    message,
    data,
  };

  testRuns.update((runs) =>
    runs.map((run) =>
      run.id === runId ? { ...run, logs: [...run.logs, entry] } : run
    )
  );
}

// API Actions
export async function loadLibrary() {
  isLoading.set(true);
  loadError.set(null);

  try {
    const { agents, skills } = await agentBuilderApi.getLibrary();
    agentLibrary.set(agents);
    skillLibraryForBuilder.set(skills);
  } catch (e: any) {
    loadError.set(e.message || "Failed to load library");
    console.error("Failed to load library:", e);
  } finally {
    isLoading.set(false);
  }
}

export async function loadAgentFiles(agentId: string) {
  try {
    const tree = await agentBuilderApi.getAgentFiles(agentId);
    agentFileTree.set(tree);
  } catch (e: any) {
    console.error("Failed to load agent files:", e);
    agentFileTree.set(null);
  }
}

export async function loadFileContent(path: string): Promise<string | null> {
  try {
    const { content } = await agentBuilderApi.readFile(path);
    return content;
  } catch (e: any) {
    console.error("Failed to load file:", e);
    return null;
  }
}

export async function saveFileContent(path: string, content: string): Promise<boolean> {
  try {
    await agentBuilderApi.writeFile(path, content);
    markClean();
    return true;
  } catch (e: any) {
    console.error("Failed to save file:", e);
    return false;
  }
}

export async function createAgent(
  name: string,
  description: string,
  type: "agent" | "skill" = "agent"
): Promise<AgentDefinition | null> {
  try {
    const agent = await agentBuilderApi.create({ name, description, type });
    await loadLibrary(); // Refresh library
    return agent;
  } catch (e: any) {
    console.error("Failed to create agent:", e);
    return null;
  }
}

export async function deleteAgent(id: string, type: "agent" | "skill" = "agent"): Promise<boolean> {
  try {
    await agentBuilderApi.delete(id, type);
    await loadLibrary(); // Refresh library
    return true;
  } catch (e: any) {
    console.error("Failed to delete agent:", e);
    return false;
  }
}

export async function addSkillToAgent(agentId: string, name: string): Promise<boolean> {
  try {
    await agentBuilderApi.addSkill(agentId, name);
    await loadAgentFiles(agentId); // Refresh file tree
    return true;
  } catch (e: any) {
    console.error("Failed to add skill:", e);
    return false;
  }
}

export async function addScriptToAgent(
  agentId: string,
  name: string,
  language: "typescript" | "python" | "shell" = "typescript"
): Promise<boolean> {
  try {
    await agentBuilderApi.addScript(agentId, name, language);
    await loadAgentFiles(agentId); // Refresh file tree
    return true;
  } catch (e: any) {
    console.error("Failed to add script:", e);
    return false;
  }
}

// Open an agent for editing
export async function openAgent(agent: AgentDefinition) {
  currentAgent.set(agent);
  agentBuilderView.set("editor");
  closeEditor();

  if (agent.type === "agent") {
    await loadAgentFiles(agent.id);
  } else {
    // For skills, build a simple file tree
    agentFileTree.set({
      name: agent.name,
      path: agent.path,
      type: "directory",
      children: [
        {
          name: "SKILL.md",
          path: `${agent.path}/SKILL.md`,
          type: "file",
          extension: "md",
        },
      ],
    });
  }
}
