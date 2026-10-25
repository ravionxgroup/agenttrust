import type { AuditEvent } from "../../lib/domain";
import { formatFullTimestamp } from "../../lib/format";
import { DecisionBadge } from "../badges/decision-badge";
import { ResultBadge } from "../badges/result-badge";
import { TechId } from "../badges/tech-id";

export function ExecutionTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="ui-card p-8 text-center text-sm text-muted">
        No audit events were observed for this run.
      </div>
    );
  }

  return (
    <div className="ui-card min-w-0 p-4 sm:p-5">
      <ol className="space-y-5">
        {events.map((event, index) => {
          const denied = event.decision === "deny";
          const errored = event.resultStatus === "error";
          const isLast = index === events.length - 1;

          return (
            <li key={event.eventId} className="relative pl-8">
              <div
                className={[
                  "absolute left-0 top-1 h-3 w-3 rounded-full ring-4",
                  denied ? "bg-denied ring-denied/15" : errored ? "bg-failed ring-failed/15" : event.resultStatus === "ok" ? "bg-success ring-success/15" : "bg-muted ring-muted/15",
                ].join(" ")}
                aria-hidden="true"
              />
              {!isLast ? <div className="absolute bottom-[-1.25rem] left-1.5 top-5 w-px bg-line" aria-hidden="true" /> : null}
              <div className="min-w-0 rounded-lg border border-line bg-raised p-4">
                <div className="ui-timeline-head">
                  <div className="min-w-0">
                    <div className="text-xs leading-5 text-muted tabular-nums">{formatFullTimestamp(event.ts)}</div>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                      <TechId wrap className="text-sm text-foreground">{event.tool}</TechId>
                      <span className="text-muted">/</span>
                      <TechId wrap className="text-accent">{event.requiredScope}</TechId>
                    </div>
                  </div>
                  <div className="ui-timeline-authorization"><div className="ui-field-label mb-1">Authorization</div><DecisionBadge decision={event.decision} /></div>
                  <div className="ui-timeline-execution"><div className="ui-field-label mb-1">Execution</div><ResultBadge decision={event.decision} resultStatus={event.resultStatus} /></div>
                </div>

                {denied ? (
                  <div className="mt-4 rounded-md border border-denied/20 bg-denied/10 px-3 py-2">
                    <div className="break-words text-sm font-medium text-denied">{event.reason ?? "Authorization denied"}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-denied">Tool not executed</div>
                  </div>
                ) : errored ? (
                  <div className="mt-4 rounded-md border border-failed/20 bg-failed/10 px-3 py-2">
                    <div className="text-sm font-medium text-failed">Authorization succeeded; execution returned an error.</div>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
