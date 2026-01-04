import { FileIcon } from "~/components/ui/FileIcon";

interface EditPreviewProps {
  filePath: string;
  oldString: string;
  newString: string;
}

export function EditPreview({ filePath, oldString, newString }: EditPreviewProps) {
  const filename = filePath.split("/").pop() || filePath;

  return (
    <div className="p-3">
      {/* File info */}
      <div className="mb-3 flex items-center gap-2">
        <FileIcon filename={filename} />
        <span className="font-mono text-sm text-zinc-300">{filePath}</span>
      </div>

      {/* Diff view */}
      <div className="space-y-2">
        {/* Old string */}
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="font-medium text-red-400">- Removed</span>
            <span className="text-zinc-500">
              ({oldString.split("\n").length} lines)
            </span>
          </div>
          <pre className="max-h-32 overflow-auto rounded border border-red-900/50 bg-red-900/20 p-2 text-xs text-red-200">
            <code>{oldString.slice(0, 1000)}</code>
            {oldString.length > 1000 && (
              <span className="text-red-400/50">...</span>
            )}
          </pre>
        </div>

        {/* New string */}
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="font-medium text-emerald-400">+ Added</span>
            <span className="text-zinc-500">
              ({newString.split("\n").length} lines)
            </span>
          </div>
          <pre className="max-h-32 overflow-auto rounded border border-emerald-900/50 bg-emerald-900/20 p-2 text-xs text-emerald-200">
            <code>{newString.slice(0, 1000)}</code>
            {newString.length > 1000 && (
              <span className="text-emerald-400/50">...</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
