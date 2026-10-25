import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { overviewPage, OverviewPagination } from "../src/components/overview/overview-pagination";

test("Overview pagination counts distinct snapshot invocations in ten-row pages", () => {
  assert.deepEqual(overviewPage(16, 1), { total: 16, pages: 2, page: 1, start: 0, end: 10 });
  assert.deepEqual(overviewPage(16, 2), { total: 16, pages: 2, page: 2, start: 10, end: 16 });
  assert.equal(overviewPage(16, 99).page, 2);
  assert.equal(overviewPage(16, 0).page, 1);
});
test("Overview footer exposes current page, GET links and disabled boundaries", () => {
  const first = renderToStaticMarkup(<OverviewPagination pagination={overviewPage(16, 1)} />);
  assert.ok(first.includes("Showing 1–10 of 16 invocations"));
  assert.match(first, /disabled="">Previous/);
  assert.ok(first.includes('/?page=2'));
  assert.ok(first.includes('aria-label="Page 1" aria-current="page"'));
  const last = renderToStaticMarkup(<OverviewPagination pagination={overviewPage(16, 2)} />);
  assert.ok(last.includes("Showing 11–16 of 16 invocations"));
  assert.match(last, /disabled="">Next/);
});
test("empty and large snapshots have honest counts and bounded page links", () => {
  const empty = renderToStaticMarkup(<OverviewPagination pagination={overviewPage(0, 1)} />);
  assert.ok(empty.includes("Showing 0–0 of 0 invocations"));
  const large = renderToStaticMarkup(<OverviewPagination pagination={overviewPage(10000, 500)} />);
  assert.equal((large.match(/aria-label="Page /g) ?? []).length, 5);
  assert.ok(large.includes("Showing 4991–5000 of 10000 invocations"));
});

test("Overview renders requested snapshot slice without paginating metrics or counting records", async () => {
  const { GatewayOverview } = await import("../src/components/tables/gateway-audit");
  const { invocationMetrics } = await import("../src/lib/gateway/model");
  const invocations = Array.from({ length: 16 }, (_, index) => ({ invocationId: `id-${index}`, timestamp: "2026-10-24T12:00:00Z", agentId: "agent", runId: "run", tool: "tool", requestId: "request", authorization: "ALLOW" as const, execution: "SUCCEEDED" as const, authorizationMissing: false, executionMissing: false, incomplete: false, conflicting: false, duplicateCount: 0, missingStages: [], issues: [], reason: "execution_ok", events: [] }));
  const html = renderToStaticMarkup(<GatewayOverview params={{ page: "2" }} snapshot={{ invocations, recordCount: 64, duplicateCount: 0, metrics: invocationMetrics(invocations) }} source={{ kind: "gateway", label: "Persisted Gateway audit", status: "ready" }} />);
  assert.equal((html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0].match(/<tr /g) ?? []).length, 6);
  assert.ok(html.includes("Showing 11–16 of 16 invocations"));
  assert.ok(html.includes('href="/invocations/id-10"'));
  assert.ok(!html.includes('href="/invocations/id-9"'));
  assert.ok(html.includes("64 persisted records"));
  assert.ok(html.includes("All 16 observed invocations"));
});
