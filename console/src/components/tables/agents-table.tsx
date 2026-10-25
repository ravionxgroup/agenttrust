"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AgentSummary } from "../../lib/domain";
import { formatTimestamp } from "../../lib/format";
import { TechId } from "../badges/tech-id";

export function AgentsTable({ agents }: { agents: AgentSummary[] }) {
  const [search, setSearch] = useState("");
  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return agents;
    }
    return agents.filter((agent) => agent.agentId.toLowerCase().includes(query));
  }, [agents, search]);

  return (
    <section>
      <div className="ui-card mb-4 p-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Search agents</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search agent ID"
            className="ui-control pl-9"
          />
        </label>
      </div>

      <div className="ui-card ui-table-scroll" role="region" aria-label="Observed agents" tabIndex={0}>
        <table className="ui-table min-w-[920px]">
          <thead className="ui-table-header">
            <tr>
              <th scope="col" className="px-4 py-3">Agent</th>
              <th scope="col" className="ui-numeric px-4 py-3">Runs Observed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Tool Calls</th>
              <th scope="col" className="ui-numeric px-4 py-3">Allowed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Denied</th>
              <th scope="col" className="ui-numeric px-4 py-3">Execution Errors</th>
              <th scope="col" className="ui-numeric px-4 py-3">Tools Used</th>
              <th scope="col" className="px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredAgents.map((agent) => (
              <tr key={agent.agentId} className="transition hover:bg-hover">
                <td className="max-w-56 px-4 py-3 font-medium">
                  <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="ui-clickable-id block truncate text-foreground">
                    {agent.agentId}
                  </Link>
                </td>
                <td className="ui-numeric px-4 py-3 text-muted">{agent.runsObserved}</td>
                <td className="ui-numeric px-4 py-3 text-muted">{agent.toolCalls}</td>
                <td className="ui-numeric px-4 py-3 text-success">{agent.allowedCalls}</td>
                <td className="ui-numeric px-4 py-3 text-denied">{agent.deniedCalls}</td>
                <td className="ui-numeric px-4 py-3 text-failed">{agent.executionErrors}</td>
                <td className="ui-numeric px-4 py-3 text-muted">{agent.distinctTools}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatTimestamp(agent.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAgents.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">No observed agents match the current search.</div>
        ) : null}
      </div>
    </section>
  );
}
