"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ToolSummary } from "../../lib/domain";
import { formatTimestamp } from "../../lib/format";
import { TechId } from "../badges/tech-id";

export function ToolsTable({ tools }: { tools: ToolSummary[] }) {
  const [search, setSearch] = useState("");
  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return tools;
    }
    return tools.filter((tool) =>
      `${tool.tool} ${tool.requiredScopes.map((scope) => scope.requiredScope).join(" ")}`.toLowerCase().includes(query),
    );
  }, [tools, search]);

  return (
    <section>
      <div className="ui-card mb-4 p-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Search tools</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tool or scope"
            className="focus-ring h-10 w-full rounded-md border border-line bg-[#0b1424] pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
          />
        </label>
      </div>

      <div className="ui-card overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="ui-table-header">
            <tr>
              <th className="px-4 py-3">Tool</th>
              <th className="px-4 py-3">Required Scope</th>
              <th className="px-4 py-3">Agents Observed</th>
              <th className="px-4 py-3">Runs Observed</th>
              <th className="px-4 py-3">Tool Calls</th>
              <th className="px-4 py-3">Allowed</th>
              <th className="px-4 py-3">Denied</th>
              <th className="px-4 py-3">Execution Errors</th>
              <th className="px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredTools.map((tool) => (
              <tr key={tool.tool} className="transition hover:bg-white/[0.04]">
                <td className="max-w-56 px-4 py-3">
                  <Link href={`/tools/${encodeURIComponent(tool.tool)}`} className="ui-clickable-id block truncate text-slate-100" title={tool.tool}>
                    {tool.tool}
                  </Link>
                </td>
                <td className="max-w-64 px-4 py-3">
                  <ScopeSummary tool={tool} />
                </td>
                <td className="px-4 py-3 text-slate-300">{tool.agentsObserved}</td>
                <td className="px-4 py-3 text-slate-300">{tool.runsObserved}</td>
                <td className="px-4 py-3 text-slate-300">{tool.calls}</td>
                <td className="px-4 py-3 text-emerald-200">{tool.allowedCalls}</td>
                <td className="px-4 py-3 text-rose-200">{tool.deniedCalls}</td>
                <td className="px-4 py-3 text-amber-200">{tool.executionErrors}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatTimestamp(tool.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTools.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">No observed tools match the current search.</div>
        ) : null}
      </div>
    </section>
  );
}

function ScopeSummary({ tool }: { tool: ToolSummary }) {
  const [first, ...rest] = tool.requiredScopes;
  if (!first) {
    return <span className="text-slate-500">None observed</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <TechId className="text-teal-100">{first.requiredScope}</TechId>
      {rest.length > 0 ? (
        <span className="shrink-0 rounded bg-white/[0.04] px-2 py-1 text-xs font-medium text-slate-400">
          +{rest.length}
        </span>
      ) : null}
    </div>
  );
}
