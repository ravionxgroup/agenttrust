import { Hammer, Info } from "lucide-react";
import { getConsoleDataProvider } from "../../lib/providers";
import { SourceIndicator } from "../../components/metrics/source-indicator";
import { ToolsTable } from "../../components/tables/tools-table";
import { SectionCard } from "../../components/layout/section-card";

export default async function ToolsPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Tools</h2>
          <p className="ui-muted mt-1">Observed tool activity derived from AgentTrust audit events.</p>
        </div>
        <SourceIndicator source={snapshot.source} />
      </div>

      <SectionCard className="mb-4 flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
        <p className="ui-muted">Tools appear after they are referenced by audited AgentTrust calls.</p>
      </SectionCard>

      {snapshot.tools.length > 0 ? (
        <ToolsTable tools={snapshot.tools} />
      ) : (
        <SectionCard className="p-8 text-center">
          <Hammer className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
          <h3 className="ui-section-title mt-3">No Observed Tools</h3>
          <p className="ui-muted mt-2">No audited tool activity is available from this data source.</p>
        </SectionCard>
      )}
    </div>
  );
}
