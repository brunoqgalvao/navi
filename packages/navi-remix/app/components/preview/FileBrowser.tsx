import { useState, useEffect, useCallback } from "react";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
}

interface FileBrowserProps {
  rootPath: string;
  onSelect?: (path: string) => void;
  onPreview?: (path: string) => void;
}

const fileColors: Record<string, string> = {
  ts: "text-blue-500",
  tsx: "text-blue-500",
  js: "text-yellow-500",
  jsx: "text-yellow-500",
  svelte: "text-orange-500",
  vue: "text-green-500",
  py: "text-blue-400",
  rs: "text-orange-600",
  go: "text-cyan-500",
  json: "text-yellow-600",
  md: "text-gray-500",
  css: "text-pink-500",
  html: "text-orange-400",
  default: "text-gray-400",
};

function getFileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return fileColors[ext] || fileColors.default;
}

export function FileBrowser({ rootPath, onSelect, onPreview }: FileBrowserProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Map<string, FileEntry[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDirectory = useCallback(async (path: string): Promise<FileEntry[]> => {
    const res = await fetch(`http://localhost:3002/api/fs/list?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.entries.sort((a: FileEntry, b: FileEntry) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const loadRoot = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError("");
    try {
      const data = await loadDirectory(rootPath);
      setEntries(data);
    } catch (e: any) {
      setError(e.message || "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [rootPath, loadDirectory]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  const toggleDir = async (path: string) => {
    if (expandedDirs.has(path)) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      try {
        const contents = await loadDirectory(path);
        setDirContents((prev) => new Map(prev).set(path, contents));
        setExpandedDirs((prev) => new Set(prev).add(path));
      } catch (e) {
        console.error("Failed to load directory:", e);
      }
    }
  };

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.type === "directory") {
      toggleDir(entry.path);
    } else {
      onSelect?.(entry.path);
      onPreview?.(entry.path);
    }
  };

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = expandedDirs.has(entry.path);
    const contents = dirContents.get(entry.path) || [];

    return (
      <div key={entry.path}>
        <button
          onClick={() => handleEntryClick(entry)}
          className={`w-full flex items-center gap-2 px-2 py-1 text-left text-sm hover:bg-gray-100 rounded transition-colors`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {entry.type === "directory" ? (
            <>
              <svg
                className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </>
          ) : (
            <>
              <span className="w-3" />
              <svg className={`w-4 h-4 ${getFileColor(entry.name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </>
          )}
          <span className="truncate text-gray-700">{entry.name}</span>
        </button>

        {entry.type === "directory" && isExpanded && (
          <div>
            {contents.map((child) => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!rootPath) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400 p-4">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-sm">No project selected</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
        <p className="mt-2 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-red-500 p-4">
        <p className="text-sm">{error}</p>
        <button
          onClick={loadRoot}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto py-2">
      {/* Root path header */}
      <div className="flex items-center gap-2 px-3 py-1.5 mb-1 border-b border-gray-100">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-xs font-medium text-gray-600 truncate">
          {rootPath.split("/").pop()}
        </span>
        <button
          onClick={loadRoot}
          className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* File tree */}
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-gray-400">
          Empty directory
        </div>
      ) : (
        <div className="px-1">
          {entries.map((entry) => renderEntry(entry))}
        </div>
      )}
    </div>
  );
}
