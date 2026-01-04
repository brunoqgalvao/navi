interface BashPreviewProps {
  command: string;
  output?: string;
  isError?: boolean;
}

export function BashPreview({ command, output, isError }: BashPreviewProps) {
  return (
    <div className="overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-1.5 bg-zinc-800 px-3 py-2">
        <span className="h-3 w-3 rounded-full bg-red-500" />
        <span className="h-3 w-3 rounded-full bg-yellow-500" />
        <span className="h-3 w-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs text-zinc-400">Terminal</span>
      </div>

      {/* Command */}
      <div className="bg-zinc-900 p-3">
        <div className="flex items-start gap-2">
          <span className="text-emerald-400">$</span>
          <pre className="flex-1 overflow-x-auto font-mono text-sm text-zinc-200">
            {command}
          </pre>
        </div>

        {/* Output */}
        {output && (
          <pre
            className={`mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs ${
              isError ? "text-red-400" : "text-zinc-400"
            }`}
          >
            {output.slice(0, 3000)}
            {output.length > 3000 && (
              <span className="text-zinc-500">
                {"\n"}... ({output.length - 3000} more characters)
              </span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
