import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CircleSlash, Clock, ListChecks, TerminalSquare } from "lucide-react";
import { getConsoleDataProvider } from "../../../lib/providers";
import { formatObservedWindow, formatTimestamp, truncateId } from "../../../lib/format";
import { SourceIndicator } from "../../../components/metrics/source-indicator";
import { SectionCard } from "../../../components/layout/section-card";
import { TechId } from "../../../components/badges/tech-id";
import { ExecutionTimeline } from "../../../components/tables/execution-timeline";

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const decodedRunId = decodeURIComponent(runId);
  const provider = await getConsoleDataProvider();
  const run = await provider.getRun(decodedRunId);
  const source = provider.getSourceInfo();

  if (!run) {
    return (
      <div className="px-6 py-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="ui-page-title">Run Not Observed</h2>
            <p className="ui-muted mt-1">No audited tool activity was found for this run ID.</p>
          </div>
          <SourceIndicator source={source} />
        </div>
        <SectionCard className="p-8">
          <TechId className="text-slate-200">{decodedRunId}</TechId>
          <p className="ui-muted mt-3">Runs are reconstructed from audit events, not explicit lifecycle records.</p>
          <Link href="/runs" className="mt-5 inline-flex rounded-md border border-line px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
            Back to runs
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ui-page-title">Run</h2>
          <div className="mt-2"><TechId className="text-base text-teal-100">{run.runId}</TechId></div>
          <p className="ui-muted mt-2">
            Agent{" "}
            <Link href={`/agents/${encodeURIComponent(run.agentId)}`} className="ui-clickable-id text-slate-100">
              {run.agentId}
            </Link>
          </p>
        </div>
        <SourceIndicator source={source} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RunSummaryCard label="First Observed Event" value={formatTimestamp(run.firstObservedAt)} icon={<Clock className="h-5 w-5" aria-hidden="true" />} />
        <RunSummaryCard label="Last Observed Event" value={formatTimestamp(run.lastObservedAt)} icon={<ListChecks className="h-5 w-5" aria-hidden="true" />} />
        <RunSummaryCard label="Observed Window" value={formatObservedWindow(run.observedWindowSeconds)} icon={<Clock className="h-5 w-5" aria-hidden="true" />} />
        <RunSummaryCard label="Tool Calls" value={String(run.toolCalls)} icon={<TerminalSquare className="h-5 w-5" aria-hidden="true" />} />
        <RunSummaryCard label="Allowed" value={String(run.allowedCalls)} icon={<ListChecks className="h-5 w-5" aria-hidden="true" />} tone="teal" />
        <RunSummaryCard label="Denied" value={String(run.deniedCalls)} icon={<CircleSlash className="h-5 w-5" aria-hidden="true" />} tone="rose" />
        <RunSummaryCard label="Execution Errors" value={String(run.executionErrors)} icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <h3 className="ui-section-title mb-3">Execution Timeline</h3>
          <ExecutionTimeline events={run.events} />
        </section>

        <SectionCard className="ui-card-pad">
          <h3 className="ui-section-title">Observed Metadata</h3>
          <dl className="mt-4 space-y-4">
            <Meta label="Distinct Tools" value={String(run.distinctTools)} />
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Token ID</dt>
              {run.tokenId ? (
                <dd className="mt-1"><TechId>{truncateId(run.tokenId, 18)}</TechId></dd>
              ) : (
                <dd className="mt-1 text-sm text-amber-200">Multiple token IDs observed</dd>
              )}
            </div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function RunSummaryCard({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "slate" | "teal" | "rose" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-400/20 bg-slate-400/10 text-slate-200",
    teal: "border-teal-400/20 bg-teal-400/10 text-teal-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  }[tone];

  return (
    <SectionCard className="ui-card-pad min-h-32">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-slate-400">{label}</div>
          <div className="mt-2 truncate text-xl font-semibold tracking-normal text-white" title={value}>{value}</div>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneClass}`}>
          {icon}
        </div>
      </div>
    </SectionCard>
  );
}
