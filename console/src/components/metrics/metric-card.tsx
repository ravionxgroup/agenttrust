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
    <section className="ui-card ui-card-pad min-h-32">
      <div className="flex h-full items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{label}</div>
          <div className="ui-metric-value mt-2 truncate" title={String(value)}>
            {typeof value === "number" ? formatNumber(value) : value}
          </div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md border ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
