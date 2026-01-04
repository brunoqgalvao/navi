interface Todo {
  content: string;
  status: string;
}

interface TodoPreviewProps {
  todos: Todo[];
}

const statusStyles = {
  pending: {
    bg: "bg-zinc-700",
    border: "border-zinc-600",
    text: "text-zinc-300",
    icon: null,
  },
  in_progress: {
    bg: "bg-blue-900/30",
    border: "border-blue-700",
    text: "text-blue-300",
    icon: (
      <svg
        className="h-4 w-4 animate-spin text-blue-400"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    ),
  },
  completed: {
    bg: "bg-emerald-900/30",
    border: "border-emerald-700",
    text: "text-emerald-300",
    icon: (
      <svg
        className="h-4 w-4 text-emerald-400"
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
    ),
  },
};

export function TodoPreview({ todos }: TodoPreviewProps) {
  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="p-3">
      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-zinc-400">Progress</span>
          <span className="text-zinc-300">
            {completed} / {total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-700">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Todo list */}
      <div className="space-y-1.5">
        {todos.map((todo, index) => {
          const style =
            statusStyles[todo.status as keyof typeof statusStyles] ||
            statusStyles.pending;

          return (
            <div
              key={index}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 ${style.bg} ${style.border}`}
            >
              <div className="flex h-5 w-5 items-center justify-center">
                {style.icon || (
                  <div className="h-3 w-3 rounded-full border-2 border-zinc-500" />
                )}
              </div>
              <span className={`flex-1 text-sm ${style.text}`}>
                {todo.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
