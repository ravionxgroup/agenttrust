import { Info, ListChecks } from "lucide-react";
import { getConsoleDataProvider } from "../../lib/providers";
import { SourceIndicator } from "../../components/metrics/source-indicator";
import { AgentsTable } from "../../components/tables/agents-table";
import { SectionCard } from "../../components/layout/section-card";

export default async function AgentsPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Agents</h2>
          <p className="ui-muted mt-1">Observed agents derived from AgentTrust audit activity.</p>
        </div>
        <SourceIndicator source={snapshot.source} />
      </div>

      <SectionCard className="mb-4 flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
        <p className="ui-muted">Agents appear after they generate audited tool activity.</p>
      </SectionCard>

      {snapshot.agents.length > 0 ? (
        <AgentsTable agents={snapshot.agents} />
      ) : (
        <SectionCard className="p-8 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
          <h3 className="ui-section-title mt-3">No Observed Agents</h3>
          <p className="ui-muted mt-2">No audited tool activity is available from this data source.</p>
        </SectionCard>
      )}
    </div>
  );
}
