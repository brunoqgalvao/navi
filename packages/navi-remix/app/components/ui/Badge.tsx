import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-zinc-700 text-zinc-200",
  success: "bg-emerald-900/50 text-emerald-400 border border-emerald-700",
  warning: "bg-amber-900/50 text-amber-400 border border-amber-700",
  error: "bg-red-900/50 text-red-400 border border-red-700",
  info: "bg-blue-900/50 text-blue-400 border border-blue-700",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
