import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExecutionTimeline } from "../src/components/tables/execution-timeline";
import { TechId } from "../src/components/badges/tech-id";
import { ToolsTable } from "../src/components/tables/tools-table";
import { RecentEventsTable } from "../src/components/tables/recent-events-table";
import type { AuditEvent, ToolSummary } from "../src/lib/domain";

const event: AuditEvent = { eventId: "event-one", ts: 1792843200, agentId: "agent-" + "a".repeat(110), runId: "run-" + "r".repeat(110), tokenId: "", tool: "tool-" + "t".repeat(110), requiredScope: "service:read", decision: "allow", reason: null, argsRedacted: {}, resultStatus: "ok" };

test("timeline keeps ordering, separate labeled decision/result columns and full identifiers", () => {
  const events: AuditEvent[] = [event, { ...event, eventId: "event-two", decision: "deny", resultStatus: "not_executed" }, { ...event, eventId: "event-three", resultStatus: "error" }, { ...event, eventId: "event-four", resultStatus: "unknown" }];
  const html = renderToStaticMarkup(<ExecutionTimeline events={events} />);
  assert.equal((html.match(/ui-timeline-authorization/g) ?? []).length, 4);
  assert.equal((html.match(/ui-timeline-execution/g) ?? []).length, 4);
  for (const label of ["Authorization", "Execution", "ALLOW", "DENY", "OK", "ERROR", "UNKNOWN", "NOT EXECUTED", "Tool not executed"]) assert.ok(html.includes(label));
  assert.ok(html.includes(event.tool));
  assert.ok(html.indexOf(">OK</span>") < html.indexOf(">NOT EXECUTED</span>"));
  assert.ok(html.includes("Authorization succeeded; execution returned an error."));
});

test("technical identifiers retain complete accessible text in truncated and wrapped presentations", () => {
  for (const wrap of [false, true]) {
    const html = renderToStaticMarkup(<TechId wrap={wrap}>{event.runId}</TechId>);
    assert.ok(html.includes(`>${event.runId}</span>`));
    assert.equal(html.includes("ui-id-wrap"), wrap);
  }
  const html = renderToStaticMarkup(<RecentEventsTable events={[event]} />);
  assert.ok(html.includes(`>${event.runId}</a>`));
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 6);
  assert.ok(!html.includes("overflow-hidden"));
});

test("scope summary links to existing tool details with the observed count and numeric columns", () => {
  const tool: ToolSummary = { tool: "service/read", requiredScopes: [{ requiredScope: "service:read", calls: 2 }, { requiredScope: "service:write", calls: 1 }, { requiredScope: "service:inspect", calls: 1 }], agentsObserved: 1, runsObserved: 1, calls: 4, allowedCalls: 2, deniedCalls: 1, executionErrors: 1, lastSeen: event.ts };
  const html = renderToStaticMarkup(<ToolsTable tools={[tool]} />);
  assert.ok(html.includes('href="/tools/service%2Fread"'));
  assert.ok(html.includes('aria-label="View all 3 observed scopes for service/read"'));
  assert.ok(html.includes(">+2<"));
  assert.equal((html.match(/<th scope="col" class="ui-numeric/g) ?? []).length, 6);
  assert.equal((html.match(/<td class="ui-numeric/g) ?? []).length, 6);
  assert.ok(html.includes("service:read"));
});
