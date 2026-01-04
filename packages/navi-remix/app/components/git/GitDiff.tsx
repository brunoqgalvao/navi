import { useEffect, useState } from "react";
import { useGitStore } from "~/stores/gitStore";
import { api } from "~/lib/api";
import { LoadingSpinner } from "~/components/ui/LoadingSpinner";
import { FileIcon } from "~/components/ui/FileIcon";

interface GitDiffProps {
  projectPath: string;
}

export function GitDiff({ projectPath }: GitDiffProps) {
  const selectedFile = useGitStore((state) => state.selectedFile);
  const selectedDiff = useGitStore((state) => state.selectedDiff);
  const setSelectedDiff = useGitStore((state) => state.setSelectedDiff);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedDiff(null);
      return;
    }

    async function loadDiff() {
      setIsLoading(true);
      try {
        const diff = await api.git.diff(projectPath, selectedFile!);
        setSelectedDiff({
          file: selectedFile!,
          additions: diff.additions || 0,
          deletions: diff.deletions || 0,
          hunks: diff.diff || "",
        });
      } catch (error) {
        console.error("Failed to load diff:", error);
        setSelectedDiff(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadDiff();
  }, [selectedFile, projectPath, setSelectedDiff]);

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Select a file to view diff
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

  if (!selectedDiff) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        No diff available
      </div>
    );
  }

  const filename = selectedFile.split("/").pop() || selectedFile;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-700 p-3">
        <FileIcon filename={filename} />
        <span className="flex-1 truncate font-mono text-sm text-zinc-300">
          {selectedFile}
        </span>
        <span className="text-xs text-emerald-400">
          +{selectedDiff.additions}
        </span>
        <span className="text-xs text-red-400">-{selectedDiff.deletions}</span>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto p-3">
        <pre className="font-mono text-xs">
          {selectedDiff.hunks.split("\n").map((line, i) => {
            let className = "text-zinc-400";
            if (line.startsWith("+") && !line.startsWith("+++")) {
              className = "bg-emerald-900/30 text-emerald-300";
            } else if (line.startsWith("-") && !line.startsWith("---")) {
              className = "bg-red-900/30 text-red-300";
            } else if (line.startsWith("@@")) {
              className = "text-blue-400";
            }

            return (
              <div key={i} className={`${className} px-2`}>
                {line}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
