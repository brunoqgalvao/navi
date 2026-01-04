interface WebFetchPreviewProps {
  url: string;
  content: string;
}

export function WebFetchPreview({ url, content }: WebFetchPreviewProps) {
  return (
    <div className="p-3">
      {/* URL */}
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-4 w-4 text-orange-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-sm text-blue-400 hover:underline"
        >
          {url}
        </a>
      </div>

      {/* Content */}
      <div className="rounded bg-zinc-900 p-3">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">
          {content.slice(0, 2000)}
          {content.length > 2000 && (
            <span className="text-zinc-500">
              {"\n"}... ({content.length - 2000} more characters)
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}
