import { useState, useCallback, useRef } from "react";

interface AttachedFile {
  path: string;
  name: string;
  type: "file" | "image";
}

interface Skill {
  name: string;
  path: string;
}

interface ChatInputProps {
  onSend: (message: string, attachedFiles?: AttachedFile[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  initialValue?: string;
  projectPath?: string;
  queuedCount?: number;
  activeSkills?: Skill[];
  onDraftChange?: (draft: string) => void;
}

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

// Module-level cache for loaded files per project
const fileCache = new Map<string, FileEntry[]>();
const loadingProjects = new Set<string>();

async function loadProjectFiles(
  rootPath: string,
  currentPath: string = rootPath,
  depth: number = 0,
  accumulated: FileEntry[] = []
): Promise<FileEntry[]> {
  if (depth > 4 || accumulated.length > 500) return accumulated;

  try {
    const res = await fetch(
      `http://localhost:3001/api/fs/list?path=${encodeURIComponent(currentPath)}`
    );
    const data = await res.json();

    if (data.entries) {
      for (const entry of data.entries) {
        if (accumulated.length > 500) break;
        if (entry.type === "file") {
          accumulated.push({ name: entry.name, path: entry.path, type: "file" });
        } else if (
          entry.type === "directory" &&
          !entry.name.startsWith(".") &&
          ![
            "node_modules",
            "target",
            "dist",
            "build",
            ".git",
            "__pycache__",
            "venv",
            ".next",
            "coverage",
            ".svelte-kit",
          ].includes(entry.name)
        ) {
          await loadProjectFiles(rootPath, entry.path, depth + 1, accumulated);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load files:", e);
  }

  return accumulated;
}

export function ChatInput({
  onSend,
  onStop,
  disabled = false,
  loading = false,
  placeholder = "Message Claude... (@ to attach files)",
  initialValue = "",
  projectPath,
  queuedCount = 0,
  activeSkills = [],
  onDraftChange,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  // File picker state
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [filePickerIndex, setFilePickerIndex] = useState(0);
  const [availableFiles, setAvailableFiles] = useState<FileEntry[]>(() => {
    // Initialize from cache if available
    if (projectPath && fileCache.has(projectPath)) {
      return fileCache.get(projectPath)!;
    }
    return [];
  });

  // Load files on first @ trigger (lazy loading via callback, not render)
  const loadFilesIfNeeded = useCallback(() => {
    if (!projectPath || fileCache.has(projectPath) || loadingProjects.has(projectPath)) {
      // Already loaded or loading
      if (projectPath && fileCache.has(projectPath) && availableFiles.length === 0) {
        setAvailableFiles(fileCache.get(projectPath)!);
      }
      return;
    }

    loadingProjects.add(projectPath);
    loadProjectFiles(projectPath).then((files) => {
      fileCache.set(projectPath, files);
      loadingProjects.delete(projectPath);
      setAvailableFiles(files);
    });
  }, [projectPath, availableFiles.length]);

  // Filter files based on query
  const filteredFiles = filePickerQuery
    ? availableFiles
        .filter(
          (f) =>
            f.name.toLowerCase().includes(filePickerQuery.toLowerCase()) ||
            f.path.toLowerCase().includes(filePickerQuery.toLowerCase())
        )
        .slice(0, 10)
    : availableFiles.slice(0, 10);

  // Auto-resize textarea (called from handleInput, no useEffect)
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if ((trimmed || attachedFiles.length > 0) && !disabled && !loading) {
      onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
      setValue("");
      setAttachedFiles([]);
      onDraftChange?.("");
      // Reset textarea height
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      });
    }
  }, [value, attachedFiles, disabled, loading, onSend, onDraftChange]);

  const removeAttachedFile = useCallback((path: string) => {
    setAttachedFiles((files) => files.filter((f) => f.path !== path));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // File picker navigation
      if (showFilePicker) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFilePickerIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFilePickerIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && filteredFiles.length > 0) {
          e.preventDefault();
          selectFile(filteredFiles[filePickerIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeFilePicker();
        } else if (e.key === "Tab" && filteredFiles.length > 0) {
          e.preventDefault();
          selectFile(filteredFiles[filePickerIndex]);
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showFilePicker, filteredFiles, filePickerIndex, handleSubmit]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onDraftChange?.(newValue);

    // Auto-resize textarea
    requestAnimationFrame(resizeTextarea);

    // Check for @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setFilePickerQuery(atMatch[1]);
      setFilePickerIndex(0);
      setShowFilePicker(true);
      // Load files when @ picker opens
      loadFilesIfNeeded();
    } else {
      setShowFilePicker(false);
      setFilePickerQuery("");
    }
  }, [onDraftChange, resizeTextarea, loadFilesIfNeeded]);

  const selectFile = (file: FileEntry) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1) {
      const relativePath = file.path.replace(projectPath || "", "").replace(/^\//, "");
      const newValue =
        textBeforeCursor.slice(0, atIndex) + `@${relativePath}` + textAfterCursor + " ";
      setValue(newValue);
      onDraftChange?.(newValue);
    }

    closeFilePicker();

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const closeFilePicker = () => {
    setShowFilePicker(false);
    setFilePickerQuery("");
    setFilePickerIndex(0);
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (
      e.dataTransfer?.types.includes("Files") ||
      e.dataTransfer?.types.includes("text/plain")
    ) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    dragCounter.current = 0;

    const filePath = e.dataTransfer?.getData("application/x-file-path");
    if (filePath) {
      const fileName = filePath.split("/").pop() || filePath;
      setAttachedFiles((files) => [
        ...files,
        { path: filePath, name: fileName, type: "file" },
      ]);
      return;
    }

    // Upload files
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && projectPath) {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetDir", projectPath);

        try {
          const res = await fetch("http://localhost:3001/api/fs/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            setAttachedFiles((files) => [
              ...files,
              { path: data.path, name: data.name, type: "file" },
            ]);
          }
        } catch (err) {
          console.error("Failed to upload file:", err);
        }
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !projectPath) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const ext = item.type.split("/")[1] || "png";
        const timestamp = Date.now();
        const fileName = `pasted-image-${timestamp}.${ext}`;

        const formData = new FormData();
        formData.append("file", blob, fileName);
        formData.append("targetDir", `${projectPath}/.claude/pasted_images`);

        try {
          const res = await fetch("http://localhost:3001/api/fs/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            setAttachedFiles((files) => [
              ...files,
              { path: data.path, name: data.name, type: "image" },
            ]);
          }
        } catch (err) {
          console.error("Failed to upload pasted image:", err);
        }
      }
    }
  };

  const effectivePlaceholder = loading
    ? queuedCount > 0
      ? `${queuedCount} message${queuedCount > 1 ? "s" : ""} queued...`
      : "Type to queue message..."
    : disabled
      ? "Connecting to server..."
      : placeholder;

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="max-w-3xl mx-auto">
        <div
          className={`relative bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border transition-all ${
            isDraggingOver
              ? "border-blue-400 bg-blue-50/30"
              : "border-gray-200 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-gray-300"
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 rounded-xl z-10 pointer-events-none">
              <div className="flex items-center gap-2 text-blue-600">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <span className="text-sm font-medium">Drop files to attach</span>
              </div>
            </div>
          )}

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
              {attachedFiles.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-700"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d={
                        file.type === "image"
                          ? "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          : "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      }
                    />
                  </svg>
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button
                    onClick={() => removeAttachedFile(file.path)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Remove file"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* File picker */}
          {showFilePicker && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
              <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium">
                Files in project
              </div>
              {filteredFiles.map((file, i) => (
                <button
                  key={file.path}
                  onClick={() => selectFile(file)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                    i === filePickerIndex ? "bg-blue-50" : ""
                  }`}
                >
                  <svg
                    className="w-4 h-4 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate">{file.name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {file.path.replace(projectPath || "", "")}
                    </div>
                  </div>
                </button>
              ))}
              {filteredFiles.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  {availableFiles.length === 0 ? "Loading files..." : "No matching files"}
                </div>
              )}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={effectivePlaceholder}
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent text-gray-900 placeholder-gray-400 border-none rounded-xl pl-4 pr-20 py-3.5 focus:outline-none focus:ring-0 resize-none max-h-48 min-h-[56px] text-[15px] disabled:opacity-50"
          />

          {/* Action buttons */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {loading ? (
              <>
                {queuedCount > 0 && (
                  <span className="text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg font-medium">
                    {queuedCount} queued
                  </span>
                )}
                <button
                  onClick={onStop}
                  className="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-all"
                  title="Stop generation"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={disabled || (!value.trim() && attachedFiles.length === 0)}
                className="p-1.5 text-gray-400 bg-transparent rounded-lg hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Send message"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Active skills */}
          {activeSkills.length > 0 && (
            <div className="absolute -bottom-6 left-3 flex items-center gap-1">
              {activeSkills.slice(0, 3).map((skill) => (
                <span
                  key={skill.path}
                  className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium"
                >
                  {skill.name}
                </span>
              ))}
              {activeSkills.length > 3 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                  +{activeSkills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-gray-400 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
