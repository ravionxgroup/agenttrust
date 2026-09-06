"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { DecisionBadge } from "../badges/decision-badge";
import { ResultBadge } from "../badges/result-badge";
import { TechId } from "../badges/tech-id";
import type { AuditEvent, Decision } from "../../lib/domain";
import { filterAuditEvents, uniqueObservedAgents } from "../../lib/derive";
import { formatFullTimestamp, formatTimestamp, stringifyJson, truncateId } from "../../lib/format";

export function AuditExplorer({ events }: { events: AuditEvent[] }) {
  const [search, setSearch] = useState("");
  const [agentId, setAgentId] = useState("");
  const [decision, setDecision] = useState<"all" | Decision>("all");
  const [selectedId, setSelectedId] = useState(events[0]?.eventId ?? "");

  const agents = useMemo(() => uniqueObservedAgents(events), [events]);
  const filteredEvents = useMemo(
    () => filterAuditEvents(events, { search, agentId, decision }),
    [events, search, agentId, decision],
  );
  const selectedEvent = useMemo(
    () => filteredEvents.find((event) => event.eventId === selectedId) ?? filteredEvents[0] ?? null,
    [filteredEvents, selectedId],
  );
  const selectEvent = (eventId: string) => {
    setSelectedId(eventId);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        <div className="ui-card mb-4 grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_200px_160px]">
          <label className="relative block">
            <span className="sr-only">Search audit events</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agent, run, tool, scope"
              className="focus-ring h-10 w-full rounded-md border border-line bg-[#0b1424] pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
            />
          </label>
          <label>
            <span className="sr-only">Filter by agent</span>
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="focus-ring h-10 w-full rounded-md border border-line bg-[#0b1424] px-3 text-sm text-white"
            >
              <option value="">All agents</option>
              {agents.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by decision</span>
            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value as "all" | Decision)}
              className="focus-ring h-10 w-full rounded-md border border-line bg-[#0b1424] px-3 text-sm text-white"
            >
              <option value="all">All decisions</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
          </label>
        </div>

        <div className="ui-card overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="ui-table-header">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Tool</th>
                <th className="px-4 py-3 font-medium">Required Scope</th>
                <th className="px-4 py-3 font-medium">Decision</th>
                <th className="px-4 py-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredEvents.map((event) => {
                const selected = selectedEvent?.eventId === event.eventId;
                return (
                  <tr
                    key={event.eventId}
                    onClick={() => selectEvent(event.eventId)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        selectEvent(event.eventId);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={selected}
                    className={`focus-ring cursor-pointer transition hover:bg-white/[0.04] ${selected ? "ui-row-selected" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatTimestamp(event.ts)}</td>
                    <td className="max-w-44 px-4 py-3 font-medium">
                      <Link
                        href={`/agents/${encodeURIComponent(event.agentId)}`}
                        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
                        className="ui-clickable-id block truncate text-slate-100"
                        title={event.agentId}
                      >
                        {event.agentId}
                      </Link>
                    </td>
                    <td className="max-w-44 px-4 py-3">
                      <Link
                        href={`/runs/${encodeURIComponent(event.runId)}`}
                        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
                        className="ui-clickable-id block truncate"
                        title={event.runId}
                      >
                        {truncateId(event.runId, 16)}
                      </Link>
                    </td>
                    <td className="max-w-44 px-4 py-3">
                      <Link
                        href={`/tools/${encodeURIComponent(event.tool)}`}
                        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
                        className="ui-clickable-id block truncate text-slate-100"
                        title={event.tool}
                      >
                        {event.tool}
                      </Link>
                    </td>
                    <td className="max-w-48 px-4 py-3"><TechId className="text-teal-100">{event.requiredScope}</TechId></td>
                    <td className="px-4 py-3"><DecisionBadge decision={event.decision} /></td>
                    <td className="px-4 py-3"><ResultBadge decision={event.decision} resultStatus={event.resultStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredEvents.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">No audit events match the current filters.</div>
          ) : null}
        </div>
      </section>

      <aside className="ui-card min-w-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="ui-section-title">Event Detail</h3>
          {selectedEvent ? (
            <button
              type="button"
              onClick={() => setSelectedId("")}
              className="focus-ring rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
              aria-label="Clear selected audit event"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {selectedEvent ? (
          <div className="space-y-5 p-5">
            <Detail label="Event ID" value={selectedEvent.eventId} mono />
            <Detail label="Timestamp" value={formatFullTimestamp(selectedEvent.ts)} />
            <Detail label="Agent ID" value={selectedEvent.agentId} clickableReady />
            <Detail label="Run ID" value={selectedEvent.runId} mono />
            <Detail label="Token ID" value={truncateId(selectedEvent.tokenId, 18)} mono />
            <Detail label="Tool" value={selectedEvent.tool} />
            <Detail label="Required Scope" value={selectedEvent.requiredScope} mono />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Decision</div>
                <DecisionBadge decision={selectedEvent.decision} />
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Result Status</div>
                <ResultBadge decision={selectedEvent.decision} resultStatus={selectedEvent.resultStatus} />
              </div>
            </div>
            {selectedEvent.reason ? (
              <ReasonDetail value={selectedEvent.reason} prominent={selectedEvent.decision === "deny"} />
            ) : null}
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Redacted Arguments</div>
              <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-[#0b1424] p-3 font-mono text-xs leading-relaxed text-slate-300">
                {stringifyJson(selectedEvent.argsRedacted)}
              </pre>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Arguments are displayed after SDK redaction. Redaction is key-based, so sensitive operational context may still remain.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">Select an audit event to inspect its read-only details.</div>
        )}
      </aside>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
  clickableReady = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  clickableReady?: boolean;
}) {
  const valueClass = mono
    ? "ui-tech-id whitespace-normal break-all text-slate-300"
    : clickableReady
      ? "ui-clickable-id inline-block max-w-full truncate text-sm text-slate-100"
      : "break-words text-sm text-slate-200";

  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={valueClass} title={value}>{value}</div>
    </div>
  );
}

function ReasonDetail({ value, prominent }: { value: string; prominent: boolean }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Reason</div>
      <div
        className={
          prominent
            ? "rounded-md border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm font-medium text-rose-100"
            : "break-words text-sm text-slate-200"
        }
      >
        {value}
      </div>
    </div>
  );
}
