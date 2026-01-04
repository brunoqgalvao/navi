import { useGitStore, type GitFile } from "~/stores/gitStore";
import { FileIcon } from "~/components/ui/FileIcon";
import { Badge } from "~/components/ui/Badge";

interface GitChangesProps {
  projectPath: string;
}

const statusColors = {
  modified: "text-amber-400",
  added: "text-emerald-400",
  deleted: "text-red-400",
  renamed: "text-blue-400",
  untracked: "text-zinc-400",
};

const statusLabels = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

export function GitChanges({ projectPath }: GitChangesProps) {
  const stagedFiles = useGitStore((state) => state.stagedFiles);
  const unstagedFiles = useGitStore((state) => state.unstagedFiles);
  const untrackedFiles = useGitStore((state) => state.untrackedFiles);
  const selectedFile = useGitStore((state) => state.selectedFile);
  const setSelectedFile = useGitStore((state) => state.setSelectedFile);

  const hasChanges =
    stagedFiles.length > 0 ||
    unstagedFiles.length > 0 ||
    untrackedFiles.length > 0;

  const renderFile = (file: GitFile) => {
    const filename = file.path.split("/").pop() || file.path;
    const isSelected = selectedFile === file.path;

    return (
      <button
        key={file.path}
        onClick={() => setSelectedFile(file.path)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
          isSelected
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-300 hover:bg-zinc-800"
        }`}
      >
        <span
          className={`w-4 text-center font-mono text-xs ${
            statusColors[file.status]
          }`}
        >
          {statusLabels[file.status]}
        </span>
        <FileIcon filename={filename} />
        <span className="flex-1 truncate">{file.path}</span>
      </button>
    );
  };

  if (!hasChanges) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <svg
          className="mb-2 h-8 w-8 text-emerald-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <p className="text-sm text-zinc-400">Working tree clean</p>
        <p className="mt-1 text-xs text-zinc-500">No changes to commit</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {/* Staged files */}
      {stagedFiles.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-zinc-500">
              Staged Changes
            </span>
            <Badge variant="success">{stagedFiles.length}</Badge>
          </div>
          <div className="space-y-0.5">{stagedFiles.map(renderFile)}</div>
        </div>
      )}

      {/* Unstaged files */}
      {unstagedFiles.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-zinc-500">
              Changes
            </span>
            <Badge variant="warning">{unstagedFiles.length}</Badge>
          </div>
          <div className="space-y-0.5">{unstagedFiles.map(renderFile)}</div>
        </div>
      )}

      {/* Untracked files */}
      {untrackedFiles.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-zinc-500">
              Untracked
            </span>
            <Badge>{untrackedFiles.length}</Badge>
          </div>
          <div className="space-y-0.5">{untrackedFiles.map(renderFile)}</div>
        </div>
      )}
    </div>
  );
}
