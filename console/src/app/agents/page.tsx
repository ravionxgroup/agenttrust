import { SourceFailure } from "../../components/tables/gateway-audit";
import { Info, ListChecks } from "lucide-react";
import { getConsoleDataProvider } from "../../lib/providers";
import { SourceIndicator } from "../../components/metrics/source-indicator";
import { AgentsTable } from "../../components/tables/agents-table";
import { SectionCard } from "../../components/layout/section-card";

export default async function AgentsPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();
  if (snapshot.source.status && snapshot.source.status !== "ready") return <div className="p-6"><h1 className="sr-only">Agents</h1><SourceFailure source={snapshot.source} /></div>;

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="ui-page-header">
        <div>
          <h1 className="ui-page-title">Agents</h1>
          <p className="ui-muted mt-1">Observed agents derived from AgentTrust audit activity.</p>
        </div>
        <SourceIndicator source={snapshot.source} />
      </div>

      <SectionCard className="ui-info-panel">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <p className="ui-muted">Agents appear after they generate audited tool activity.</p>
      </SectionCard>

      {snapshot.agents.length > 0 ? (
        <AgentsTable agents={snapshot.agents} />
      ) : (
        <SectionCard className="p-8 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <h2 className="ui-section-title mt-3">No Observed Agents</h2>
          <p className="ui-muted mt-2">No audited tool activity is available from this data source.</p>
        </SectionCard>
      )}
    </div>
  );
}
