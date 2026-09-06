import { Database, FlaskConical } from "lucide-react";
import type { DataSourceInfo } from "../../lib/domain";

export function SourceIndicator({ source }: { source: DataSourceInfo }) {
  const Icon = source.kind === "jsonl" ? Database : FlaskConical;
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-300">
      <Icon className="h-4 w-4 text-teal-200" aria-hidden="true" />
      <span>{source.label}</span>
      {source.warningCount ? <span className="text-amber-200">{source.warningCount} skipped lines</span> : null}
    </div>
  );
}
