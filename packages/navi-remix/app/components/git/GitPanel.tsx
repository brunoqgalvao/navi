import { useEffect } from "react";
import { useGitStore } from "~/stores/gitStore";
import { useCurrentSessionStore } from "~/stores/sessionStore";
import { useProjectStore } from "~/stores/projectStore";
import { api } from "~/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/Tabs";
import { GitChanges } from "./GitChanges";
import { GitHistory } from "./GitHistory";
import { LoadingSpinner } from "~/components/ui/LoadingSpinner";
import { Dropdown, DropdownItem } from "~/components/ui/Dropdown";

export function GitPanel() {
  const projectId = useCurrentSessionStore((state) => state.projectId);
  const getProject = useProjectStore((state) => state.getProject);
  const project = projectId ? getProject(projectId) : null;

  // Select primitives individually to avoid re-renders
  const currentBranch = useGitStore((state) => state.currentBranch);
  const branches = useGitStore((state) => state.branches);
  const isLoading = useGitStore((state) => state.isLoading);
  const error = useGitStore((state) => state.error);
  const viewMode = useGitStore((state) => state.viewMode);

  // Actions are stable references
  const setCurrentBranch = useGitStore((state) => state.setCurrentBranch);
  const setBranches = useGitStore((state) => state.setBranches);
  const setStagedFiles = useGitStore((state) => state.setStagedFiles);
  const setUnstagedFiles = useGitStore((state) => state.setUnstagedFiles);
  const setUntrackedFiles = useGitStore((state) => state.setUntrackedFiles);
  const setCommits = useGitStore((state) => state.setCommits);
  const setLoading = useGitStore((state) => state.setLoading);
  const setError = useGitStore((state) => state.setError);
  const setViewMode = useGitStore((state) => state.setViewMode);

  useEffect(() => {
    if (!project?.path) return;

    async function loadGitData() {
      setLoading(true);
      setError(null);

      try {
        // Load git status
        const status = await api.git.status(project!.path);
        setCurrentBranch(status.branch || "");
        setBranches(status.branches || []);

        // Parse files
        const staged = (status.staged || []).map((f: string) => ({
          path: f,
          status: "modified" as const,
          staged: true,
        }));
        const unstaged = (status.unstaged || []).map((f: string) => ({
          path: f,
          status: "modified" as const,
          staged: false,
        }));
        const untracked = (status.untracked || []).map((f: string) => ({
          path: f,
          status: "untracked" as const,
          staged: false,
        }));

        setStagedFiles(staged);
        setUnstagedFiles(unstaged);
        setUntrackedFiles(untracked);

        // Load history
        const history = await api.git.history(project!.path);
        setCommits(
          (history || []).map((c: { sha: string; message: string; author: string; date: string }) => ({
            sha: c.sha,
            shortSha: c.sha.slice(0, 7),
            message: c.message,
            author: c.author,
            date: c.date,
            timestamp: new Date(c.date).getTime(),
          }))
        );
      } catch (err) {
        console.error("Failed to load git data:", err);
        setError("Failed to load git data");
      } finally {
        setLoading(false);
      }
    }

    loadGitData();
  }, [
    project?.path,
    setCurrentBranch,
    setBranches,
    setStagedFiles,
    setUnstagedFiles,
    setUntrackedFiles,
    setCommits,
    setLoading,
    setError,
  ]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-zinc-500">
        Select a project to view git status
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <svg
          className="mb-2 h-8 w-8 text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-sm text-zinc-400">{error}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Make sure this is a git repository
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Branch selector */}
      <div className="border-b border-zinc-700 p-3">
        <Dropdown
          trigger={
            <button className="flex w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span className="text-zinc-200">{currentBranch || "No branch"}</span>
              </span>
              <svg
                className="h-4 w-4 text-zinc-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          }
        >
          {branches.map((branch) => (
            <DropdownItem
              key={branch}
              onClick={() => {
                // Branch switching would need git checkout API
                console.log("Switch to branch:", branch);
              }}
              className={branch === currentBranch ? "bg-zinc-700" : ""}
            >
              {branch}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>

      {/* Tabs */}
      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as "changes" | "history")}
        defaultValue="changes"
        className="flex flex-1 flex-col"
      >
        <TabsList className="px-3">
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="changes" className="flex-1 overflow-auto">
          <GitChanges projectPath={project.path} />
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-auto">
          <GitHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
