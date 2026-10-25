import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { OverviewPagination, overviewPage } from "../overview/overview-pagination";
import { OverviewAnalytics } from "../overview/overview-analytics";
import { UtcTimestamp } from "../metadata/utc-timestamp";
import { Activity, AlertTriangle, CircleSlash, Database, ListChecks, SearchX, TerminalSquare } from "lucide-react";
import { MetricCard } from "../metrics/metric-card";
import { SourceIndicator } from "../metrics/source-indicator";
import { SectionCard } from "../layout/section-card";
import { GatewayFilters } from "./gateway-filters";
import { StatusBadge } from "../badges/status-badge";
import { StateMessage } from "../layout/state-message";
import type { DataSourceInfo } from "../../lib/domain";
import { filterInvocations, type GatewaySnapshot, type Invocation, type InvocationFilters } from "../../lib/gateway/model";

export type SearchParams = Record<string, string | string[] | undefined>;
function query(params: SearchParams, key: string): string { const value = params[key]; return typeof value === "string" && value.length <= 128 ? value : ""; }
export function pageNumber(value: string | string[] | undefined): number { return typeof value === "string" && /^\d{1,4}$/.test(value) ? Math.max(1, Number(value)) : 1; }
export function EvidenceBadge({ value }: { value: string }) {
  const tone = value === "SUCCEEDED" || value === "ALLOW" ? "success" : value === "DENY" ? "denied" : value === "FAILED" ? "failed" : value === "UNKNOWN" ? "unknown" : "neutral";
  return <StatusBadge tone={tone}>{value.replaceAll("_", " ")}</StatusBadge>;
}
export function Integrity({ invocation }: { invocation: Invocation }) {
  return <div className="flex flex-wrap items-center gap-1 text-xs">
    {invocation.conflicting && <StatusBadge tone="conflict">Conflicting evidence</StatusBadge>}
    {invocation.incomplete && <StatusBadge tone="incomplete">Incomplete</StatusBadge>}
    {!invocation.conflicting && !invocation.incomplete && <StatusBadge tone="neutral">Complete</StatusBadge>}
    {invocation.duplicateCount > 0 && <StatusBadge tone="failed">{invocation.duplicateCount} duplicate copies</StatusBadge>}
  </div>;
}
export function SourceFailure({ source }: { source: DataSourceInfo }) {
  return <SectionCard><StateMessage role="alert" icon={source.status === "error" ? AlertTriangle : Database} warning={source.status === "error"}
    title={source.status === "error" ? "Audit source error" : "Gateway audit unavailable"}>
    <p>{source.code}. No invocation counts are available. Demo data has not been substituted.</p>
    <p>Check the server-side audit configuration and read permissions, then refresh.</p>
  </StateMessage></SectionCard>;
}
export function GatewayOverview({ snapshot, source, params = {} }: { snapshot: GatewaySnapshot; source: DataSourceInfo; params?: SearchParams }) {
  const pagination = overviewPage(snapshot.invocations.length, pageNumber(params.page));
  const m = snapshot.metrics;
  return <div className="px-6 py-6 lg:px-8">
    <header className="ui-page-header"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-ink"><FileText className="h-5 w-5" aria-hidden="true" /></span><div><h1 className="ui-page-title">Gateway execution overview</h1><p className="ui-muted mt-1">Persisted lifecycle evidence, counted once per invocation.</p></div></div><div className="flex flex-wrap items-center gap-3"><SourceIndicator source={source} detail={source.status === "ready" ? `${snapshot.recordCount} records · ${snapshot.duplicateCount} duplicates` : undefined} /><Link href="/audit" className="ui-button ui-button-primary">Explore all invocations<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div></header>
    {source.status !== "ready" ? <SourceFailure source={source} /> : <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Observed invocations" description="Distinct invocations in the snapshot" value={m.total} icon={TerminalSquare} />
        <MetricCard label="Allowed invocations" description="Persisted ALLOW decisions" tone="green" value={m.allowed} icon={ListChecks} />
        <MetricCard label="Denied invocations" description="Persisted DENY decisions" value={m.denied} icon={CircleSlash} tone="rose" />
        <MetricCard label="Successful executions" description="Confirmed successful outcomes" tone="green" value={m.succeeded} icon={Activity} />
        <MetricCard label="Failed executions" description="Confirmed execution failures" value={m.failed} icon={AlertTriangle} tone="amber" />
        <MetricCard label="Unknown execution outcomes" description="Outcome cannot be established" value={m.unknown} icon={AlertTriangle} tone="slate" />
        <MetricCard label="Incomplete lifecycles" description="Missing lifecycle evidence" value={m.incomplete} icon={ListChecks} tone="slate" />
        <MetricCard label="Conflicting evidence" description="Conflicting persisted records" value={m.conflicting} icon={AlertTriangle} tone="rose" />
      </div>
      <OverviewAnalytics invocations={snapshot.invocations} />
      <p className="ui-helper my-4">{snapshot.recordCount} persisted records · {snapshot.duplicateCount} identical duplicate copies. ALLOW is authorization evidence, never execution success.</p>
      <section id="recent-invocations" className="ui-card overflow-hidden"><div className="border-b border-line px-4 py-3"><h2 className="ui-section-title">Recent invocations</h2><p className="ui-helper mt-1">Latest observed invocations and their persisted execution evidence.</p></div>
      <InvocationTable embedded invocations={snapshot.invocations.slice(pagination.start, pagination.end)} /><OverviewPagination pagination={pagination} /></section>
    </>}
  </div>;
}
export function InvocationTable({ invocations, emptyTitle = "No observed invocations", embedded = false }: { invocations: Invocation[]; emptyTitle?: string; embedded?: boolean }) {
  return <div className={`${embedded ? "" : "ui-card"} ui-table-scroll`} role="region" aria-label="Gateway invocations" tabIndex={0}><table className="ui-table ui-invocation-table min-w-[1440px]">
    <colgroup>{[280, 220, 180, 180, 128, 144, 200, 180].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead className="ui-table-header"><tr>
    {["Invocation", "Time (UTC)", "Agent", "Tool", "Authorization", "Execution", "Evidence", "Classification"].map(label => <th scope="col" key={label} className="px-4 py-3 font-medium">{label}</th>)}
  </tr></thead><tbody className="divide-y divide-line">{invocations.map(invocation => <tr key={invocation.invocationId} className="hover:bg-hover">
    <td className="px-4 py-3"><Link href={`/invocations/${invocation.invocationId}`} className="ui-table-id font-mono text-[12px] text-accent hover:underline">{invocation.invocationId}</Link></td>
    <td className="ui-table-id px-4 py-3 text-muted"><UtcTimestamp value={invocation.timestamp} /></td>
    <td className="ui-table-id px-4 py-3"><span className="block truncate" title={invocation.agentId || undefined}>{invocation.agentId || "Not established"}</span></td><td className="ui-table-id px-4 py-3"><span className="block truncate" title={invocation.tool || undefined}>{invocation.tool || "Unavailable"}</span></td>
    <td className="px-4 py-3"><EvidenceBadge value={invocation.authorization} />{invocation.authorizationMissing && <span className="mt-1 block text-xs text-muted">Evidence missing</span>}</td>
    <td className="px-4 py-3"><EvidenceBadge value={invocation.execution} />{invocation.executionMissing && <span className="mt-1 block text-xs text-muted">Execution evidence missing</span>}</td>
    <td className="px-4 py-3"><Integrity invocation={invocation} /></td><td className="ui-table-id px-4 py-3 text-muted">{invocation.reason}</td>
  </tr>)}</tbody></table>{invocations.length === 0 && <StateMessage icon={SearchX} title={emptyTitle}><p>No observed invocations match this view. An empty readable file is not execution evidence.</p></StateMessage>}</div>;
}
export function GatewayExplorer({ snapshot, source, params }: { snapshot: GatewaySnapshot; source: DataSourceInfo; params: SearchParams }) {
  const filters: InvocationFilters = { agent: query(params, "agent"), tool: query(params, "tool"), authorization: query(params, "authorization"), execution: query(params, "execution"), from: query(params, "from"), to: query(params, "to") };
  const filtered = filterInvocations(snapshot.invocations, filters);
  const page = pageNumber(params.page);
  const pageSize = 100;
  const href = (target: number) => { const search = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value); search.set("page", String(target)); return `/audit?${search}`; };
  return <div className="px-6 py-6 lg:px-8"><header className="ui-page-header"><div><h1 className="ui-page-title">Gateway audit explorer</h1><p className="ui-muted mt-1">One row per invocation; open a row for original event metadata and timeline.</p></div><SourceIndicator source={source} /></header>
    {source.status !== "ready" ? <SourceFailure source={source} /> : <>
      <GatewayFilters key={JSON.stringify([filters, page])} filters={filters}
        agents={[...new Set(snapshot.invocations.map(i => i.agentId).filter(Boolean))].sort()}
        tools={[...new Set(snapshot.invocations.map(i => i.tool).filter(Boolean))].sort()} />
      <p className="ui-muted mb-3">{filtered.length} matching invocations · page {page}. Filters do not change lifecycle correlation.</p>
      <InvocationTable invocations={filtered.slice((page - 1) * pageSize, page * pageSize)} emptyTitle={Object.values(filters).some(Boolean) ? "No matching invocations" : "No observed invocations"} />
      <nav aria-label="Invocation pages" className="mt-4 flex flex-wrap gap-3 text-sm text-accent [&>a]:ui-button [&>a]:ui-button-secondary">{page > 1 && <Link href={href(page - 1)}>Previous</Link>}{page * pageSize < filtered.length && <Link href={href(page + 1)}>Next</Link>}</nav>
    </>}
  </div>;
}
export function InvocationDetail({ invocation, page = 1 }: { invocation: Invocation; page?: number }) {
  const events = invocation.events.slice((page - 1) * 100, page * 100);
  return <div className="px-6 py-6 lg:px-8"><Link href="/audit" className="ui-action">Back to invocation list</Link><header className="ui-page-header mt-4"><div><h1 className="ui-page-title">Invocation details</h1><p className="mt-3 break-all font-mono text-xs text-muted">{invocation.invocationId}</p></div></header>
    <SectionCard className="ui-card-pad"><div className="flex flex-wrap gap-3"><EvidenceBadge value={invocation.authorization} /><EvidenceBadge value={invocation.execution} /><Integrity invocation={invocation} /></div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><Field label="Agent" value={invocation.agentId || "Not established"} /><Field opaque label="Run" value={invocation.runId || "Not established"} /><Field label="Logical tool" value={invocation.tool || "Unavailable"} /><Field opaque label="Request correlation (not invocation identity)" value={invocation.requestId} /></dl>
      {invocation.authorizationMissing && <p className="mt-4 text-failed">Authorization evidence is missing.</p>}{invocation.executionMissing && <p className="mt-4 text-unknown">Execution evidence is missing. ALLOW cannot establish success.</p>}
      {invocation.missingStages.length > 0 && <p className="mt-4 break-words text-sm text-incomplete">Missing stages: {invocation.missingStages.join(", ")}</p>}
      {invocation.issues.map(issue => <p key={issue} className="mt-2 text-sm text-conflict">{issue}</p>)}
    </SectionCard>
    <h2 className="ui-section-title mb-3 mt-6">Persisted event timeline</h2><p className="ui-muted mb-4">Original IDs and timestamps, sorted by event time. Only allow-listed metadata is shown; credentials and payloads are omitted.</p>
    <ol className="space-y-4">{events.map((event, index) => <li key={`${event.event_id}-${index}`} className="ui-card p-4"><div className="flex flex-wrap items-center gap-3"><strong className="text-sm">{event.event_type}</strong><EvidenceBadge value={event.authorization_decision} /><EvidenceBadge value={event.execution_status} /></div><p className="mt-2 break-all font-mono text-xs text-muted">{event.timestamp} · event {event.event_id}</p><p className="mt-2 text-sm text-muted">Audit classification: {event.reason}</p><details className="mt-3"><summary className="cursor-pointer text-sm text-accent">Safe event metadata</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs text-muted">{JSON.stringify(event, null, 2)}</pre></details></li>)}</ol>
    <nav aria-label="Timeline pages" className="mt-4 flex flex-wrap gap-3 text-sm text-accent [&>a]:ui-button [&>a]:ui-button-secondary">{page > 1 && <Link href={`?page=${page - 1}`}>Previous events</Link>}{page * 100 < invocation.events.length && <Link href={`?page=${page + 1}`}>Next events</Link>}</nav>
  </div>;
}
function Field({ label, value, opaque = false }: { label: string; value: string; opaque?: boolean }) { return <div><dt className="ui-field-label">{label}</dt><dd className={`ui-table-id mt-1 text-foreground ${opaque ? "font-mono" : ""}`}>{value}</dd></div>; }
