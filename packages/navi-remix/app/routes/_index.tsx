import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { ChatView, ChatInput } from "~/components/chat";
import { RunningProcesses } from "~/components/chat/RunningProcesses";
import { Sidebar } from "~/components/sidebar/Sidebar";
import { Header } from "~/components/layout/Header";
import { RightPanel } from "~/components/layout/RightPanel";
import { Settings } from "~/components/settings/Settings";
import { Onboarding } from "~/components/onboarding/Onboarding";
import { GitPanel } from "~/components/git/GitPanel";
import { Preview, FileBrowser } from "~/components/preview";
import { SearchModal } from "~/components/search/SearchModal";
import { useWebSocket } from "~/hooks/useWebSocket";
import { useMessageHandler, type ChildProcess } from "~/hooks/useMessageHandler";
import { useHashRouter } from "~/hooks/useHashRouter";
import { useKeyboardShortcuts } from "~/hooks/useKeyboardShortcuts";
import { useDataLoader } from "~/hooks/useDataLoader";
import {
  useProjectStore,
  useSessionStore,
  useCurrentSessionStore,
  useMessageStore,
  useStreamingStore,
  useConnectionStore,
} from "~/stores";
import { useSettingsStore } from "~/stores/settingsStore";
import { useTodoStore } from "~/stores/todoStore";
import { api } from "~/lib/api";
import { renderMarkdown } from "~/lib/markdown";

// Stable empty arrays to prevent re-renders
const EMPTY_MESSAGES: never[] = [];
const EMPTY_TODOS: never[] = [];

export default function Index() {
  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState("");
  const [childProcesses, setChildProcesses] = useState<ChildProcess[]>([]);

  // Settings
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);

  // Stores
  const projects = useProjectStore((s) => s.projects);
  const addProject = useProjectStore((s) => s.addProject);
  const getProject = useProjectStore((s) => s.getProject);
  const sessions = useSessionStore((s) => s.sessions);
  const addSession = useSessionStore((s) => s.addSession);
  const addMessage = useMessageStore((s) => s.addMessage);
  const messagesMap = useMessageStore((s) => s.messages);
  const streamingMap = useStreamingStore((s) => s.sessions);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const todosMap = useTodoStore((s) => s.sessionTodos);

  // Select current session state individually to avoid unnecessary re-renders
  const isLoading = useCurrentSessionStore((s) => s.isLoading);
  const setLoading = useCurrentSessionStore((s) => s.setLoading);

  // Data loader
  const { loadProjects, onProjectChange, onSessionChange } = useDataLoader();

  // Load projects on first render (only once)
  const hasLoadedProjects = useRef(false);
  if (!hasLoadedProjects.current) {
    hasLoadedProjects.current = true;
    loadProjects();
  }

  // Router with callbacks for data loading
  const { projectId, sessionId, navigateToSession } = useHashRouter({
    onProjectChange,
    onSessionChange,
  });

  // Get current data with stable references
  const currentProject = projectId ? getProject(projectId) : null;
  const projectSessions = useMemo(
    () => (projectId ? sessions.get(projectId) || [] : []),
    [projectId, sessions]
  );
  const currentSessionData = projectSessions.find((s) => s.id === sessionId);
  const messages = sessionId ? messagesMap.get(sessionId) || EMPTY_MESSAGES : EMPTY_MESSAGES;
  const streamingState = sessionId ? streamingMap.get(sessionId) : undefined;
  const todos = sessionId ? todosMap.get(sessionId) || EMPTY_TODOS : EMPTY_TODOS;

  // Message handler
  const { handle } = useMessageHandler({
    getCurrentSessionId: () => sessionId,
    getProjectId: () => projectId,
    callbacks: {
      onStreamingStart: () => setLoading(true),
      onStreamingEnd: () => {
        setLoading(false);
        setChildProcesses([]); // Clear child processes when streaming ends
      },
      onChildProcesses: (_, processes) => setChildProcesses(processes),
    },
  });

  // Track if we need to re-attach on reconnect
  const needsReattachRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // WebSocket connection
  const ws = useWebSocket({
    onMessage: handle,
    onConnect: () => {
      setConnected(true);
      // Mark that we need to re-attach if we were loading
      if (needsReattachRef.current && sessionIdRef.current) {
        console.log(`[WS] Reconnected - re-attaching to session ${sessionIdRef.current}`);
        needsReattachRef.current = false;
      }
    },
    onDisconnect: () => {
      setConnected(false);
      // If we're loading, mark that we need to re-attach on reconnect
      if (isLoading && sessionId) {
        needsReattachRef.current = true;
      }
    },
  });

  // Re-attach to session after reconnection
  useEffect(() => {
    if (ws.isConnected && needsReattachRef.current && sessionId) {
      console.log(`[WS] Sending attach for session ${sessionId}`);
      ws.attachSession(sessionId);
      needsReattachRef.current = false;
    }
  }, [ws.isConnected, sessionId, ws]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: "k", mod: true, handler: () => setSearchOpen(true) },
    { key: "p", mod: true, handler: () => setRightPanelOpen((v) => !v) },
    { key: "b", mod: true, handler: () => setSidebarCollapsed((v) => !v) },
    { key: ",", mod: true, handler: () => setSettingsOpen(true) },
    { key: "Escape", handler: () => {
      if (searchOpen) setSearchOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
    }},
  ]);

  // Handle sending messages
  const handleSend = useCallback(
    async (text: string) => {
      if (!projectId || !ws.isConnected) return;

      let activeSessionId = sessionId;

      // Create a new session if needed
      if (!activeSessionId) {
        try {
          const newSession = await api.sessions.create(projectId, {
            title: text.slice(0, 50),
          });
          addSession(projectId, newSession);
          activeSessionId = newSession.id;
          navigateToSession(projectId, newSession.id);
        } catch (error) {
          console.error("Failed to create session:", error);
          return;
        }
      }

      // Add user message to store
      addMessage(activeSessionId, {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      });

      // Get the project for working directory
      const project = projects.find((p) => p.id === projectId);

      // Send query to server
      ws.query({
        prompt: text,
        projectId,
        sessionId: activeSessionId,
        workingDirectory: project?.path,
      });
    },
    [projectId, sessionId, ws, projects, addMessage, addSession, navigateToSession]
  );

  // Handle new chat
  const handleNewChat = useCallback(() => {
    if (projectId) {
      navigateToSession(projectId, "");
    }
  }, [projectId, navigateToSession]);

  // Handle killing a child process
  const handleKillProcess = useCallback((pid: number) => {
    if (sessionId) {
      ws.send({ type: "kill_process", sessionId, pid });
    }
  }, [sessionId, ws]);

  // Handle new project
  const handleNewProject = useCallback(async () => {
    const path = prompt("Enter project path:");
    if (!path) return;

    try {
      const name = path.split("/").pop() || "New Project";
      const project = await api.projects.create({ name, path });
      addProject(project);
      navigateToSession(project.id, "");
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  }, [addProject, navigateToSession]);

  // Show onboarding if not complete
  if (!onboardingComplete) {
    return <Onboarding />;
  }

  return (
    <div className="flex h-screen bg-white text-gray-900">
      {/* Sidebar */}
      <Sidebar
        projectId={projectId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNewChat={handleNewChat}
        onNewProject={handleNewProject}
        onOpenSettings={() => setSettingsOpen(true)}
        onSelectProject={(id) => navigateToSession(id, "")}
        onSelectSession={(projId, sessId) => navigateToSession(projId, sessId)}
        onBackToWorkspaces={() => navigateToSession("", "")}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header
          projectName={currentProject?.name}
          sessionTitle={currentSessionData?.title}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => setRightPanelOpen(!rightPanelOpen)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Chat area */}
        <div className="flex flex-1 overflow-hidden bg-gray-50">
          {/* Chat content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {projectId ? (
              <>
                <ChatView
                  messages={messages}
                  streamingState={streamingState}
                  projectPath={currentProject?.path}
                  renderMarkdown={renderMarkdown}
                  todos={todos}
                  isLoading={isLoading}
                />
                <RunningProcesses
                  processes={childProcesses}
                  onKillProcess={handleKillProcess}
                />
                <ChatInput
                  onSend={handleSend}
                  onStop={() => sessionId && ws.abort(sessionId)}
                  disabled={!isConnected}
                  loading={isLoading}
                  projectPath={currentProject?.path}
                  placeholder={
                    isConnected
                      ? "Message Claude... (@ to attach files)"
                      : "Connecting to server..."
                  }
                />
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                    Welcome to Navi
                  </h2>
                  <p className="text-gray-500">
                    Select a project from the sidebar or create a new one to get started.
                  </p>
                </div>

                {/* Quick project list */}
                {projects.length > 0 && (
                  <div className="w-full max-w-md space-y-2">
                    <h3 className="mb-3 text-sm font-medium text-gray-600">
                      Recent Projects
                    </h3>
                    {projects.slice(0, 5).map((project) => (
                      <button
                        key={project.id}
                        onClick={() => navigateToSession(project.id, "")}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
                      >
                        <div className="font-medium text-gray-900">
                          {project.name}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {project.path}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {projects.length === 0 && (
                  <button
                    onClick={handleNewProject}
                    className="rounded-xl bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-800 transition-colors"
                  >
                    Create Your First Project
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right panel */}
          {rightPanelOpen && (
            <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white">
              <RightPanel
                gitPanel={<GitPanel />}
                filesPanel={
                  <FileBrowser
                    rootPath={currentProject?.path || ""}
                    onPreview={setPreviewSource}
                  />
                }
                previewPanel={
                  <Preview
                    source={previewSource}
                    basePath={currentProject?.path}
                  />
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Settings modal */}
      <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Search modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectProject={(id) => navigateToSession(id, "")}
        onSelectSession={(projectId, sessionId) =>
          navigateToSession(projectId, sessionId)
        }
      />
    </div>
  );
}
