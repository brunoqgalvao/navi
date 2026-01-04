import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "~/stores/projectStore";
import { useSessionStore } from "~/stores/sessionStore";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
}

interface SearchResult {
  type: "project" | "session";
  id: string;
  projectId?: string;
  title: string;
  subtitle?: string;
}

export function SearchModal({
  isOpen,
  onClose,
  onSelectProject,
  onSelectSession,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const projects = useProjectStore((s) => s.projects);
  const sessions = useSessionStore((s) => s.sessions);

  // Build search results
  const results: SearchResult[] = [];

  // Add matching projects
  projects
    .filter((p) => !p.archived)
    .forEach((project) => {
      if (
        !query ||
        project.name.toLowerCase().includes(query.toLowerCase()) ||
        project.path.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          type: "project",
          id: project.id,
          title: project.name,
          subtitle: project.path,
        });
      }

      // Add matching sessions for this project
      const projectSessions = sessions.get(project.id) || [];
      projectSessions
        .filter((s) => !s.archived)
        .forEach((session) => {
          if (
            !query ||
            session.title?.toLowerCase().includes(query.toLowerCase())
          ) {
            results.push({
              type: "session",
              id: session.id,
              projectId: project.id,
              title: session.title || "Untitled",
              subtitle: project.name,
            });
          }
        });
    });

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          if (selected.type === "project") {
            onSelectProject(selected.id);
          } else {
            onSelectSession(selected.projectId!, selected.id);
          }
          onClose();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIndex, onSelectProject, onSelectSession, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects and chats..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          <kbd className="px-2 py-0.5 text-xs text-gray-400 bg-gray-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No results found
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => {
                  if (result.type === "project") {
                    onSelectProject(result.id);
                  } else {
                    onSelectSession(result.projectId!, result.id);
                  }
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                  i === selectedIndex ? "bg-gray-100" : "hover:bg-gray-50"
                }`}
              >
                {result.type === "project" ? (
                  <svg
                    className="w-5 h-5 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {result.title}
                  </div>
                  {result.subtitle && (
                    <div className="text-xs text-gray-500 truncate">
                      {result.subtitle}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {result.type === "project" ? "Project" : "Chat"}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↵</kbd>
            to select
          </span>
        </div>
      </div>
    </div>
  );
}
