import { GatewayExplorer, type SearchParams } from "../../components/tables/gateway-audit";
import { getConsoleDataProvider } from "../../lib/providers";
import { SourceIndicator } from "../../components/metrics/source-indicator";
import { AuditExplorer } from "../../components/tables/audit-explorer";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();
  if (snapshot.gateway) return <GatewayExplorer snapshot={snapshot.gateway} source={snapshot.source} params={await searchParams} />;

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="ui-page-header">
        <div>
          <h1 className="ui-page-title">Audit Explorer</h1>
          <p className="ui-muted mt-1">Read-only AgentTrust audit events, newest first.</p>
        </div>
        <SourceIndicator source={snapshot.source} />
      </div>
      <AuditExplorer events={snapshot.events} />
    </div>
  );
}
