import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewAnalytics, overviewAnalytics } from "../src/components/overview/overview-analytics";
import { GatewayOverview } from "../src/components/tables/gateway-audit";
import { invocationMetrics, type Invocation } from "../src/lib/gateway/model";

function invocation(index: number, overrides: Partial<Invocation> = {}): Invocation {
  return { invocationId: String(index).padStart(32, "0"), timestamp: `2026-10-24T12:00:0${index}Z`, agentId: "agent", runId: "run", tool: "http_status", requestId: "correlation", authorization: "ALLOW", execution: "SUCCEEDED", authorizationMissing: false, executionMissing: false, incomplete: false, conflicting: false, duplicateCount: 0, missingStages: [], issues: [], reason: "execution_ok", events: [], ...overrides };
}
test("analytics counts invocations once and keeps authorization out of execution categories", () => {
  const input = [invocation(1), invocation(2, { authorization: "DENY", execution: "NOT_EXECUTED" }), invocation(3, { execution: "UNKNOWN", executionMissing: true, incomplete: true }), invocation(4, { execution: "FAILED" })];
  const before = JSON.stringify(input), a = overviewAnalytics(input);
  assert.equal(a.total, 4);
  assert.deepEqual(a.outcomes, { SUCCEEDED: 1, FAILED: 1, NOT_EXECUTED: 1, UNKNOWN: 1 });
  assert.equal(a.bins.reduce((sum, n) => sum + n, 0), 4);
  assert.equal(a.tools[0][1], 4);
  assert.equal(JSON.stringify(input), before);
  const html = renderToStaticMarkup(<OverviewAnalytics invocations={input} />);
  assert.ok(html.includes("All 4 observed invocations"));
  assert.ok(html.includes("not authorization decisions"));
  assert.ok(!html.includes("Last 24 hours"));
  assert.ok(!html.includes("%" + " change"));
});
test("activity preserves sub-millisecond boundaries and source timestamps", () => {
  const a = overviewAnalytics([invocation(1, { timestamp: "2026-10-24T12:00:00.000000009Z" }), invocation(2, { timestamp: "2026-10-24T12:00:00.000000001Z" })]);
  assert.equal(a.start, "2026-10-24T12:00:00.000000001Z");
  assert.equal(a.end, "2026-10-24T12:00:00.000000009Z");
  assert.deepEqual(a.bins, [1, 0, 0, 0, 0, 0, 0, 1]);
});
test("tool ranking includes all requests and groups only the remaining tools", () => {
  const a = overviewAnalytics(Array.from({ length: 8 }, (_, index) => invocation(index, { tool: `tool-${index}` })));
  assert.equal(a.tools.length, 5);
  assert.equal(a.other, 3);
  assert.equal(a.tools.reduce((sum, [, n]) => sum + n, a.other), a.total);
});
test("empty and missing timestamp evidence never becomes a fabricated history or success", () => {
  const html = renderToStaticMarkup(<OverviewAnalytics invocations={[]} />);
  assert.ok(html.includes("No execution evidence to summarize"));
  assert.ok(!html.includes("<svg"));
  const a = overviewAnalytics([invocation(1, { timestamp: "invalid", execution: "UNKNOWN" })]);
  assert.equal(a.unplaced, 1);
  assert.equal(a.bins.length, 0);
  assert.equal(a.outcomes.UNKNOWN, 1);
  assert.equal(a.outcomes.SUCCEEDED, 0);
});
test("Overview has a page h1 and never shows analytics on unavailable evidence", () => {
  const invocations = [invocation(1)];
  const snapshot = { invocations, metrics: invocationMetrics(invocations), recordCount: 4, duplicateCount: 0 };
  const html = renderToStaticMarkup(<GatewayOverview snapshot={snapshot} source={{ kind: "gateway", label: "Persisted Gateway audit", status: "unavailable", code: "SOURCE_MISSING" }} />);
  assert.ok(html.includes('<h1 class="ui-page-title">Gateway execution overview</h1>'));
  assert.ok(!html.includes("Invocation activity"));
  assert.ok(!html.includes("Successful executions"));
});
