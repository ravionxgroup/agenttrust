import { getConsoleDataProvider } from "../../lib/providers";
import { SourceIndicator } from "../../components/metrics/source-indicator";
import { AuditExplorer } from "../../components/tables/audit-explorer";

export default async function AuditPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Audit Explorer</h2>
          <p className="ui-muted mt-1">Read-only AgentTrust audit events, newest first.</p>
        </div>
        <SourceIndicator source={snapshot.source} />
      </div>
      <AuditExplorer events={snapshot.events} />
    </div>
  );
}
