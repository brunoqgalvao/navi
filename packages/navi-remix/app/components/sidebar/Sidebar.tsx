import { SessionList } from "./SessionList";
import { useProjectStore } from "~/stores/projectStore";
import { useCurrentSessionStore } from "~/stores/sessionStore";
import { useConnectionStore } from "~/stores";
import type { Project } from "~/lib/api";

interface SidebarProps {
  projectId?: string | null;
  onNewProject?: () => void;
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectProject?: (projectId: string) => void;
  onSelectSession?: (projectId: string, sessionId: string) => void;
  onBackToWorkspaces?: () => void;
}

export function Sidebar({
  projectId: propProjectId,
  onNewProject,
  onNewChat,
  onOpenSettings,
  collapsed = false,
  onToggleCollapse,
  onSelectProject,
  onSelectSession,
  onBackToWorkspaces,
}: SidebarProps) {
  const projects = useProjectStore((state) => state.projects);
  const storeProjectId = useCurrentSessionStore((s) => s.projectId);
  const isConnected = useConnectionStore((s) => s.isConnected);

  // Use prop if provided, otherwise fall back to store
  const projectId = propProjectId !== undefined ? propProjectId : storeProjectId;
  const currentProject = projects.find((p) => p.id === projectId);

  // Separate pinned and regular projects
  const pinnedProjects = projects.filter((p) => p.pinned && !p.archived);
  const regularProjects = projects.filter((p) => !p.pinned && !p.archived);

  if (collapsed) {
    return (
      <aside className="flex w-14 flex-col items-center border-r border-gray-200 bg-gray-50/50 py-4">
        <button
          onClick={onToggleCollapse}
          className="w-10 h-10 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200/50 hover:text-gray-900 transition-all"
          title="Expand sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1" />
        <div className="flex flex-col items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-400"}`}
            title={isConnected ? "Online" : "Offline"}
          />
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-gray-50/50">
      {/* Header */}
      <div className="h-14 px-3 border-b border-gray-100 flex items-center justify-between">
        <button
          onClick={onBackToWorkspaces}
          className="flex items-center gap-2.5 px-2 hover:opacity-70 transition-opacity"
        >
          <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
            <svg width="12" height="10" viewBox="0 0 160 120" stroke="white" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M 35 30 L 10 60 L 35 90" />
              <path d="M 70 95 L 90 25" />
              <path d="M 125 30 L 150 60 L 125 90" />
            </svg>
          </div>
          <span className="font-medium text-sm tracking-tight text-gray-900">Navi</span>
        </button>
        <div className="flex items-center gap-0.5">
          {currentProject && (
            <button
              onClick={onNewChat}
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all"
              title="New Chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content - either project list or session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {!currentProject ? (
          // Workspace/Project list view
          <div className="px-3">
            <div className="flex items-center justify-between mb-2 px-2">
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Workspaces
              </h3>
              <button
                onClick={onNewProject}
                className="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors border border-gray-200"
              >
                + New
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="text-xs text-gray-400 italic text-center py-4">
                No workspaces yet
              </div>
            ) : (
              <div className="space-y-1">
                {/* Pinned projects */}
                {pinnedProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isSelected={project.id === projectId}
                    onSelect={() => onSelectProject?.(project.id)}
                  />
                ))}

                {/* Regular projects */}
                {regularProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isSelected={project.id === projectId}
                    onSelect={() => onSelectProject?.(project.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          // Session list view for current project
          <div className="px-3 flex flex-col h-full">
            <button
              onClick={onBackToWorkspaces}
              className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800 mb-4 px-1 py-1 -ml-1 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Workspaces
            </button>

            {/* Current project info */}
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="truncate">{currentProject.name}</span>
              </h2>
              <p className="text-[11px] text-gray-400 truncate mt-0.5 pl-6" title={currentProject.path}>
                {currentProject.path}
              </p>
            </div>

            {/* Chats header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Chats
              </h3>
              <button
                onClick={onNewChat}
                className="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors border border-gray-200"
              >
                + New
              </button>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto">
              <SessionList
                projectId={currentProject.id}
                onSelectSession={onSelectSession}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer with connection status */}
      <div className="border-t border-gray-200 p-3 bg-gray-50/50">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-gray-500">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-400"}`}
            />
            <span>{isConnected ? "Online" : "Offline"}</span>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

// Simple project item component
function ProjectItem({ project, onSelect, isSelected }: { project: Project; onSelect: () => void; isSelected?: boolean }) {
  const sessionCount = project.session_count || 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-2.5 py-2 rounded-lg transition-all ${
        isSelected
          ? "bg-blue-50 text-blue-700 border border-blue-200"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <div className="flex items-center gap-2">
        <svg className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-blue-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className={`text-[13px] font-medium truncate flex-1 ${project.archived ? "text-gray-400" : ""}`}>
          {project.name}
        </span>
        {project.pinned && (
          <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )}
        {project.archived ? (
          <span className="shrink-0 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            Archived
          </span>
        ) : (
          <span className={`shrink-0 text-[10px] ${isSelected ? "text-blue-500" : "text-gray-400"}`}>
            {sessionCount}
          </span>
        )}
      </div>
    </button>
  );
}
