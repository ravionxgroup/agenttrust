import { Database, FlaskConical } from "lucide-react";
import type { DataSourceInfo } from "../../lib/domain";

export function SourceIndicator({ source }: { source: DataSourceInfo }) {
  const Icon = source.kind !== "fixtures" ? Database : FlaskConical;
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
      <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
      <span>{source.label}</span>
      {source.status && source.status !== "ready" ? <span className="text-denied">{source.status.toUpperCase()} · {source.code}</span> : null}
      {source.warningCount ? <span className="text-failed">{source.warningCount} skipped lines</span> : null}
    </div>
  );
}
