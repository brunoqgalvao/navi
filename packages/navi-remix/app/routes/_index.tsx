import { useEffect, useCallback, useState } from "react";
import { ChatView, ChatInput } from "~/components/chat";
import { useWebSocket } from "~/hooks/useWebSocket";
import { useMessageHandler } from "~/hooks/useMessageHandler";
import { useHashRouter } from "~/hooks/useHashRouter";
import {
  useProjectStore,
  useSessionStore,
  useCurrentSessionStore,
  useMessageStore,
  useStreamingStore,
  useConnectionStore,
} from "~/stores";
import { api } from "~/lib/api";

export default function Index() {
  const { projectId, sessionId, navigateToSession } = useHashRouter();

  // Stores
  const projects = useProjectStore((s) => s.projects);
  const setProjects = useProjectStore((s) => s.setProjects);
  const sessions = useSessionStore((s) => s.sessions);
  const setSessions = useSessionStore((s) => s.setSessions);
  const addSession = useSessionStore((s) => s.addSession);
  const currentSession = useCurrentSessionStore();
  const messageStore = useMessageStore();
  const streamingStore = useStreamingStore();
  const setConnected = useConnectionStore((s) => s.setConnected);
  const isConnected = useConnectionStore((s) => s.isConnected);

  // Get current messages
  const messages = messageStore.getMessages(sessionId || "");
  const streamingState = streamingStore.getState(sessionId || "");

  // Message handler
  const { handle } = useMessageHandler({
    getCurrentSessionId: () => sessionId,
    getProjectId: () => projectId,
    callbacks: {
      onStreamingStart: (sid) => {
        currentSession.setLoading(true);
      },
      onStreamingEnd: (sid) => {
        currentSession.setLoading(false);
      },
    },
  });

  // WebSocket connection
  const ws = useWebSocket({
    onMessage: handle,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  });

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [projectsData] = await Promise.all([api.projects.list()]);
        setProjects(projectsData);

        // If we have a project, load its sessions
        if (projectId) {
          const sessionsData = await api.sessions.list(projectId);
          setSessions(sessionsData);
        }

        // If we have a session, load its messages
        if (sessionId) {
          const messagesData = await api.messages.list(sessionId);
          // Convert API messages to ChatMessage format
          const chatMessages = messagesData.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            timestamp: new Date(m.timestamp),
            parentToolUseId: m.parent_tool_use_id,
            isSynthetic: !!m.is_synthetic,
          }));
          messageStore.setMessages(sessionId, chatMessages);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    }

    loadData();
  }, [projectId, sessionId]);

  // Sync route to current session store
  useEffect(() => {
    currentSession.restoreFromUrl(projectId, sessionId);
  }, [projectId, sessionId]);

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
          addSession(newSession);
          activeSessionId = newSession.id;
          navigateToSession(projectId, newSession.id);
        } catch (error) {
          console.error("Failed to create session:", error);
          return;
        }
      }

      // Add user message to store
      messageStore.addMessage(activeSessionId, {
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
    [projectId, sessionId, ws, projects, messageStore, addSession, navigateToSession]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 bg-zinc-800/50">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">Navi Remix</h1>
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
            title={isConnected ? "Connected" : "Disconnected"}
          />
        </div>
        <div className="text-sm text-zinc-400">
          {projectId ? (
            <>
              Project: <span className="text-zinc-200">{projectId}</span>
              {sessionId && (
                <>
                  {" / "}
                  Session: <span className="text-zinc-200">{sessionId}</span>
                </>
              )}
            </>
          ) : (
            "No project selected"
          )}
        </div>
      </header>

      {/* Main content */}
      {projectId ? (
        <>
          <ChatView messages={messages} streamingState={streamingState} />
          <ChatInput
            onSend={handleSend}
            disabled={!isConnected || currentSession.isLoading}
            placeholder={
              isConnected
                ? "Type a message..."
                : "Connecting to server..."
            }
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              Welcome to Navi Remix
            </h2>
            <p className="text-zinc-400">
              Select a project from the sidebar or create a new one to get
              started.
            </p>
          </div>

          {/* Project list */}
          <div className="w-full max-w-md space-y-2">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">
              Your Projects
            </h3>
            {projects.length === 0 ? (
              <p className="text-zinc-500 text-sm">No projects yet</p>
            ) : (
              projects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigateToSession(project.id, "")}
                  className="w-full text-left px-4 py-3 bg-zinc-800 hover:bg-zinc-700
                           border border-zinc-700 rounded-lg transition-colors"
                >
                  <div className="font-medium text-zinc-200">
                    {project.name}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {project.path}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Status */}
          <div className="mt-8 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 text-sm">
            <h4 className="font-medium text-zinc-200 mb-2">Migration Status</h4>
            <ul className="space-y-1 text-zinc-400">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Package setup
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Zustand stores
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> WebSocket integration
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span> Basic chat components
              </li>
              <li className="flex items-center gap-2">
                <span className="text-yellow-500">○</span> Sidebar navigation
              </li>
              <li className="flex items-center gap-2">
                <span className="text-yellow-500">○</span> Tool previews
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
