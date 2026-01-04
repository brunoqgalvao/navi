interface WorkingIndicatorProps {
  label?: string;
  variant?: "dots" | "spinner" | "pulse";
  size?: "xs" | "sm" | "md" | "lg";
  color?: "gray" | "blue" | "indigo" | "purple" | "green" | "orange" | "red";
}

export function WorkingIndicator({
  label,
  variant = "dots",
  size = "xs",
  color = "gray",
}: WorkingIndicatorProps) {
  const colorClasses: Record<string, string> = {
    gray: "bg-gray-400",
    blue: "bg-blue-500",
    indigo: "bg-indigo-500",
    purple: "bg-purple-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
  };

  const textColorClasses: Record<string, string> = {
    gray: "text-gray-500",
    blue: "text-blue-500",
    indigo: "text-indigo-500",
    purple: "text-purple-500",
    green: "text-green-500",
    orange: "text-orange-500",
    red: "text-red-500",
  };

  const sizeClasses: Record<string, string> = {
    xs: "w-1 h-1",
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  const spinnerSizeClasses: Record<string, string> = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  if (variant === "pulse") {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full animate-pulse`}
        />
        {label && <span className="text-xs text-gray-500">{label}</span>}
      </div>
    );
  }

  if (variant === "spinner") {
    return (
      <div className="flex items-center gap-2">
        <svg
          className={`animate-spin ${spinnerSizeClasses[size]} ${textColorClasses[color]}`}
          viewBox="0 0 24 24"
        >
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
        {label && <span className="text-xs text-gray-500">{label}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full animate-pulse`}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </div>
  );
}
