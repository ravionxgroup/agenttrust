import { AlertTriangle, Bot, CircleSlash, ListChecks, TerminalSquare } from "lucide-react";
import { getConsoleDataProvider } from "../lib/providers";
import { MetricCard } from "../components/metrics/metric-card";
import { SourceIndicator } from "../components/metrics/source-indicator";
import { RecentEventsTable } from "../components/tables/recent-events-table";
import { SectionCard } from "../components/layout/section-card";
import { TechId } from "../components/badges/tech-id";

export default async function OverviewPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();
  const { overview, source } = snapshot;
  const totalAuthorizationDecisions = Math.max(
    overview.authorizationSummary.allowed + overview.authorizationSummary.denied,
    1,
  );
  const allowedPct = (overview.authorizationSummary.allowed / totalAuthorizationDecisions) * 100;
  const deniedPct = (overview.authorizationSummary.denied / totalAuthorizationDecisions) * 100;

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Overview</h2>
          <p className="ui-muted mt-1">Observed authorization activity from AgentTrust audit events.</p>
        </div>
        <SourceIndicator source={source} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Agents Observed" value={overview.agentsObserved} icon={Bot} />
        <MetricCard label="Runs Observed" value={overview.runsObserved} icon={ListChecks} tone="slate" />
        <MetricCard label="Tool Calls" value={overview.toolCalls} icon={TerminalSquare} tone="slate" />
        <MetricCard label="Denied Calls" value={overview.deniedCalls} icon={CircleSlash} tone="rose" />
        <MetricCard label="Execution Errors" value={overview.toolErrors} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="ui-section-title">Recent Authorization Activity</h3>
            <a href="/audit" className="rounded-md border border-line px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
              View audit
            </a>
          </div>
          <div className="overflow-x-auto">
            <RecentEventsTable events={overview.recentEvents} />
          </div>
        </section>

        <div className="space-y-6">
          <SectionCard className="ui-card-pad">
            <h3 className="ui-section-title">Most Denied Tools</h3>
            <div className="mt-4 space-y-3">
              {overview.mostDeniedTools.length > 0 ? (
                overview.mostDeniedTools.map((item) => (
                  <div key={item.tool} className="flex items-center justify-between gap-4 rounded-md bg-white/[0.03] px-3 py-3">
                    <TechId className="text-sm text-slate-200">{item.tool}</TechId>
                    <span className="rounded bg-rose-400/10 px-2 py-1 text-sm font-semibold text-rose-200">{item.deniedCalls}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No denied calls observed.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard className="ui-card-pad">
            <h3 className="ui-section-title">Authorization Summary</h3>
            <div className="mt-4 h-3 overflow-hidden rounded bg-slate-800">
              <div className="flex h-full">
                <div className="bg-emerald-400" style={{ width: `${allowedPct}%` }} />
                <div className="bg-rose-400" style={{ width: `${deniedPct}%` }} />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Allowed</dt>
                <dd className="mt-1 font-semibold text-emerald-200">{overview.authorizationSummary.allowed}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Denied</dt>
                <dd className="mt-1 font-semibold text-rose-200">{overview.authorizationSummary.denied}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <dl className="text-sm">
                <div>
                  <dt className="text-slate-500">Execution Errors</dt>
                  <dd className="mt-1 font-semibold text-amber-200">{overview.authorizationSummary.errors}</dd>
                </div>
              </dl>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
