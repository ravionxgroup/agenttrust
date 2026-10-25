import { SourceFailure } from "../../../components/tables/gateway-audit";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CircleSlash, Clock, ListChecks, TerminalSquare } from "lucide-react";
import { getConsoleDataProvider } from "../../../lib/providers";
import { formatObservedWindow, formatTimestamp } from "../../../lib/format";
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
  if (source.status && source.status !== "ready") return <div className="p-6"><h1 className="sr-only">Run</h1><SourceFailure source={source} /></div>;

  if (!run) {
    return (
      <div className="px-6 py-6 lg:px-8">
        <div className="ui-page-header [&>div]:min-w-0 [&>div]:max-w-full">
          <div>
            <h1 className="ui-page-title">Run Not Observed</h1>
            <p className="ui-muted mt-1">No audited tool activity was found for this run ID.</p>
          </div>
          <SourceIndicator source={source} />
        </div>
        <SectionCard className="p-8">
          <TechId opaque wrap className="text-foreground">{decodedRunId}</TechId>
          <p className="ui-muted mt-3">Runs are reconstructed from audit events, not explicit lifecycle records.</p>
          <Link href="/runs" className="ui-button ui-button-secondary mt-5">
            Back to runs
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="ui-page-header [&>div]:min-w-0 [&>div]:max-w-full">
        <div>
          <h1 className="ui-page-title">Run</h1>
          <div className="mt-2"><TechId opaque wrap className="text-xs text-accent">{run.runId}</TechId></div>
          <p className="ui-muted mt-2">
            Agent{" "}
            <Link href={`/agents/${encodeURIComponent(run.agentId)}`} className="ui-clickable-id text-foreground">
              {run.agentId}
            </Link>
          </p>
        </div>
        <SourceIndicator source={source} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RunSummaryCard label="First Observed Event" value={formatTimestamp(run.firstObservedAt)} icon={<Clock className="h-4 w-4" aria-hidden="true" />} />
        <RunSummaryCard label="Last Observed Event" value={formatTimestamp(run.lastObservedAt)} icon={<ListChecks className="h-4 w-4" aria-hidden="true" />} />
        <RunSummaryCard label="Observed Window" value={formatObservedWindow(run.observedWindowSeconds)} icon={<Clock className="h-4 w-4" aria-hidden="true" />} />
        <RunSummaryCard label="Tool Calls" value={String(run.toolCalls)} icon={<TerminalSquare className="h-4 w-4" aria-hidden="true" />} />
        <RunSummaryCard label="Allowed" value={String(run.allowedCalls)} icon={<ListChecks className="h-4 w-4" aria-hidden="true" />} tone="teal" />
        <RunSummaryCard label="Denied" value={String(run.deniedCalls)} icon={<CircleSlash className="h-4 w-4" aria-hidden="true" />} tone="rose" />
        <RunSummaryCard label="Execution Errors" value={String(run.executionErrors)} icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <h2 className="ui-section-title mb-3">Execution Timeline</h2>
          <ExecutionTimeline events={run.events} />
        </section>

        <SectionCard className="ui-card-pad">
          <h2 className="ui-section-title">Observed Metadata</h2>
          <dl className="mt-4 space-y-4">
            <Meta label="Distinct Tools" value={String(run.distinctTools)} />
            <div>
              <dt className="ui-field-label">Token ID</dt>
              {run.tokenId ? (
                <dd className="mt-1"><TechId opaque wrap>{run.tokenId}</TechId></dd>
              ) : (
                <dd className="mt-1 text-sm text-failed">{source.kind === "gateway" ? "Token IDs omitted from the audit view" : "Multiple token IDs observed"}</dd>
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
      <dt className="ui-field-label">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
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
    slate: "border-muted/20 bg-muted/10 text-foreground",
    teal: "border-accent/20 bg-accent/10 text-accent",
    rose: "border-denied/20 bg-denied/10 text-denied",
    amber: "border-failed/20 bg-failed/10 text-failed",
  }[tone];

  return (
    <SectionCard className="ui-metric-card">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="ui-metric-label">{label}</div>
          <div className="ui-summary-value mt-0.5" title={value}>{value}</div>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${toneClass}`}>
          {icon}
        </div>
      </div>
    </SectionCard>
  );
}
