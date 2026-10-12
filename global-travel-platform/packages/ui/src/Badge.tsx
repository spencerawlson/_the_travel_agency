import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "demo" | "success" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-line",
  demo: "bg-amber-100 text-amber-900 border-amber-300",
  success: "bg-emerald-100 text-emerald-900 border-emerald-300",
  danger: "bg-red-100 text-red-900 border-red-300",
  info: "bg-sky-100 text-sky-900 border-sky-300",
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
