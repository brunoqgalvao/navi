interface WebSearchPreviewProps {
  query: string;
  results: string;
}

export function WebSearchPreview({ query, results }: WebSearchPreviewProps) {
  return (
    <div className="p-3">
      {/* Query */}
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-4 w-4 text-pink-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="font-medium text-zinc-200">{query}</span>
      </div>

      {/* Results */}
      <div className="rounded bg-zinc-900 p-3">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">
          {results.slice(0, 2000)}
          {results.length > 2000 && (
            <span className="text-zinc-500">
              {"\n"}... ({results.length - 2000} more characters)
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}
