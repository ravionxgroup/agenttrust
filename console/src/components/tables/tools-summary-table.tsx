import Link from "next/link";
import type { ObservedToolSummary } from "../../lib/domain";
import { TechId } from "../badges/tech-id";

export function ToolsSummaryTable({ tools }: { tools: ObservedToolSummary[] }) {
  return (
    <div className="ui-card overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="ui-table-header">
          <tr>
            <th className="px-4 py-3">Tool</th>
            <th className="px-4 py-3">Required Scope</th>
            <th className="px-4 py-3">Calls</th>
            <th className="px-4 py-3">Allowed</th>
            <th className="px-4 py-3">Denied</th>
            <th className="px-4 py-3">Execution Errors</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tools.map((tool) => (
            <tr key={`${tool.tool}:${tool.requiredScope}`} className="hover:bg-hover">
              <td className="max-w-56 px-4 py-3">
                <Link href={`/tools/${encodeURIComponent(tool.tool)}`} className="ui-clickable-id block truncate text-foreground" title={tool.tool}>
                  {tool.tool}
                </Link>
              </td>
              <td className="max-w-56 px-4 py-3"><TechId className="text-accent">{tool.requiredScope}</TechId></td>
              <td className="px-4 py-3 text-muted">{tool.calls}</td>
              <td className="px-4 py-3 text-success">{tool.allowedCalls}</td>
              <td className="px-4 py-3 text-denied">{tool.deniedCalls}</td>
              <td className="px-4 py-3 text-failed">{tool.executionErrors}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tools.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted">No observed tools for this agent.</div>
      ) : null}
    </div>
  );
}
