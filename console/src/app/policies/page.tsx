import Link from "next/link";
import { FileText, Info, ListChecks, Timer, UserRound } from "lucide-react";
import { getConsoleDataProvider } from "../../lib/providers";
import type { PolicySourceInfo } from "../../lib/domain";
import { MetricCard } from "../../components/metrics/metric-card";
import { SectionCard } from "../../components/layout/section-card";
import { TechId } from "../../components/badges/tech-id";

export default async function PoliciesPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();
  const { policy, policySource } = snapshot;
  const observedAgents = new Set(snapshot.agents.map((agent) => agent.agentId));
  const declaredScopes = policy ? new Set(policy.agents.flatMap((agent) => agent.scopes)).size : 0;

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Policies</h2>
          <p className="ui-muted mt-1">Read-only view of AgentTrust agent scope policy.</p>
        </div>
        <PolicySourceIndicator source={policySource} />
      </div>

      <SectionCard className="mb-4 flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
        <p className="ui-muted">
          This is declared configuration. Enforcement remains in the AgentTrust SDK, and agents without a defined policy receive no scopes.
        </p>
      </SectionCard>

      {policy ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Issuer" value={policy.issuer} icon={FileText} tone="slate" />
            <MetricCard label="Default Token TTL" value={`${policy.defaultTtlSeconds}s`} icon={Timer} tone="slate" />
            <MetricCard label="Agents Defined" value={policy.agents.length} icon={UserRound} />
            <MetricCard label="Declared Scopes" value={declaredScopes} icon={ListChecks} tone="slate" />
          </div>

          <section className="mt-6">
            <h3 className="ui-section-title mb-3">Agent Policies</h3>
            <SectionCard className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="ui-table-header">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Declared Scopes</th>
                    <th className="px-4 py-3">Token TTL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {policy.agents.map((agent) => (
                    <tr key={agent.agentId} className="hover:bg-white/[0.03]">
                      <td className="max-w-56 px-4 py-3">
                        {observedAgents.has(agent.agentId) ? (
                          <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="ui-clickable-id block truncate text-slate-100" title={agent.agentId}>
                            {agent.agentId}
                          </Link>
                        ) : (
                          <TechId className="text-slate-300">{agent.agentId}</TechId>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {agent.scopes.map((scope) => (
                            <TechId key={scope} className="rounded border border-teal-400/15 bg-teal-400/10 px-2 py-1 text-teal-100">
                              {scope}
                            </TechId>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {agent.effectiveTtlSeconds}s
                        {agent.explicitTtlSeconds ? <span className="ml-2 text-xs text-slate-500">explicit</span> : <span className="ml-2 text-xs text-slate-500">default</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </section>
        </>
      ) : (
        <SectionCard className="p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
          <h3 className="ui-section-title mt-3">Policy Unavailable</h3>
          <p className="ui-muted mx-auto mt-2 max-w-xl">
            Configure <TechId>AGENTTRUST_POLICY_PATH</TechId> with a readable AgentTrust policy YAML file to inspect declared scopes.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

function PolicySourceIndicator({ source }: { source: PolicySourceInfo }) {
  return (
    <div className="rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-teal-300" aria-hidden="true" />
      {source.label}
      {source.warningCount ? <span className="ml-2 text-amber-200">{source.warningCount} warning</span> : null}
    </div>
  );
}
