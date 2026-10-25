import type { ReactNode } from "react";

export type BadgeTone = "success" | "denied" | "failed" | "unknown" | "incomplete" | "conflict" | "neutral";
const tones: Record<BadgeTone, string> = {
  success: "border-success/25 bg-success/10 text-success",
  denied: "border-denied/25 bg-denied/10 text-denied",
  failed: "border-failed/25 bg-failed/10 text-failed",
  unknown: "border-unknown/25 bg-unknown/10 text-unknown",
  incomplete: "border-incomplete/25 bg-incomplete/10 text-incomplete",
  conflict: "border-conflict/25 bg-conflict/10 text-conflict",
  neutral: "border-muted/25 bg-muted/10 text-muted",
};

/** Presentation only: callers retain their authorization/execution semantics. */
export function StatusBadge({ tone, children, className = "" }: { tone: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`ui-badge ${tones[tone]} ${className}`}>{children}</span>;
}
