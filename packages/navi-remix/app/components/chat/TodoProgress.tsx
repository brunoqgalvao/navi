import type { Todo } from "~/lib/types";

interface TodoProgressProps {
  todos: Todo[];
  showWhenEmpty?: boolean;
}

export function TodoProgress({ todos, showWhenEmpty = false }: TodoProgressProps) {
  if (todos.length === 0 && !showWhenEmpty) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress");
  const pending = todos.filter((t) => t.status === "pending").length;
  const total = todos.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <span className="text-xs font-medium text-gray-700">
            Tasks ({completed}/{total})
          </span>
        </div>
        <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current task */}
      {inProgress.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{inProgress[0].content}</span>
        </div>
      )}

      {/* Pending count */}
      {pending > 0 && inProgress.length === 0 && (
        <div className="text-xs text-gray-500">
          {pending} task{pending !== 1 ? "s" : ""} remaining
        </div>
      )}
    </div>
  );
}
