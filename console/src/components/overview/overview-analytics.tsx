import type { Invocation } from "../../lib/gateway/model";
import { formatUtcTimestamp } from "../../lib/format";
import { UtcTimestamp } from "../metadata/utc-timestamp";

function nanoseconds(value: string): bigint | undefined {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match || formatUtcTimestamp(value) === null) return undefined;
  return BigInt(Date.parse(match[1] + "Z")) * BigInt(1_000_000) + BigInt((match[2] ?? "").padEnd(9, "0"));
}

/** Snapshot presentation only: no history, policy or execution inference. */
export function overviewAnalytics(invocations: Invocation[]) {
  const tools = new Map<string, number>();
  const outcomes = { SUCCEEDED: 0, FAILED: 0, NOT_EXECUTED: 0, UNKNOWN: 0 };
  const placed = invocations.flatMap(i => { const time = nanoseconds(i.timestamp); return time === undefined ? [] : [{ original: i.timestamp, time }]; }).sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
  for (const item of invocations) {
    const name = item.tool || "Not established";
    tools.set(name, (tools.get(name) ?? 0) + 1);
    outcomes[item.execution]++;
  }
  const start = placed[0], end = placed.at(-1);
  const span = start && end ? end.time - start.time : BigInt(0);
  const bins = Array<number>(span > BigInt(0) ? 8 : placed.length ? 1 : 0).fill(0);
  for (const item of placed) {
    const index = bins.length === 1 ? 0 : Math.min(7, Number((item.time - start.time) * BigInt(8) / span));
    bins[index]++;
  }
  const ranked = [...tools].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
  const top = ranked.slice(0, 5);
  const other = ranked.slice(5).reduce((sum, item) => sum + item[1], 0);
  return { total: invocations.length, bins, start: start?.original, end: end?.original, unplaced: invocations.length - placed.length, tools: top, other, outcomes };
}

const outcomeStyle = [
  ["SUCCEEDED", "Succeeded", "success"], ["FAILED", "Failed", "failed"],
  ["NOT_EXECUTED", "Not executed", "muted"], ["UNKNOWN", "Unknown", "unknown"],
] as const;

export function OverviewAnalytics({ invocations }: { invocations: Invocation[] }) {
  const a = overviewAnalytics(invocations);
  let offset = 0;
  const maxBin = Math.max(1, ...a.bins);
  const maxTool = Math.max(1, ...a.tools.map(([, count]) => count));
  return <div className="ui-analytics-grid mt-5" aria-label="Observed snapshot analytics">
    <section className="ui-card ui-analytics-panel">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="ui-section-title">Invocation activity</h2><span className="rounded-md border border-line bg-raised px-2 py-1 text-[10px] font-medium text-muted">Observed snapshot · UTC</span></div>
      <p className="ui-helper mt-1">One count per invocation, at its first observed event.</p>
      {!a.bins.length ? <p className="ui-muted py-10">No timestamped observations in this readable snapshot.</p> : <figure className="mt-4">
        <svg viewBox="0 0 400 112" className="h-28 w-full text-accent" role="img" aria-label={`${a.total - a.unplaced} timestamped invocations in ${a.bins.length} equal-width time bins: ${a.bins.join(", ")}`}>
          {[24, 56, 88].map(y => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="rgb(var(--line))" strokeDasharray="3 4" />)}
          {a.bins.map((count, i) => { const width = 400 / a.bins.length; const height = count / maxBin * 74; return <g key={i}><rect x={i * width + width * .22} y={100 - height} width={width * .56} height={height} rx="3" fill="currentColor" opacity=".7" /><text x={i * width + width / 2} y={Math.max(12, 94 - height)} textAnchor="middle" fill="rgb(var(--muted))" fontSize="11">{count}</text></g>; })}
        </svg>
        <figcaption className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-muted"><span>From <UtcTimestamp value={a.start} /></span><span>Through <UtcTimestamp value={a.end} /></span></figcaption>
      </figure>}
      <p className="ui-helper mt-3">{a.bins.length === 0 ? "No activity window is available." : a.bins.length === 1 ? "Single observed time bin." : "Eight equal-width bins across the observed window; the last includes its endpoint."} No historical comparison.{a.unplaced > 0 ? ` ${a.unplaced} invocations lack a usable timestamp.` : ""}</p>
    </section>
    <section className="ui-card ui-analytics-panel">
      <h2 className="ui-section-title">Tool usage</h2><p className="ui-helper mt-1">Requested logical tools · {a.total} observed invocations</p>
      {!a.total ? <p className="ui-muted py-10">No observed tool invocations.</p> : <ul className="mt-5 space-y-3" aria-label="Observed invocation counts by tool">{[...a.tools, ...(a.other ? [["Other tools", a.other] as [string, number]] : [])].map(([name, count], index) => <li key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(48px,1fr)_auto] items-center gap-3 text-xs"><span className="truncate text-foreground" title={name}>{name}</span><span className="h-2 rounded-full bg-raised" aria-hidden="true"><span className="block h-full rounded-full bg-accent/70" style={{ width: `${count / Math.max(maxTool, a.other) * 100}%` }} /></span><span className="font-medium tabular-nums text-foreground">{count}</span></li>)}</ul>}
      <p className="ui-helper mt-4">Counts include denied and not-executed requests. Top five tools; remaining tools grouped separately.</p>
    </section>
    <section className="ui-card ui-analytics-panel">
      <h2 className="ui-section-title">Execution outcomes</h2><p className="ui-helper mt-1">All {a.total} observed invocations · execution only</p>
      {!a.total ? <p className="ui-muted py-10">No execution evidence to summarize.</p> : <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="relative h-28 w-28 shrink-0"><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={outcomeStyle.map(([key, label]) => `${label}: ${a.outcomes[key]} of ${a.total}`).join("; ")}>
          <circle cx="50" cy="50" r="39" fill="none" stroke="rgb(var(--raised))" strokeWidth="13" />
          {outcomeStyle.map(([key, , color]) => { const amount = a.outcomes[key] / a.total * 100; const currentOffset = offset; offset += amount; return <circle key={key} cx="50" cy="50" r="39" pathLength="100" fill="none" stroke={`rgb(var(--${color}))`} strokeWidth="13" strokeDasharray={`${amount} ${100 - amount}`} strokeDashoffset={-currentOffset} />; })}
        </svg><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-semibold tabular-nums">{a.total}</span><span className="text-[10px] text-muted">Observed</span></div></div>
        <ul className="min-w-0 flex-1 space-y-2 text-xs">{outcomeStyle.map(([key, label, color]) => <li key={key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgb(var(--${color}))` }} aria-hidden="true" />{label}</span><span className="font-semibold tabular-nums">{a.outcomes[key]}</span></li>)}</ul>
      </div>}
      <p className="ui-helper mt-4">Mutually exclusive execution outcomes, not authorization decisions. Unknown includes missing or conflicting outcome evidence.</p>
    </section>
  </div>;
}
