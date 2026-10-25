import { Database, FileText, FlaskConical } from "lucide-react";
import type { DataSourceInfo, PolicySourceInfo } from "../../lib/domain";

export function SourceIndicator({ source }: { source: DataSourceInfo }) {
  const Icon = source.kind !== "fixtures" ? Database : FlaskConical;
  return (
    <div className="ui-source-indicator">
      <Icon className={`h-4 w-4 shrink-0 ${source.status && source.status !== "ready" ? "text-muted" : "text-accent"}`} aria-hidden="true" />
      <span>{source.label}</span>
      {source.status && source.status !== "ready" ? <span className="text-denied">{source.status.toUpperCase()} · {source.code}</span> : null}
      {source.warningCount ? <span className="text-failed">{source.warningCount} skipped lines</span> : null}
    </div>
  );
}

export function PolicySourceIndicator({ source }: { source: PolicySourceInfo }) {
  return <div className="ui-source-indicator">
    <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    <span>{source.label}</span>
    {source.warningCount ? <span className="text-failed">{source.warningCount} warning</span> : null}
  </div>;
}
