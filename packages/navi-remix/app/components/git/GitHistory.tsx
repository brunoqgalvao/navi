import { useGitStore } from "~/stores/gitStore";
import { RelativeTime } from "~/components/ui/RelativeTime";

export function GitHistory() {
  const commits = useGitStore((state) => state.commits);

  if (commits.length === 0) {
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm text-zinc-400">No commits yet</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="space-y-2">
        {commits.map((commit) => (
          <div
            key={commit.sha}
            className="rounded border border-zinc-700 bg-zinc-800/50 p-3"
          >
            <div className="flex items-start gap-3">
              {/* Commit dot */}
              <div className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-blue-500" />

              <div className="min-w-0 flex-1">
                {/* Message */}
                <p className="text-sm text-zinc-200 line-clamp-2">
                  {commit.message}
                </p>

                {/* Meta */}
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono text-blue-400">
                    {commit.shortSha}
                  </span>
                  <span>·</span>
                  <span>{commit.author}</span>
                  <span>·</span>
                  <RelativeTime timestamp={commit.timestamp} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
