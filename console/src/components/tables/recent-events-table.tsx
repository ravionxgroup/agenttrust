import Link from "next/link";
import type { AuditEvent } from "../../lib/domain";
import { formatTimestamp, truncateId } from "../../lib/format";
import { DecisionBadge } from "../badges/decision-badge";
import { ResultBadge } from "../badges/result-badge";
import { TechId } from "../badges/tech-id";

export function RecentEventsTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="ui-card overflow-hidden">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="ui-table-header">
          <tr>
            <th className="px-4 py-3 font-medium">Timestamp</th>
            <th className="px-4 py-3 font-medium">Agent</th>
            <th className="px-4 py-3 font-medium">Tool</th>
            <th className="px-4 py-3 font-medium">Required Scope</th>
            <th className="px-4 py-3 font-medium">Decision</th>
            <th className="px-4 py-3 font-medium">Result / Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {events.map((event) => (
            <tr key={event.eventId} className="hover:bg-white/[0.03]">
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatTimestamp(event.ts)}</td>
              <td className="max-w-44 px-4 py-3 font-medium text-slate-100"><span className="block truncate">{event.agentId}</span></td>
              <td className="max-w-44 px-4 py-3">
                <Link href={`/tools/${encodeURIComponent(event.tool)}`} className="ui-clickable-id block truncate text-slate-100" title={event.tool}>
                  {event.tool}
                </Link>
              </td>
              <td className="max-w-48 px-4 py-3"><TechId className="text-teal-100">{event.requiredScope}</TechId></td>
              <td className="px-4 py-3"><DecisionBadge decision={event.decision} /></td>
              <td className="px-4 py-3">
                {event.decision === "deny" ? (
                  <span className="block max-w-56 truncate text-slate-400">{event.reason ?? "Denied before execution"}</span>
                ) : (
                  <ResultBadge decision={event.decision} resultStatus={event.resultStatus} />
                )}
                <div className="mt-1">
                  <Link href={`/runs/${encodeURIComponent(event.runId)}`} className="ui-clickable-id inline-block max-w-44 truncate text-[11px] text-slate-400" title={event.runId}>
                    {truncateId(event.runId, 18)}
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
