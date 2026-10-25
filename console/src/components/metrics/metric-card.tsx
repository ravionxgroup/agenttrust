import type { LucideIcon } from "lucide-react";
import { formatNumber } from "../../lib/format";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "teal" | "rose" | "amber" | "slate";
}) {
  const toneClass = {
    teal: "border-accent/20 bg-accent/10 text-accent",
    rose: "border-denied/20 bg-denied/10 text-denied",
    amber: "border-failed/20 bg-failed/10 text-failed",
    slate: "border-muted/20 bg-muted/10 text-foreground",
  }[tone];

  return (
    <section className="ui-card ui-metric-card">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="ui-metric-label">{label}</div>
          <div className="ui-metric-value mt-0.5 break-words" title={String(value)}>
            {typeof value === "number" ? formatNumber(value) : value}
          </div>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${toneClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
