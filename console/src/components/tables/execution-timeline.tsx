import type { AuditEvent } from "../../lib/domain";
import { formatFullTimestamp } from "../../lib/format";
import { DecisionBadge } from "../badges/decision-badge";
import { ResultBadge } from "../badges/result-badge";
import { TechId } from "../badges/tech-id";

export function ExecutionTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="ui-card p-8 text-center text-sm text-slate-500">
        No audit events were observed for this run.
      </div>
    );
  }

  return (
    <div className="ui-card p-5">
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
                  denied ? "bg-rose-300 ring-rose-400/15" : errored ? "bg-amber-300 ring-amber-300/15" : "bg-emerald-300 ring-emerald-400/15",
                ].join(" ")}
                aria-hidden="true"
              />
              {!isLast ? <div className="absolute bottom-[-1.25rem] left-1.5 top-5 w-px bg-line" aria-hidden="true" /> : null}
              <div className="rounded-lg border border-line bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">{formatFullTimestamp(event.ts)}</div>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                      <TechId className="text-sm text-slate-100">{event.tool}</TechId>
                      <span className="text-slate-600">/</span>
                      <TechId className="text-teal-100">{event.requiredScope}</TechId>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <DecisionBadge decision={event.decision} />
                    <ResultBadge decision={event.decision} resultStatus={event.resultStatus} />
                  </div>
                </div>

                {denied ? (
                  <div className="mt-4 rounded-md border border-rose-400/20 bg-rose-400/10 px-3 py-2">
                    <div className="text-sm font-medium text-rose-100">{event.reason ?? "Authorization denied"}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-rose-200">Tool not executed</div>
                  </div>
                ) : errored ? (
                  <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2">
                    <div className="text-sm font-medium text-amber-100">Authorization succeeded; execution returned an error.</div>
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
