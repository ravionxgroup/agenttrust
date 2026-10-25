"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { RunSummary } from "../../lib/domain";
import { formatObservedWindow, formatTimestamp } from "../../lib/format";
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search run ID or agent ID"
            className="ui-control pl-9"
          />
        </label>
      </div>

      <div className="ui-card ui-table-scroll" role="region" aria-label="Observed runs" tabIndex={0}>
        <table className="ui-table min-w-[980px]">
          <thead className="ui-table-header">
            <tr>
              <th scope="col" className="px-4 py-3">Run</th>
              <th scope="col" className="px-4 py-3">Agent</th>
              <th scope="col" className="px-4 py-3">First Observed</th>
              <th scope="col" className="px-4 py-3">Last Observed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Observed Window</th>
              <th scope="col" className="ui-numeric px-4 py-3">Tool Calls</th>
              <th scope="col" className="ui-numeric px-4 py-3">Allowed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Denied</th>
              <th scope="col" className="ui-numeric px-4 py-3">Execution Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredRuns.map((run) => (
              <tr key={run.runId} className="transition hover:bg-hover">
                <td className="max-w-52 px-4 py-3">
                  <Link href={`/runs/${encodeURIComponent(run.runId)}`} className="font-mono ui-clickable-id block truncate">
                    {run.runId}
                  </Link>
                </td>
                <td className="max-w-48 px-4 py-3 font-medium">
                  <Link href={`/agents/${encodeURIComponent(run.agentId)}`} className="ui-clickable-id block truncate text-foreground">
                    {run.agentId}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatTimestamp(run.firstObservedAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatTimestamp(run.lastObservedAt)}</td>
                <td className="ui-numeric px-4 py-3 text-muted">{formatObservedWindow(run.observedWindowSeconds)}</td>
                <td className="ui-numeric px-4 py-3 text-muted">{run.toolCalls}</td>
                <td className="ui-numeric px-4 py-3 text-success">{run.allowedCalls}</td>
                <td className="ui-numeric px-4 py-3 text-denied">{run.deniedCalls}</td>
                <td className="ui-numeric px-4 py-3 text-failed">{run.executionErrors}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRuns.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">No observed runs match the current search.</div>
        ) : null}
      </div>
    </section>
  );
}
