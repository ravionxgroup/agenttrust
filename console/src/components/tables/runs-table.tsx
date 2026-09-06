"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { RunSummary } from "../../lib/domain";
import { formatObservedWindow, formatTimestamp, truncateId } from "../../lib/format";
import { TechId } from "../badges/tech-id";

export function RunsTable({ runs }: { runs: RunSummary[] }) {
  const [search, setSearch] = useState("");
  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return runs;
    }
    return runs.filter((run) => `${run.runId} ${run.agentId}`.toLowerCase().includes(query));
  }, [runs, search]);

  return (
    <section>
      <div className="ui-card mb-4 p-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Search runs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search run ID or agent ID"
            className="focus-ring h-10 w-full rounded-md border border-line bg-[#0b1424] pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
          />
        </label>
      </div>

      <div className="ui-card overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="ui-table-header">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">First Observed</th>
              <th className="px-4 py-3">Last Observed</th>
              <th className="px-4 py-3">Observed Window</th>
              <th className="px-4 py-3">Tool Calls</th>
              <th className="px-4 py-3">Allowed</th>
              <th className="px-4 py-3">Denied</th>
              <th className="px-4 py-3">Execution Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredRuns.map((run) => (
              <tr key={run.runId} className="transition hover:bg-white/[0.04]">
                <td className="max-w-52 px-4 py-3">
                  <Link href={`/runs/${encodeURIComponent(run.runId)}`} className="ui-clickable-id block truncate">
                    {truncateId(run.runId, 18)}
                  </Link>
                </td>
                <td className="max-w-48 px-4 py-3 font-medium">
                  <Link href={`/agents/${encodeURIComponent(run.agentId)}`} className="ui-clickable-id block truncate text-slate-100">
                    {run.agentId}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatTimestamp(run.firstObservedAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatTimestamp(run.lastObservedAt)}</td>
                <td className="px-4 py-3 text-slate-300">{formatObservedWindow(run.observedWindowSeconds)}</td>
                <td className="px-4 py-3 text-slate-300">{run.toolCalls}</td>
                <td className="px-4 py-3 text-emerald-200">{run.allowedCalls}</td>
                <td className="px-4 py-3 text-rose-200">{run.deniedCalls}</td>
                <td className="px-4 py-3 text-amber-200">{run.executionErrors}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRuns.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">No observed runs match the current search.</div>
        ) : null}
      </div>
    </section>
  );
}
