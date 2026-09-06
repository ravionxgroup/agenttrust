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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search agent ID"
            className="focus-ring h-10 w-full rounded-md border border-line bg-[#0b1424] pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
          />
        </label>
      </div>

      <div className="ui-card overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="ui-table-header">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Runs Observed</th>
              <th className="px-4 py-3">Tool Calls</th>
              <th className="px-4 py-3">Allowed</th>
              <th className="px-4 py-3">Denied</th>
              <th className="px-4 py-3">Execution Errors</th>
              <th className="px-4 py-3">Tools Used</th>
              <th className="px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredAgents.map((agent) => (
              <tr key={agent.agentId} className="transition hover:bg-white/[0.04]">
                <td className="max-w-56 px-4 py-3 font-medium">
                  <Link href={`/agents/${encodeURIComponent(agent.agentId)}`} className="ui-clickable-id block truncate text-slate-100">
                    {agent.agentId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-300">{agent.runsObserved}</td>
                <td className="px-4 py-3 text-slate-300">{agent.toolCalls}</td>
                <td className="px-4 py-3 text-emerald-200">{agent.allowedCalls}</td>
                <td className="px-4 py-3 text-rose-200">{agent.deniedCalls}</td>
                <td className="px-4 py-3 text-amber-200">{agent.executionErrors}</td>
                <td className="px-4 py-3 text-slate-300">{agent.distinctTools}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatTimestamp(agent.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAgents.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">No observed agents match the current search.</div>
        ) : null}
      </div>
    </section>
  );
}
