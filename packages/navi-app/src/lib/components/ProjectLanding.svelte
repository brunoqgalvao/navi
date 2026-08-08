<script lang="ts">
  /**
   * ProjectLanding - Default view when no session is active.
   *
   * Renders ProjectEmptyState (the project's new-chat / landing state).
   */
  import type { Session, Workflow } from "$lib/api";
  import ProjectEmptyState from "./ProjectEmptyState.svelte";

  interface Props {
    projectId: string;
    projectPath: string;
    projectName: string;
    sessions: Session[];
    workflows: Workflow[];
    projectDescription?: string | null;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    onSuggestionClick?: (suggestion: string) => void;
    onSelectSession?: (session: Session) => void;
    onOpenSession?: (sessionId: string) => void;
    onNewSession?: () => void;
    onPreviewFile?: (path: string) => void;
    onOpenFiles?: () => void;
    onShowClaudeMd: () => void;
  }

  let {
    projectId,
    projectPath,
    projectName,
    sessions,
    workflows,
    projectDescription = null,
    claudeMdContent,
    projectContext,
    onSuggestionClick,
    onSelectSession,
    onOpenSession,
    onNewSession,
    onPreviewFile,
    onOpenFiles,
    onShowClaudeMd,
  }: Props = $props();
</script>

<div class="flex h-full flex-col pt-4">
  <div class="px-4 pr-52 pt-1 md:px-6 md:pr-56">
    <div class="flex w-full flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-semibold text-gray-900">{projectName}</h1>
          <span class="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">
            Workspace
          </span>
        </div>
      </div>

    </div>
  </div>

  <div class="flex-1 min-h-0">
    <ProjectEmptyState
      {projectName}
      {projectDescription}
      {claudeMdContent}
      {projectContext}
      {onSuggestionClick}
      {onShowClaudeMd}
    />
  </div>
</div>
