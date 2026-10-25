import Link from "next/link";
import { Activity, AlertTriangle, CircleSlash, ListChecks, TerminalSquare } from "lucide-react";
import { MetricCard } from "../metrics/metric-card";
import { SourceIndicator } from "../metrics/source-indicator";
import { SectionCard } from "../layout/section-card";
import { GatewayFilters } from "./gateway-filters";
import type { DataSourceInfo } from "../../lib/domain";
import { filterInvocations, type GatewaySnapshot, type Invocation, type InvocationFilters } from "../../lib/gateway/model";

export type SearchParams = Record<string, string | string[] | undefined>;
function query(params: SearchParams, key: string): string { const value = params[key]; return typeof value === "string" && value.length <= 128 ? value : ""; }
export function pageNumber(value: string | string[] | undefined): number { return typeof value === "string" && /^\d{1,4}$/.test(value) ? Math.max(1, Number(value)) : 1; }
export function EvidenceBadge({ value }: { value: string }) {
  const tone = value === "SUCCEEDED" || value === "ALLOW" ? "bg-emerald-400/10 text-emerald-200" : value === "DENY" ? "bg-rose-400/10 text-rose-200" : value === "FAILED" ? "bg-amber-400/10 text-amber-200" : value === "UNKNOWN" ? "bg-violet-400/10 text-violet-200" : "bg-slate-400/10 text-slate-300";
  return <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${tone}`}>{value.replaceAll("_", " ")}</span>;
}
export function Integrity({ invocation }: { invocation: Invocation }) {
  return <div className="flex flex-wrap gap-1 text-xs">
    {invocation.conflicting && <span className="rounded bg-fuchsia-400/10 px-2 py-1 text-fuchsia-200">Conflicting evidence</span>}
    {invocation.incomplete && <span className="rounded bg-cyan-400/10 px-2 py-1 text-cyan-200">Incomplete</span>}
    {!invocation.conflicting && !invocation.incomplete && <span className="text-slate-400">Complete</span>}
    {invocation.duplicateCount > 0 && <span className="text-amber-200">{invocation.duplicateCount} duplicate copies</span>}
  </div>;
}
export function SourceFailure({ source }: { source: DataSourceInfo }) {
  return <SectionCard className="ui-card-pad"><div role="alert">
    <h3 className="ui-section-title">{source.status === "error" ? "Audit source error" : "Gateway audit unavailable"}</h3>
    <p className="ui-muted mt-3">{source.code}. No invocation counts are available. Demo data has not been substituted.</p>
    <p className="ui-muted mt-2">Check the server-side audit configuration and read permissions, then refresh.</p>
  </div></SectionCard>;
}
export function GatewayOverview({ snapshot, source }: { snapshot: GatewaySnapshot; source: DataSourceInfo }) {
  const m = snapshot.metrics;
  return <div className="px-6 py-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="ui-page-title">Gateway execution overview</h2><p className="ui-muted mt-1">Persisted lifecycle evidence, counted once per invocation.</p></div><SourceIndicator source={source} /></header>
    {source.status !== "ready" ? <SourceFailure source={source} /> : <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Observed invocations" value={m.total} icon={TerminalSquare} />
        <MetricCard label="Allowed invocations" value={m.allowed} icon={ListChecks} />
        <MetricCard label="Denied invocations" value={m.denied} icon={CircleSlash} tone="rose" />
        <MetricCard label="Successful executions" value={m.succeeded} icon={Activity} />
        <MetricCard label="Failed executions" value={m.failed} icon={AlertTriangle} tone="amber" />
        <MetricCard label="Unknown execution outcomes" value={m.unknown} icon={AlertTriangle} tone="slate" />
        <MetricCard label="Incomplete lifecycles" value={m.incomplete} icon={ListChecks} tone="slate" />
        <MetricCard label="Conflicting evidence" value={m.conflicting} icon={AlertTriangle} tone="rose" />
      </div>
      <p className="ui-muted my-5">{snapshot.recordCount} persisted records · {snapshot.duplicateCount} identical duplicate copies. ALLOW is authorization evidence, never execution success.</p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="ui-section-title">Recent invocations</h3><Link href="/audit" className="text-sm text-teal-200">Explore all invocations</Link></div>
      <InvocationTable invocations={snapshot.invocations.slice(0, 20)} />
    </>}
  </div>;
}
export function InvocationTable({ invocations }: { invocations: Invocation[] }) {
  return <div className="ui-card overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="ui-table-header"><tr>
    {["Invocation", "Time (UTC)", "Agent", "Tool", "Authorization", "Execution", "Evidence", "Classification"].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
  </tr></thead><tbody className="divide-y divide-line">{invocations.map(invocation => <tr key={invocation.invocationId} className="hover:bg-white/[0.03]">
    <td className="px-4 py-3"><Link href={`/invocations/${invocation.invocationId}`} className="font-mono text-xs text-teal-200">{invocation.invocationId}</Link></td>
    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{invocation.timestamp}</td>
    <td className="max-w-40 break-words px-4 py-3">{invocation.agentId || "Not established"}</td><td className="max-w-40 break-words px-4 py-3">{invocation.tool || "Unavailable"}</td>
    <td className="px-4 py-3"><EvidenceBadge value={invocation.authorization} />{invocation.authorizationMissing && <span className="mt-1 block text-xs text-slate-400">Evidence missing</span>}</td>
    <td className="px-4 py-3"><EvidenceBadge value={invocation.execution} />{invocation.executionMissing && <span className="mt-1 block text-xs text-slate-400">Execution evidence missing</span>}</td>
    <td className="px-4 py-3"><Integrity invocation={invocation} /></td><td className="px-4 py-3 font-mono text-xs text-slate-400">{invocation.reason}</td>
  </tr>)}</tbody></table>{invocations.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">No observed invocations match this view. An empty readable file is not execution evidence.</p>}</div>;
}
export function GatewayExplorer({ snapshot, source, params }: { snapshot: GatewaySnapshot; source: DataSourceInfo; params: SearchParams }) {
  const filters: InvocationFilters = { agent: query(params, "agent"), tool: query(params, "tool"), authorization: query(params, "authorization"), execution: query(params, "execution"), from: query(params, "from"), to: query(params, "to") };
  const filtered = filterInvocations(snapshot.invocations, filters);
  const page = pageNumber(params.page);
  const pageSize = 100;
  const href = (target: number) => { const search = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value); search.set("page", String(target)); return `/audit?${search}`; };
  return <div className="px-6 py-6 lg:px-8"><header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="ui-page-title">Gateway audit explorer</h2><p className="ui-muted mt-1">One row per invocation; open a row for original event metadata and timeline.</p></div><SourceIndicator source={source} /></header>
    {source.status !== "ready" ? <SourceFailure source={source} /> : <>
      <GatewayFilters key={JSON.stringify([filters, page])} filters={filters}
        agents={[...new Set(snapshot.invocations.map(i => i.agentId).filter(Boolean))].sort()}
        tools={[...new Set(snapshot.invocations.map(i => i.tool).filter(Boolean))].sort()} />
      <p className="ui-muted mb-3">{filtered.length} matching invocations · page {page}. Filters do not change lifecycle correlation.</p>
      <InvocationTable invocations={filtered.slice((page - 1) * pageSize, page * pageSize)} />
      <nav aria-label="Invocation pages" className="mt-4 flex gap-4 text-sm text-teal-200">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}{page * pageSize < filtered.length && <Link href={href(page + 1)}>Next</Link>}</nav>
    </>}
  </div>;
}
export function InvocationDetail({ invocation, page = 1 }: { invocation: Invocation; page?: number }) {
  const events = invocation.events.slice((page - 1) * 100, page * 100);
  return <div className="px-6 py-6 lg:px-8"><Link href="/audit" className="text-sm text-teal-200">Back to invocation list</Link><h2 className="ui-page-title mt-4">Invocation details</h2><p className="my-3 break-all font-mono text-sm text-slate-300">{invocation.invocationId}</p>
    <SectionCard className="ui-card-pad"><div className="flex flex-wrap gap-3"><EvidenceBadge value={invocation.authorization} /><EvidenceBadge value={invocation.execution} /><Integrity invocation={invocation} /></div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><Field label="Agent" value={invocation.agentId || "Not established"} /><Field label="Run" value={invocation.runId || "Not established"} /><Field label="Logical tool" value={invocation.tool || "Unavailable"} /><Field label="Request correlation (not invocation identity)" value={invocation.requestId} /></dl>
      {invocation.authorizationMissing && <p className="mt-4 text-amber-200">Authorization evidence is missing.</p>}{invocation.executionMissing && <p className="mt-4 text-violet-200">Execution evidence is missing. ALLOW cannot establish success.</p>}
      {invocation.missingStages.length > 0 && <p className="mt-4 break-words text-sm text-cyan-200">Missing stages: {invocation.missingStages.join(", ")}</p>}
      {invocation.issues.map(issue => <p key={issue} className="mt-2 text-sm text-fuchsia-200">{issue}</p>)}
    </SectionCard>
    <h3 className="ui-section-title mb-3 mt-6">Persisted event timeline</h3><p className="ui-muted mb-4">Original IDs and timestamps, sorted by event time. Only allow-listed metadata is shown; credentials and payloads are omitted.</p>
    <ol className="space-y-4">{events.map((event, index) => <li key={`${event.event_id}-${index}`} className="ui-card p-4"><div className="flex flex-wrap items-center gap-3"><strong className="text-sm">{event.event_type}</strong><EvidenceBadge value={event.authorization_decision} /><EvidenceBadge value={event.execution_status} /></div><p className="mt-2 break-all font-mono text-xs text-slate-400">{event.timestamp} · event {event.event_id}</p><p className="mt-2 text-sm text-slate-300">Audit classification: {event.reason}</p><details className="mt-3"><summary className="cursor-pointer text-sm text-teal-200">Safe event metadata</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{JSON.stringify(event, null, 2)}</pre></details></li>)}</ol>
    <nav aria-label="Timeline pages" className="mt-4 flex gap-4 text-sm text-teal-200">{page > 1 && <Link href={`?page=${page - 1}`}>Previous events</Link>}{page * 100 < invocation.events.length && <Link href={`?page=${page + 1}`}>Next events</Link>}</nav>
  </div>;
}
function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-all text-slate-200">{value}</dd></div>; }
