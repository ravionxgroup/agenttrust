// Read-only P5 comparison against an existing local Console and safe projection.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(process.env.AGENTTRUST_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.AGENTTRUST_CONSOLE_URL ?? "http://127.0.0.1:3000";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Use a loopback Console URL");
const directory = process.env.AGENTTRUST_REAL_EVIDENCE_DIR;
if (!directory) throw new Error("Set AGENTTRUST_REAL_EVIDENCE_DIR containing projected.json");
const expected = JSON.parse(await readFile(path.join(directory, "projected.json"), "utf8"));
const browser = await chromium.launch({ headless: true, ...(process.env.AGENTTRUST_BROWSER_EXECUTABLE ? { executablePath: process.env.AGENTTRUST_BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], checks = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const m = expected.metrics;
  const values = { "Observed invocations": m.total, "Allowed invocations": m.allowed, "Denied invocations": m.denied, "Successful executions": m.succeeded, "Failed executions": m.failed, "Unknown execution outcomes": m.unknown, "Incomplete lifecycles": m.incomplete, "Conflicting evidence": m.conflicting };
  const identity = expected.invocations.find(i => i.agentId && i.runId && i.tool);
  assert.ok(identity, "existing real audit evidence must include identities");
  const routes = ["/", "/agents", `/agents/${encodeURIComponent(identity.agentId)}`, "/runs", `/runs/${encodeURIComponent(identity.runId)}`, "/audit", `/invocations/${identity.invocationId}`, "/tools", `/tools/${encodeURIComponent(identity.tool)}`, "/policies"];
  await page.goto(base);
  for (const theme of ["obsidian", "light"]) {
    await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled);
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /^Switch to/ }).click();
    await page.goto(base);
    for (const [label, value] of Object.entries(values)) {
      const card = page.locator(".ui-metric-card").filter({ has: page.getByText(label, { exact: true }) });
      assert.equal(await card.locator(".ui-metric-value").innerText(), new Intl.NumberFormat("en-US").format(value));
    }
    assert.ok((await page.locator("main").innerText()).includes(`${expected.recordCount} persisted records`));
    for (const route of routes) {
      assert.equal((await page.goto(base + route)).status(), 200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const html = await page.content();
      assert.ok(!/Bearer\s+[A-Za-z0-9_.-]+|-----BEGIN .*PRIVATE KEY-----|\/var\/lib\/agenttrust|\/Users\//.test(html));
      checks.push({ routeKind: route.split("/")[1] || "overview", theme, result: "PASS" });
    }
    await page.goto(base + "/audit");
    for (const invocation of expected.invocations) {
      const row = page.getByRole("link", { name: invocation.invocationId, exact: true }).locator("xpath=ancestor::tr[1]");
      assert.equal(await row.locator("td").nth(4).locator(".ui-badge").innerText(), invocation.authorization);
      assert.equal(await row.locator("td").nth(5).locator(".ui-badge").innerText(), invocation.execution.replaceAll("_", " "));
      assert.equal(await row.locator("time").getAttribute("datetime"), invocation.timestamp);
    }
    await page.getByLabel("Authorization", { exact: true }).selectOption("DENY");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await page.waitForURL(/authorization=DENY/);
    assert.equal(await page.locator("tbody tr").count(), expected.invocations.filter(i => i.authorization === "DENY").length);
    await page.goto(base + `/invocations/${identity.invocationId}`);
    for (const event of identity.events) assert.ok((await page.locator("main").innerText()).includes(event.event_id));
  }
  assert.deepEqual(errors, []);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "result.json"), JSON.stringify({ source: "existing live persisted Gateway audit, no tool calls or credentials created", records: expected.recordCount, invocations: expected.invocations.length, metrics: expected.metrics, routes: checks, fullInvocationAndEventIdsMatch: true, credentialsOrServerPathsInHtml: false, errors }, null, 2));
  console.log(`PASS: real persisted ${expected.recordCount} events / ${expected.invocations.length} invocations, eight metrics, authorization/execution, original timestamps, event IDs, filters, ten routes and both themes; no mutation or credential issuance`);
} finally { await browser.close(); }
