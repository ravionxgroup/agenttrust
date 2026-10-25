import Link from "next/link";
import type { AuditEvent } from "../../lib/domain";
import { formatTimestamp } from "../../lib/format";
import { DecisionBadge } from "../badges/decision-badge";
import { ResultBadge } from "../badges/result-badge";
import { TechId } from "../badges/tech-id";

export function RecentEventsTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="ui-card ui-table-scroll" role="region" aria-label="Recent authorization activity" tabIndex={0}>
      <table className="ui-table min-w-[760px]">
        <thead className="ui-table-header">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Timestamp</th>
            <th scope="col" className="px-4 py-3 font-medium">Agent</th>
            <th scope="col" className="px-4 py-3 font-medium">Tool</th>
            <th scope="col" className="px-4 py-3 font-medium">Required Scope</th>
            <th scope="col" className="px-4 py-3 font-medium">Decision</th>
            <th scope="col" className="px-4 py-3 font-medium">Result / Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {events.map((event) => (
            <tr key={event.eventId} className="hover:bg-hover">
              <td className="whitespace-nowrap px-4 py-3 text-muted">{formatTimestamp(event.ts)}</td>
              <td className="max-w-44 px-4 py-3 font-medium text-foreground"><span className="block truncate text-xs">{event.agentId}</span></td>
              <td className="max-w-44 px-4 py-3">
                <Link href={`/tools/${encodeURIComponent(event.tool)}`} className="ui-clickable-id block truncate text-foreground" title={event.tool}>
                  {event.tool}
                </Link>
              </td>
              <td className="max-w-48 px-4 py-3"><TechId className="text-accent">{event.requiredScope}</TechId></td>
              <td className="px-4 py-3"><DecisionBadge decision={event.decision} /></td>
              <td className="px-4 py-3">
                {event.decision === "deny" ? (
                  <span className="block max-w-56 truncate text-muted">{event.reason ?? "Denied before execution"}</span>
                ) : (
                  <ResultBadge decision={event.decision} resultStatus={event.resultStatus} />
                )}
                <div className="mt-1">
                  <Link href={`/runs/${encodeURIComponent(event.runId)}`} className="font-mono ui-clickable-id inline-block max-w-44 truncate text-[12px] text-muted" title={event.runId}>
                    {event.runId}
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
