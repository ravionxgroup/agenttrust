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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tool or scope"
            className="ui-control pl-9"
          />
        </label>
      </div>

      <div className="ui-card ui-table-scroll" role="region" aria-label="Observed tools" tabIndex={0}>
        <table className="ui-table min-w-[1040px]">
          <thead className="ui-table-header">
            <tr>
              <th scope="col" className="px-4 py-3">Tool</th>
              <th scope="col" className="px-4 py-3">Required Scope</th>
              <th scope="col" className="ui-numeric px-4 py-3">Agents Observed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Runs Observed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Tool Calls</th>
              <th scope="col" className="ui-numeric px-4 py-3">Allowed</th>
              <th scope="col" className="ui-numeric px-4 py-3">Denied</th>
              <th scope="col" className="ui-numeric px-4 py-3">Execution Errors</th>
              <th scope="col" className="px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredTools.map((tool) => (
              <tr key={tool.tool} className="transition hover:bg-hover">
                <td className="max-w-56 px-4 py-3">
                  <Link href={`/tools/${encodeURIComponent(tool.tool)}`} className="ui-clickable-id block truncate text-foreground" title={tool.tool}>
                    {tool.tool}
                  </Link>
                </td>
                <td className="max-w-64 px-4 py-3">
                  <ScopeSummary tool={tool} />
                </td>
                <td className="ui-numeric px-4 py-3 text-muted">{tool.agentsObserved}</td>
                <td className="ui-numeric px-4 py-3 text-muted">{tool.runsObserved}</td>
                <td className="ui-numeric px-4 py-3 text-muted">{tool.calls}</td>
                <td className="ui-numeric px-4 py-3 text-success">{tool.allowedCalls}</td>
                <td className="ui-numeric px-4 py-3 text-denied">{tool.deniedCalls}</td>
                <td className="ui-numeric px-4 py-3 text-failed">{tool.executionErrors}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatTimestamp(tool.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTools.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">No observed tools match the current search.</div>
        ) : null}
      </div>
    </section>
  );
}

function ScopeSummary({ tool }: { tool: ToolSummary }) {
  const [first, ...rest] = tool.requiredScopes;
  if (!first) {
    return <span className="text-muted">None observed</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <TechId className="text-accent">{first.requiredScope}</TechId>
      {rest.length > 0 ? (
        <Link href={`/tools/${encodeURIComponent(tool.tool)}`} className="ui-scope-more" aria-label={`View all ${tool.requiredScopes.length} observed scopes for ${tool.tool}`}>
          +{rest.length}
        </Link>
      ) : null}
    </div>
  );
}
