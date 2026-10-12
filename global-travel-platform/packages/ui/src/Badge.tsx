import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "demo" | "success" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-line",
  demo: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/40",
  success:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-400/15 dark:text-emerald-200 dark:border-emerald-400/40",
  danger:
    "bg-red-100 text-red-900 border-red-300 dark:bg-red-400/15 dark:text-red-200 dark:border-red-400/40",
  info: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-400/40",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
