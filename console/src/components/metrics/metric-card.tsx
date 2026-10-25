import type { LucideIcon } from "lucide-react";
import { formatNumber } from "../../lib/format";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "teal",
  description,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "teal" | "green" | "rose" | "amber" | "slate";
  description?: string;
}) {
  const toneClass = {
    green: "border-success/15 bg-success/10 text-success",
    teal: "border-accent/20 bg-accent/10 text-accent",
    rose: "border-denied/20 bg-denied/10 text-denied",
    amber: "border-failed/20 bg-failed/10 text-failed",
    slate: "border-muted/20 bg-muted/10 text-foreground",
  }[tone];

  return (
    <section className="ui-card ui-metric-card">
      <div className="flex h-full items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <div className="ui-metric-label">{label}</div>
          <div className="ui-metric-value mt-0.5 break-words" title={String(value)}>
            {typeof value === "number" ? formatNumber(value) : value}
          </div>
          {description && <div className="mt-1 text-[11px] leading-4 text-muted">{description}</div>}
        </div>

      </div>
    </section>
  );
}
