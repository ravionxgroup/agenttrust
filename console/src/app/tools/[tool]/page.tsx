import { SourceFailure } from "../../../components/tables/gateway-audit";
import Link from "next/link";
import { AlertTriangle, Bot, CircleSlash, Hammer, ListChecks, TerminalSquare } from "lucide-react";
import { getConsoleDataProvider } from "../../../lib/providers";
import { formatTimestamp, truncateId } from "../../../lib/format";
import { MetricCard } from "../../../components/metrics/metric-card";
import { SourceIndicator } from "../../../components/metrics/source-indicator";
import { RecentEventsTable } from "../../../components/tables/recent-events-table";
import { SectionCard } from "../../../components/layout/section-card";
import { TechId } from "../../../components/badges/tech-id";

export default async function ToolDetailPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: toolParam } = await params;
  const decodedToolName = decodeURIComponent(toolParam);
  const provider = await getConsoleDataProvider();
  const tool = await provider.getTool(decodedToolName);
  const source = provider.getSourceInfo();
  if (source.status && source.status !== "ready") return <div className="p-6"><SourceFailure source={source} /></div>;

  if (!tool) {
    return (
      <div className="px-6 py-6 lg:px-8">
        <div className="ui-page-header">
          <div>
            <h2 className="ui-page-title">Tool Not Observed</h2>
            <p className="ui-muted mt-1">No audited AgentTrust activity was found for this tool.</p>
          </div>
          <SourceIndicator source={source} />
        </div>
        <SectionCard className="p-8">
          <TechId className="text-foreground">{decodedToolName}</TechId>
          <p className="ui-muted mt-3">Tools are derived from audit events, not a registry.</p>
          <Link href="/tools" className="ui-button ui-button-secondary mt-5">
            Back to tools
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="ui-page-header">
        <div>
          <h2 className="ui-page-title">Tool</h2>
          <div className="mt-2"><TechId className="text-base text-accent">{tool.tool}</TechId></div>
          <p className="ui-muted mt-2">Observed tool usage reconstructed from AgentTrust audit events.</p>
        </div>
        <SourceIndicator source={source} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Tool Calls" value={tool.calls} icon={TerminalSquare} tone="slate" />
        <MetricCard label="Agents Observed" value={tool.agentsObserved} icon={Bot} />
        <MetricCard label="Runs Observed" value={tool.runsObserved} icon={ListChecks} tone="slate" />
        <MetricCard label="Allowed" value={tool.allowedCalls} icon={ListChecks} />
        <MetricCard label="Denied" value={tool.deniedCalls} icon={CircleSlash} tone="rose" />
        <MetricCard label="Execution Errors" value={tool.executionErrors} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="mt-6 space-y-6">
        <section>
          <h3 className="ui-section-title mb-3">Observed Required Scopes</h3>
          <SectionCard className="overflow-hidden">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="ui-table-header">
                <tr>
                  <th className="px-4 py-3">Required Scope</th>
                  <th className="px-4 py-3">Tool Calls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tool.requiredScopes.map((scope) => (
                  <tr key={scope.requiredScope} className="hover:bg-hover">
                    <td className="px-4 py-3"><TechId className="text-accent">{scope.requiredScope}</TechId></td>
                    <td className="px-4 py-3 text-muted">{scope.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </section>

        <section>
          <h3 className="ui-section-title mb-3">Agents Using This Tool</h3>
          <SectionCard className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="ui-table-header">
                <tr>
                  <th className="px-4 py-3">Agent ID</th>
                  <th className="px-4 py-3">Calls</th>
                  <th className="px-4 py-3">Allowed</th>
                  <th className="px-4 py-3">Denied</th>
                  <th className="px-4 py-3">Errors</th>
                  <th className="px-4 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tool.agents.map((agent) => (
                  <tr key={agent.agentId} className="hover:bg-hover">
                    <td className="max-w-56 px-4 py-3">
                      <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="ui-clickable-id block truncate text-foreground" title={agent.agentId}>
                        {agent.agentId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{agent.calls}</td>
                    <td className="px-4 py-3 text-success">{agent.allowedCalls}</td>
                    <td className="px-4 py-3 text-denied">{agent.deniedCalls}</td>
                    <td className="px-4 py-3 text-failed">{agent.executionErrors}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatTimestamp(agent.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </section>

        <section>
          <h3 className="ui-section-title mb-3">Recent Runs</h3>
          <SectionCard className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="ui-table-header">
                <tr>
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Tool Calls</th>
                  <th className="px-4 py-3">Denied</th>
                  <th className="px-4 py-3">Execution Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tool.recentRuns.map((run) => (
                  <tr key={run.runId} className="hover:bg-hover">
                    <td className="max-w-56 px-4 py-3">
                      <Link href={`/runs/${encodeURIComponent(run.runId)}`} className="ui-clickable-id block truncate" title={run.runId}>
                        {truncateId(run.runId, 18)}
                      </Link>
                    </td>
                    <td className="max-w-52 px-4 py-3">
                      <Link href={`/agents/${encodeURIComponent(run.agentId)}`} className="ui-clickable-id block truncate text-foreground" title={run.agentId}>
                        {run.agentId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{run.toolCalls}</td>
                    <td className="px-4 py-3 text-denied">{run.deniedCalls}</td>
                    <td className="px-4 py-3 text-failed">{run.executionErrors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </section>

        <section>
          <h3 className="ui-section-title mb-3">Recent Authorization Activity</h3>
          <RecentEventsTable events={tool.recentEvents} />
        </section>
      </div>
    </div>
  );
}
