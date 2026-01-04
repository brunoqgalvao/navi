import type { Project } from "~/lib/api";
import { SessionList } from "./SessionList";
import { useCurrentSessionStore } from "~/stores/sessionStore";

interface ProjectListProps {
  projects: Project[];
  isProjectExpanded: (id: string) => boolean;
  onToggleProject: (id: string) => void;
  onNewProject?: () => void;
  onSelectProject?: (projectId: string) => void;
  onSelectSession?: (projectId: string, sessionId: string) => void;
}

export function ProjectList({
  projects,
  isProjectExpanded,
  onToggleProject,
  onNewProject,
  onSelectProject,
  onSelectSession,
}: ProjectListProps) {
  const currentProjectId = useCurrentSessionStore((state) => state.projectId);

  // Separate pinned and regular projects
  const pinnedProjects = projects.filter((p) => p.pinned && !p.archived);
  const regularProjects = projects.filter((p) => !p.pinned && !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);

  const handleProjectClick = (project: Project) => {
    onSelectProject?.(project.id);
    onToggleProject(project.id);
  };

  const renderProject = (project: Project) => {
    const isExpanded = isProjectExpanded(project.id);
    const isSelected = currentProjectId === project.id;

    return (
      <div key={project.id} className="mb-1">
        <button
          onClick={() => handleProjectClick(project)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            isSelected
              ? "bg-gray-100 text-gray-900"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {/* Expand/collapse icon */}
          <svg
            className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>

          {/* Project icon */}
          <svg
            className="h-4 w-4 flex-shrink-0 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>

          {/* Project name */}
          <span className="flex-1 truncate">{project.name}</span>

          {/* Pinned indicator */}
          {project.pinned ? (
            <svg
              className="h-3 w-3 flex-shrink-0 text-amber-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ) : null}

          {/* Session count */}
          {project.session_count ? (
            <span className="text-xs text-gray-400">
              {project.session_count}
            </span>
          ) : null}
        </button>

        {/* Sessions list */}
        {isExpanded && (
          <div className="ml-6 mt-1">
            <SessionList projectId={project.id} onSelectSession={onSelectSession} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-2">
      {/* Pinned projects */}
      {pinnedProjects.length > 0 && (
        <div>
          <div className="mb-2 px-2 text-xs font-medium uppercase text-gray-400">
            Pinned
          </div>
          {pinnedProjects.map(renderProject)}
        </div>
      )}

      {/* Regular projects */}
      {regularProjects.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-xs font-medium uppercase text-gray-400">
              Projects
            </span>
            <button
              onClick={onNewProject}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="New project"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
          {regularProjects.map(renderProject)}
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="px-3 py-8 text-center text-sm text-gray-500">
          <p>No projects yet</p>
          <button
            onClick={onNewProject}
            className="mt-2 text-blue-600 hover:underline"
          >
            Create your first project
          </button>
        </div>
      )}

      {/* Archived projects (collapsed by default) */}
      {archivedProjects.length > 0 && (
        <details className="group">
          <summary className="mb-2 cursor-pointer list-none px-2 text-xs font-medium uppercase text-gray-400 hover:text-gray-600">
            <span className="flex items-center gap-1">
              <svg
                className="h-3 w-3 transition-transform group-open:rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Archived ({archivedProjects.length})
            </span>
          </summary>
          <div className="opacity-60">
            {archivedProjects.map(renderProject)}
          </div>
        </details>
      )}
    </div>
  );
}
