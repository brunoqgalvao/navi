import { useState, useCallback } from "react";
import { useSessionStore, useCurrentSessionStore } from "~/stores/sessionStore";
import { api, type Session } from "~/lib/api";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { LoadingSpinner } from "~/components/ui/LoadingSpinner";

interface SessionListProps {
  projectId: string;
  onSelectSession?: (projectId: string, sessionId: string) => void;
}

// Module-level tracking for loaded/loading projects
const loadedProjects = new Set<string>();
const loadingProjects = new Set<string>();

// Stable empty array to avoid infinite re-renders
const EMPTY_SESSIONS: Session[] = [];

export function SessionList({ projectId, onSelectSession }: SessionListProps) {
  const sessions = useSessionStore((state) => state.sessions.get(projectId) ?? EMPTY_SESSIONS);
  const setSessions = useSessionStore((state) => state.setSessions);
  const currentSessionId = useCurrentSessionStore((state) => state.sessionId);
  const [isLoading, setIsLoading] = useState(() => loadingProjects.has(projectId));

  // Load sessions when component mounts (using callback triggered by visibility)
  const loadSessionsIfNeeded = useCallback(() => {
    if (loadedProjects.has(projectId) || loadingProjects.has(projectId) || sessions.length > 0) {
      return;
    }

    loadingProjects.add(projectId);
    setIsLoading(true);

    api.sessions.list(projectId)
      .then((data) => {
        setSessions(projectId, data);
        loadedProjects.add(projectId);
      })
      .catch((error) => {
        console.error("Failed to load sessions:", error);
      })
      .finally(() => {
        loadingProjects.delete(projectId);
        setIsLoading(false);
      });
  }, [projectId, sessions.length, setSessions]);

  // Trigger load on first render via ref callback
  const triggerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      loadSessionsIfNeeded();
    }
  }, [loadSessionsIfNeeded]);

  const handleSessionClick = (session: Session) => {
    onSelectSession?.(projectId, session.id);
  };

  if (isLoading) {
    return (
      <div ref={triggerRef} className="flex items-center justify-center py-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div ref={triggerRef} className="py-2 text-center text-xs text-gray-400">
        No chats yet
      </div>
    );
  }

  // Sort sessions: pinned first, then by last activity
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updated_at || 0) - (a.updated_at || 0);
  });

  return (
    <div ref={triggerRef} className="space-y-0.5">
      {sortedSessions.map((session) => {
        const isSelected = currentSessionId === session.id;

        return (
          <button
            key={session.id}
            onClick={() => handleSessionClick(session)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
              isSelected
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {/* Chat icon */}
            <svg
              className="h-3.5 w-3.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>

            {/* Session title */}
            <span className="flex-1 truncate">
              {session.title || "Untitled"}
            </span>

            {/* Pinned indicator */}
            {session.pinned ? (
              <svg
                className="h-3 w-3 flex-shrink-0 text-amber-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ) : null}

            {/* Timestamp */}
            {session.updated_at && (
              <RelativeTime
                timestamp={session.updated_at}
                className="text-xs"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
