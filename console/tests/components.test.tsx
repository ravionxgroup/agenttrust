import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Activity, Database } from "lucide-react";
import { MetricCard } from "../src/components/metrics/metric-card";
import { PolicySourceIndicator } from "../src/components/metrics/source-indicator";
import { DecisionBadge } from "../src/components/badges/decision-badge";
import { ResultBadge } from "../src/components/badges/result-badge";
import { StateMessage } from "../src/components/layout/state-message";
import { GatewayOverview, SourceFailure } from "../src/components/tables/gateway-audit";
import type { GatewaySnapshot } from "../src/lib/gateway/model";

test("metric cards preserve number formatting and full long string values without truncation", () => {
  const number = renderToStaticMarkup(<MetricCard label="Calls" value={12345} icon={Activity} />);
  assert.ok(number.includes("12,345"));
  assert.ok(number.includes("ui-metric-card"));
  assert.ok(number.includes('aria-hidden="true"'));
  assert.ok(!number.includes("truncate"));
  const long = "long-issuer-name-".repeat(30);
  const text = renderToStaticMarkup(<MetricCard label="Issuer" value={long} icon={Activity} />);
  assert.ok(text.includes(long));
  assert.ok(!text.includes("truncate"));
});

test("all eight Overview metric labels retain their supplied values", () => {
  // Presentation inputs only; lifecycle projection itself is tested separately.
  const snapshot: GatewaySnapshot = { invocations: [], recordCount: 380, duplicateCount: 0, metrics: {
    total: 100, allowed: 78, denied: 20, authorizationUnknown: 2, succeeded: 70, failed: 4,
    notExecuted: 20, unknown: 6, incomplete: 3, conflicting: 2,
  } };
  const expected = { "Observed invocations": 100, "Allowed invocations": 78, "Denied invocations": 20,
    "Successful executions": 70, "Failed executions": 4, "Unknown execution outcomes": 6,
    "Incomplete lifecycles": 3, "Conflicting evidence": 2 };
  const html = renderToStaticMarkup(<GatewayOverview snapshot={snapshot} source={{ kind: "gateway", label: "Test", status: "ready" }} />);
  const cards = html.match(/<section\b[^>]*ui-metric-card[\s\S]*?<\/section>/g) ?? [];
  assert.equal(cards.length, 8);
  for (const [label, value] of Object.entries(expected)) {
    const card: string | undefined = cards.find(item => item.includes(`>${label}</div>`));
    assert.ok(card, label);
    assert.ok(card.includes(`>${value}</div>`), label);
  }
});

test("authorization and execution badges share styling without merging meanings", () => {
  const allow = renderToStaticMarkup(<DecisionBadge decision="allow" />);
  const unknown = renderToStaticMarkup(<DecisionBadge decision="unknown" />);
  const failed = renderToStaticMarkup(<ResultBadge decision="allow" resultStatus="error" />);
  const notExecuted = renderToStaticMarkup(<ResultBadge decision="deny" resultStatus="ok" />);
  const uncertain = renderToStaticMarkup(<ResultBadge decision="allow" resultStatus="unknown" />);
  for (const html of [allow, unknown, failed, notExecuted, uncertain]) assert.ok(html.includes("ui-badge"));
  assert.ok(allow.includes(">ALLOW</span>"));
  assert.ok(unknown.includes("text-muted") && unknown.includes(">UNKNOWN</span>"));
  assert.ok(failed.includes("text-failed") && failed.includes(">ERROR</span>"));
  assert.ok(notExecuted.includes("text-muted") && notExecuted.includes(">NOT EXECUTED</span>"));
  assert.ok(uncertain.includes("text-unknown") && uncertain.includes(">UNKNOWN</span>"));
});

test("policy source indicator stays neutral and retains the ingestion limitation", () => {
  const html = renderToStaticMarkup(<PolicySourceIndicator source={{ kind: "unavailable", label: "Gateway policy is not ingested" }} />);
  assert.ok(html.includes("Gateway policy is not ingested"));
  assert.ok(html.includes("text-muted"));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(!/text-(accent|success)|bg-(accent|success)/.test(html));
});

test("source failures retain distinct unavailable/error headings and never render successful zero metrics", () => {
  for (const status of ["unavailable", "error"] as const) {
    const html = renderToStaticMarkup(<SourceFailure source={{ kind: "gateway", label: "Test", status, code: "SOURCE_UNAVAILABLE" }} />);
    assert.ok(html.includes(status === "error" ? "Audit source error" : "Gateway audit unavailable"));
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes("No invocation counts are available. Demo data has not been substituted."));
    assert.ok(!html.includes("ui-metric-value"));
  }
  const state = renderToStaticMarkup(<StateMessage title="No matching invocations" icon={Database}><p>No results match this view.</p></StateMessage>);
  assert.ok(state.includes("No matching invocations"));
  assert.ok(state.includes("No results match this view."));
});
