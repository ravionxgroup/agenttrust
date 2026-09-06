import type { LucideIcon } from "lucide-react";

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
    teal: "border-teal-400/20 bg-teal-400/10 text-teal-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    slate: "border-slate-400/20 bg-slate-400/10 text-slate-200",
  }[tone];

  return (
    <section className="ui-card ui-card-pad min-h-32">
      <div className="flex h-full items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-400">{label}</div>
          <div className="ui-metric-value mt-2 truncate" title={String(value)}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md border ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
