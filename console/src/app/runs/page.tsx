import { Info, ListTree } from "lucide-react";
import { getConsoleDataProvider } from "../../lib/providers";
import { SourceIndicator } from "../../components/metrics/source-indicator";
import { RunsTable } from "../../components/tables/runs-table";
import { SectionCard } from "../../components/layout/section-card";

export default async function RunsPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Runs</h2>
          <p className="ui-muted mt-1">Observed agent runs reconstructed from AgentTrust audit events.</p>
        </div>
        <SourceIndicator source={snapshot.source} />
      </div>

      <SectionCard className="mb-4 flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
        <p className="ui-muted">Run timing reflects the first and last audited tool events; AgentTrust does not currently emit explicit run lifecycle events.</p>
      </SectionCard>

      {snapshot.runs.length > 0 ? (
        <RunsTable runs={snapshot.runs} />
      ) : (
        <SectionCard className="p-8 text-center">
          <ListTree className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
          <h3 className="ui-section-title mt-3">No Observed Runs</h3>
          <p className="ui-muted mt-2">No audited tool activity is available from this data source.</p>
        </SectionCard>
      )}
    </div>
  );
}
