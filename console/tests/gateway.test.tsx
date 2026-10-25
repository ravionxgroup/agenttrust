import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir, symlink, chmod, rm, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AUDIT_LIMITS, AuditSourceError, parseGatewayJsonl, readGatewayAudit } from "../src/lib/gateway/ingest";
import { filterInvocations, type Execution } from "../src/lib/gateway/model";
import { GatewayAuditProvider } from "../src/lib/providers/gateway";
import { GatewayOverview, GatewayExplorer, InvocationDetail } from "../src/components/tables/gateway-audit";
import { formatResult } from "../src/lib/format";

const SENTINEL = "T07_SECRET_SENTINEL_NEVER_RENDERED";
const inv = "a".repeat(32);
const other = "b".repeat(32);
let serial = 0;
function event(stage: string, execution: Execution = "UNKNOWN", overrides: Record<string, unknown> = {}) {
  const authorization = stage === "invocation_received" ? "UNKNOWN" : "ALLOW";
  return { schema_version: 1, event_id: (++serial).toString(16).padStart(32, "0"), invocation_id: inv,
    timestamp: "2026-10-24T12:00:00Z", event_type: stage, request_id: "correlation-only", agent_id: stage === "invocation_received" ? "" : "agent", run_id: stage === "invocation_received" ? "" : "run",
    token_id: stage === "invocation_received" ? "" : "tok", tool_id: "status", tool: "status", authorization_decision: authorization,
    execution_status: execution, decision: authorization === "ALLOW" ? "allow" : "", reason: "execution_ok",
    result_status: stage === "authorization_decision" ? "not_executed" : ({ SUCCEEDED: "ok", FAILED: "error", NOT_EXECUTED: "not_executed", UNKNOWN: "unknown" } as const)[execution], ...overrides };
}
function normal(execution: Execution = "SUCCEEDED", invocation = inv) {
  const records = [event("invocation_received"), event("authorization_decision"),
    ...(execution === "NOT_EXECUTED" ? [] : [event("execution_attempted")]), event("execution_result", execution)];
  return records.map(record => ({ ...record, invocation_id: invocation }));
}
const parse = (records: Record<string, unknown>[]) => parseGatewayJsonl(Buffer.from(records.map(record => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "")));

for (const execution of ["SUCCEEDED", "FAILED", "UNKNOWN", "NOT_EXECUTED"] as Execution[]) test(`ALLOW followed by ${execution}`, () => {
  const snapshot = parse(normal(execution));
  assert.equal(snapshot.metrics.total, 1);
  assert.equal(snapshot.invocations[0].authorization, "ALLOW");
  assert.equal(snapshot.invocations[0].execution, execution);
  assert.equal(snapshot.invocations[0].incomplete, false);
  assert.equal(snapshot.invocations[0].conflicting, false);
});
test("DENY is terminal NOT_EXECUTED without a fabricated result", () => {
  const snapshot = parse([event("invocation_received"), event("authorization_decision", "NOT_EXECUTED", { authorization_decision: "DENY", decision: "deny" })]);
  assert.equal(snapshot.metrics.denied, 1); assert.equal(snapshot.invocations[0].execution, "NOT_EXECUTED");
  assert.equal(snapshot.invocations[0].incomplete, false); assert.equal(snapshot.invocations[0].events.length, 2);
});
test("ALLOW without result remains UNKNOWN, incomplete, missing execution", () => {
  const item = parse([event("invocation_received"), event("authorization_decision")]).invocations[0];
  assert.equal(item.execution, "UNKNOWN"); assert.equal(item.incomplete, true); assert.equal(item.executionMissing, true);
});
test("receipt alone establishes no authorization or execution", () => {
  const item = parse([event("invocation_received")]).invocations[0];
  assert.equal(item.authorization, "UNKNOWN"); assert.equal(item.execution, "UNKNOWN"); assert.ok(item.authorizationMissing && item.executionMissing);
});
test("missing receipt on DENY is visible as incomplete", () => {
  const item = parse([event("authorization_decision", "NOT_EXECUTED", { authorization_decision: "DENY", decision: "deny" })]).invocations[0];
  assert.equal(item.execution, "NOT_EXECUTED"); assert.ok(item.incomplete);
});
test("out-of-order and nanosecond timestamps preserve correlation and original timestamps", () => {
  const records = normal(); records[0].timestamp = "2026-10-24T12:00:00Z"; records[1].timestamp = "2026-10-24T12:00:00.000000001Z"; records[2].timestamp = "2026-10-24T12:00:00.000000002Z"; records[3].timestamp = "2026-10-24T12:00:00.000000003Z";
  const item = parse(records.reverse()).invocations[0]; assert.equal(item.events[0].event_type, "invocation_received");
  assert.equal(item.events[1].timestamp, "2026-10-24T12:00:00.000000001Z"); assert.equal(item.execution, "SUCCEEDED");
});
test("identical duplicate IDs do not double count; conflicting duplicates quarantine both invocations", () => {
  const records = normal(); const snapshot = parse([...records, records[0]]);
  assert.equal(snapshot.metrics.total, 1); assert.equal(snapshot.duplicateCount, 1); assert.equal(snapshot.invocations[0].events.length, 4);
  const conflict = parse([...records, { ...records[0], invocation_id: other }]);
  assert.equal(conflict.metrics.conflicting, 2); assert.equal(conflict.metrics.succeeded, 0);
});
test("conflicting terminal outcomes and identity changes never favor success", () => {
  const records = normal(); const conflict = parse([...records, event("execution_result", "FAILED")]);
  assert.equal(conflict.invocations[0].execution, "UNKNOWN"); assert.equal(conflict.metrics.conflicting, 1);
  assert.equal(parse([...records, event("execution_result", "SUCCEEDED", { agent_id: "different" })]).metrics.succeeded, 0);
});
test("distinct invocations sharing correlation, agent and tool remain separate", () => {
  const snapshot = parse([...normal(), ...normal("FAILED", other)]);
  assert.equal(snapshot.metrics.total, 2); assert.equal(snapshot.metrics.allowed, 2); assert.equal(snapshot.metrics.succeeded, 1); assert.equal(snapshot.metrics.failed, 1);
});
test("execution evidence following DENY is conflicting", () => {
  const records = normal(); records[1] = event("authorization_decision", "NOT_EXECUTED", { authorization_decision: "DENY", decision: "deny" });
  assert.equal(parse(records).invocations[0].execution, "UNKNOWN");
});
for (const overrides of [{ schema_version: 2 }, { invocation_id: "" }, { execution_status: "SUCCEEDED", event_type: "authorization_decision" }, { timestamp: "2026-02-31T00:00:00Z" }]) test(`invalid record rejected: ${JSON.stringify(overrides)}`, () => {
  assert.throws(() => parse([event("authorization_decision", "UNKNOWN", overrides)]), AuditSourceError);
});
test("malformed JSONL, duplicate keys, incomplete appends and excessive depth reject the whole source", () => {
  for (const input of [JSON.stringify(event("invocation_received")) + "\nnot json\n", 'not json\n', '{"a":1,"a":2}\n', '{}', '['.repeat(40) + ']'.repeat(40) + '\n']) assert.throws(() => parseGatewayJsonl(Buffer.from(input)), AuditSourceError);
});
test("credentials and payloads never appear in serialized projection or rendered evidence", () => {
  const records = normal().map(record => ({ ...record, token_id: SENTINEL, authorization: SENTINEL, args_redacted: { nested: [{ api_key: SENTINEL }] }, response: SENTINEL }));
  records[3].reason = SENTINEL;
  const snapshot = parse(records);
  const html = renderToStaticMarkup(<InvocationDetail invocation={snapshot.invocations[0]} />);
  assert.ok(!JSON.stringify(snapshot).includes(SENTINEL)); assert.ok(!html.includes(SENTINEL)); assert.ok(html.includes("other"));
});
test("filters cover agent, tool, authorization, execution and UTC range", () => {
  const snapshot = parse([...normal(), ...normal("FAILED", other)]);
  assert.equal(filterInvocations(snapshot.invocations, { agent: "agent", tool: "status", authorization: "ALLOW", execution: "FAILED", from: "2026-10-24T11:59", to: "2026-10-24T12:01" }).length, 1);
  assert.equal(filterInvocations(snapshot.invocations, { from: "invalid" }).length, 0);
});
test("dashboard counts invocations once, distinguishes unknown/failed/incomplete and renders empty state", () => {
  const snapshot = parse([...normal("FAILED"), event("authorization_decision", "UNKNOWN", { invocation_id: other })]);
  const source = { kind: "gateway" as const, status: "ready" as const, label: "Persisted Gateway audit" };
  const html = renderToStaticMarkup(<GatewayOverview snapshot={snapshot} source={source} />);
  assert.equal(snapshot.metrics.total, 2); assert.ok(html.includes("FAILED") && html.includes("UNKNOWN") && html.includes("Incomplete"));
  assert.ok(renderToStaticMarkup(<GatewayExplorer snapshot={parse([])} source={source} params={{}} />).includes("No observed invocations"));
  assert.ok(renderToStaticMarkup(<GatewayExplorer snapshot={snapshot} source={source} params={{ execution: "FAILED" }} />).includes("1 matching invocations"));
  assert.equal(formatResult(null, "allow"), "UNKNOWN");
});

test("Gateway filter form renders URL-applied values and submits GET without the old page", () => {
  const snapshot = parse(normal("FAILED"));
  const params = { agent: "agent", tool: "status", authorization: "ALLOW", execution: "FAILED", from: "2026-10-24T11:59", to: "2026-10-24T12:01", page: "2" };
  const html = renderToStaticMarkup(<GatewayExplorer snapshot={snapshot} source={{ kind: "gateway", label: "test", status: "ready" }} params={params} />);
  const form = html.match(/<form\b[\s\S]*?<\/form>/)?.[0] ?? "";
  assert.match(form, /action="\/audit"/);
  // Next Form with a string action uses GET, including its native fallback.
  assert.ok(!/method="post"/i.test(form));
  assert.ok(!form.includes('name="page"'));
  for (const value of ["agent", "status", "ALLOW", "FAILED"]) assert.ok(form.includes(`value="${value}" selected=""`));
  for (const name of ["from", "to"]) assert.ok(form.includes(`value="${params[name as "from" | "to"]}"`));
  assert.match(form.replace(/<svg\b[\s\S]*?<\/svg>/g, ""), /href="\/audit"[^>]*>Reset filters/);
});

test("Gateway pagination preserves every applied filter and slices invocation rows", () => {
  const snapshot = parse(Array.from({ length: 205 }, (_, index) => normal("SUCCEEDED", (index + 1).toString(16).padStart(32, "0"))).flat());
  const params = { agent: "agent", tool: "status", authorization: "ALLOW", execution: "SUCCEEDED", from: "2026-10-24T11:59", to: "2026-10-24T12:01", page: "2" };
  const html = renderToStaticMarkup(<GatewayExplorer snapshot={snapshot} source={{ kind: "gateway", label: "test", status: "ready" }} params={params} />);
  assert.ok(html.includes("205 matching invocations · page 2"));
  assert.equal((html.match(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/)?.[0].match(/<tr\b/g) ?? []).length, 100);
  const links = [...html.matchAll(/href="([^\"]+)"[^>]*>(Previous|Next)<\/a>/g)];
  assert.equal(links.length, 2);
  for (const [index, link] of links.entries()) {
    const url = new URL(link[1].replaceAll("&amp;", "&"), "http://localhost");
    for (const [name, value] of Object.entries(params)) if (name !== "page") assert.equal(url.searchParams.get(name), value);
    assert.equal(url.searchParams.get("page"), index === 0 ? "1" : "3");
  }
});

test("unfiltered Gateway form renders all dropdowns at All and empty date fields", () => {
  const html = renderToStaticMarkup(<GatewayExplorer snapshot={parse(normal())} source={{ kind: "gateway", label: "test", status: "ready" }} params={{}} />);
  assert.equal((html.match(/<option value="" selected="">All<\/option>/g) ?? []).length, 4);
  assert.equal((html.match(/type="datetime-local"[^>]*value=""/g) ?? []).length, 2);
  assert.ok(html.includes("1 matching invocations · page 1"));
});

test("secure file ingestion: valid, missing, unreadable, oversize, symlinks, directories and excessive records", async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "t07-ingest-")));
  try {
    const file = path.join(directory, "audit.jsonl");
    await writeFile(file, normal().map(record => JSON.stringify(record)).join("\n") + "\n");
    assert.equal((await readGatewayAudit(file)).metrics.total, 1);
    await assert.rejects(readGatewayAudit(path.join(directory, "missing")), { code: "SOURCE_MISSING" });
    await chmod(file, 0); await assert.rejects(readGatewayAudit(file), { code: "SOURCE_UNREADABLE" }); await chmod(file, 0o600);
    const link = path.join(directory, "link"); await symlink(file, link); await assert.rejects(readGatewayAudit(link), { code: "UNSAFE_PATH" });
    const parentLink = path.join(directory, "parent-link"); await symlink(directory, parentLink); await assert.rejects(readGatewayAudit(path.join(parentLink, "audit.jsonl")), { code: "UNSAFE_PATH" });
    await assert.rejects(readGatewayAudit(directory), { code: "UNSAFE_PATH" });
    await writeFile(file, Buffer.alloc(AUDIT_LIMITS.fileBytes + 1)); await assert.rejects(readGatewayAudit(file), { code: "SOURCE_TOO_LARGE" });
    const record = JSON.stringify(event("invocation_received")) + "\n";
    await writeFile(file, record.repeat(AUDIT_LIMITS.records + 1)); await assert.rejects(readGatewayAudit(file), { code: "TOO_MANY_RECORDS" });
    assert.throws(() => parseGatewayJsonl(Buffer.from(JSON.stringify({ x: "x".repeat(AUDIT_LIMITS.lineBytes) }) + "\n")), { code: "RECORD_TOO_LARGE" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("missing/invalid real source never substitutes fixtures or displays successful zero metrics", async () => {
  for (const sourcePath of [undefined, "/T07_PRIVATE_FILESYSTEM_SENTINEL/no-such-file"]) {
    const provider = new GatewayAuditProvider(sourcePath);
    const snapshot = await provider.getSnapshot();
    assert.equal(snapshot.source.status, "unavailable"); assert.equal(snapshot.gateway!.invocations.length, 0); assert.equal(snapshot.policy, null);
    const html = renderToStaticMarkup(<GatewayOverview snapshot={snapshot.gateway!} source={snapshot.source} />);
    assert.ok(html.includes("Gateway audit unavailable")); assert.ok(!html.includes("Successful executions")); assert.ok(!JSON.stringify(snapshot).includes("T07_PRIVATE_FILESYSTEM_SENTINEL"));
  }
  const snapshot = await new GatewayAuditProvider(undefined, "INVALID_SOURCE_MODE").getSnapshot();
  assert.equal(snapshot.source.status, "error");
  assert.ok(renderToStaticMarkup(<GatewayOverview snapshot={snapshot.gateway!} source={snapshot.source} />).includes("Audit source error"));
});
test("Console has no mutation/execution route handlers or unsafe HTML rendering", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(path.join(process.cwd(), "src/app"), { recursive: true });
  assert.ok(!files.some(file => /route\.(ts|js)$/.test(file)));
  const components = await readFile("src/components/tables/gateway-audit.tsx", "utf8");
  assert.ok(!components.includes("dangerouslySetInnerHTML"));
  const provider = await readFile("src/lib/providers/index.ts", "utf8");
  assert.ok(provider.includes('mode === "fixtures"'));
  assert.ok(!provider.includes("searchParams"));
});

test("projected response size is bounded even within file and record limits", () => {
  const records = Array.from({ length: AUDIT_LIMITS.records }, (_, index) => event("authorization_decision", "UNKNOWN", { invocation_id: (index + 1).toString(16).padStart(32, "0"), agent_id: "a".repeat(128), run_id: "r".repeat(128), tool_id: "t".repeat(128), tool: "t".repeat(128), required_scope: "s".repeat(128), request_id: "c".repeat(128) }));
  assert.throws(() => parse(records), { code: "VIEW_TOO_LARGE" });
});
