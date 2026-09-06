import Link from "next/link";
import { AlertTriangle, CircleSlash, Hammer, ListChecks, TerminalSquare } from "lucide-react";
import { getConsoleDataProvider } from "../../../lib/providers";
import { formatObservedWindow, formatTimestamp, truncateId } from "../../../lib/format";
import { MetricCard } from "../../../components/metrics/metric-card";
import { SourceIndicator } from "../../../components/metrics/source-indicator";
import { RecentEventsTable } from "../../../components/tables/recent-events-table";
import { ToolsSummaryTable } from "../../../components/tables/tools-summary-table";
import { SectionCard } from "../../../components/layout/section-card";
import { TechId } from "../../../components/badges/tech-id";

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const decodedAgentId = decodeURIComponent(agentId);
  const provider = await getConsoleDataProvider();
  const agent = await provider.getAgent(decodedAgentId);
  const policy = await provider.getPolicy();
  const declaredPolicy = policy?.agents.find((item) => item.agentId === decodedAgentId) ?? null;
  const source = provider.getSourceInfo();

  if (!agent) {
    return (
      <div className="px-6 py-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="ui-page-title">Agent Not Observed</h2>
            <p className="ui-muted mt-1">No audited tool activity was found for this agent ID.</p>
          </div>
          <SourceIndicator source={source} />
        </div>
        <SectionCard className="p-8">
          <TechId className="text-slate-200">{decodedAgentId}</TechId>
          <p className="ui-muted mt-3">Agents are derived from audit events, not an agent registry.</p>
          <Link href="/agents" className="mt-5 inline-flex rounded-md border border-line px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
            Back to agents
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Agent</h2>
          <div className="mt-2"><TechId className="text-base text-teal-100">{agent.agentId}</TechId></div>
          <p className="ui-muted mt-2">Observed agent activity reconstructed from AgentTrust audit events.</p>
        </div>
        <SourceIndicator source={source} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Runs Observed" value={agent.runsObserved} icon={ListChecks} tone="slate" />
        <MetricCard label="Tool Calls" value={agent.toolCalls} icon={TerminalSquare} tone="slate" />
        <MetricCard label="Allowed" value={agent.allowedCalls} icon={ListChecks} />
        <MetricCard label="Denied" value={agent.deniedCalls} icon={CircleSlash} tone="rose" />
        <MetricCard label="Execution Errors" value={agent.executionErrors} icon={AlertTriangle} tone="amber" />
        <MetricCard label="Tools Used" value={agent.distinctTools} icon={Hammer} tone="slate" />
      </div>

      <div className="mt-6 space-y-6">
        {declaredPolicy ? (
          <SectionCard className="ui-card-pad">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="ui-section-title">Declared Policy</h3>
                <p className="ui-muted mt-1">Read-only policy declaration for this observed agent.</p>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-slate-500">Effective Token TTL</div>
                <div className="mt-1 text-sm font-semibold text-slate-200">{declaredPolicy.effectiveTtlSeconds}s</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {declaredPolicy.scopes.map((scope) => (
                <TechId key={scope} className="rounded border border-teal-400/15 bg-teal-400/10 px-2 py-1 text-teal-100">
                  {scope}
                </TechId>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <section>
          <h3 className="ui-section-title mb-3">Observed Tools</h3>
          <ToolsSummaryTable tools={agent.observedTools} />
        </section>

        <section>
          <h3 className="ui-section-title mb-3">Recent Runs</h3>
          <div className="ui-card overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="ui-table-header">
                <tr>
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">First Observed</th>
                  <th className="px-4 py-3">Last Observed</th>
                  <th className="px-4 py-3">Observed Window</th>
                  <th className="px-4 py-3">Tool Calls</th>
                  <th className="px-4 py-3">Denied</th>
                  <th className="px-4 py-3">Execution Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {agent.recentRuns.map((run) => (
                  <tr key={run.runId} className="hover:bg-white/[0.03]">
                    <td className="max-w-56 px-4 py-3">
                      <Link href={`/runs/${encodeURIComponent(run.runId)}`} className="ui-clickable-id block truncate" title={run.runId}>
                        {truncateId(run.runId, 18)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatTimestamp(run.firstObservedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatTimestamp(run.lastObservedAt)}</td>
                    <td className="px-4 py-3 text-slate-300">{formatObservedWindow(run.observedWindowSeconds)}</td>
                    <td className="px-4 py-3 text-slate-300">{run.toolCalls}</td>
                    <td className="px-4 py-3 text-rose-200">{run.deniedCalls}</td>
                    <td className="px-4 py-3 text-amber-200">{run.executionErrors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="ui-section-title mb-3">Recent Authorization Activity</h3>
          <div className="overflow-x-auto">
            <RecentEventsTable events={agent.recentEvents} />
          </div>
        </section>
      </div>
    </div>
  );
}
