import Link from "next/link";
import { FileText, Info, ListChecks, Timer, UserRound } from "lucide-react";
import { getConsoleDataProvider } from "../../lib/providers";
import { PolicySourceIndicator } from "../../components/metrics/source-indicator";
import { MetricCard } from "../../components/metrics/metric-card";
import { SectionCard } from "../../components/layout/section-card";
import { TechId } from "../../components/badges/tech-id";
import { StateMessage } from "../../components/layout/state-message";

export default async function PoliciesPage() {
  const provider = await getConsoleDataProvider();
  const snapshot = await provider.getSnapshot();
  const { policy, policySource } = snapshot;
  const observedAgents = new Set(snapshot.agents.map((agent) => agent.agentId));
  const declaredScopes = policy ? new Set(policy.agents.flatMap((agent) => agent.scopes)).size : 0;

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="ui-page-header">
        <div>
          <h2 className="ui-page-title">Policies</h2>
          <p className="ui-muted mt-1">Read-only view of AgentTrust agent scope policy.</p>
        </div>
        <PolicySourceIndicator source={policySource} />
      </div>

      <SectionCard className="ui-info-panel">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="ui-muted">
          {snapshot.gateway ? "Gateway policy is not ingested. Authorization decisions shown by the Console come from persisted audit evidence; enforcement remains in the Gateway." : "This is declared local SDK configuration. It is separate from Gateway enforcement."}
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
                    <tr key={agent.agentId} className="hover:bg-hover">
                      <td className="max-w-56 px-4 py-3">
                        {observedAgents.has(agent.agentId) ? (
                          <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="ui-clickable-id block truncate text-foreground" title={agent.agentId}>
                            {agent.agentId}
                          </Link>
                        ) : (
                          <TechId className="text-muted">{agent.agentId}</TechId>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {agent.scopes.map((scope) => (
                            <TechId key={scope} className="rounded border border-accent/15 bg-accent/10 px-2 py-1 text-accent">
                              {scope}
                            </TechId>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {agent.effectiveTtlSeconds}s
                        {agent.explicitTtlSeconds ? <span className="ml-2 text-xs text-muted">explicit</span> : <span className="ml-2 text-xs text-muted">default</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </section>
        </>
      ) : (
        <SectionCard><StateMessage icon={FileText} title="Policy Unavailable">
          <p>
            {snapshot.gateway ? "Gateway mode displays audit evidence only; policy configuration is not loaded by this viewer." : <>Configure <TechId>AGENTTRUST_POLICY_PATH</TechId> with a readable AgentTrust policy YAML file to inspect declared scopes.</>}
          </p>
        </StateMessage></SectionCard>
      )}
    </div>
  );
}
