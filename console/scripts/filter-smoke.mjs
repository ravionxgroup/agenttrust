// Uses the existing externally supplied Playwright setup, not a new dependency.
// Synthetic audit records exercise UI behavior only, not Gateway interoperability.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = await import(process.env.AGENTTRUST_PLAYWRIGHT_MODULE ?? "playwright");
const directory = await realpath(await mkdtemp(path.join(tmpdir(), "agenttrust-filter-smoke-")));
let server, browser;
try {
  let serial = 0;
  const records = [];
  for (let index = 0; index < 230; index++) {
    const denied = index < 4;
    const stages = denied ? ["invocation_received", "authorization_decision"]
      : ["invocation_received", "authorization_decision", "execution_attempted", "execution_result"];
    for (const stage of stages) records.push({
      schema_version: 1, event_id: (++serial).toString(16).padStart(32, "0"),
      invocation_id: (index + 1).toString(16).padStart(32, "0"),
      timestamp: `2026-10-24T12:${denied ? String(index).padStart(2, "0") : "10"}:00Z`,
      event_type: stage, request_id: "filter-test", agent_id: stage === "invocation_received" ? "" : "filter-agent",
      run_id: stage === "invocation_received" ? "" : "filter-run", token_id: "",
      tool_id: denied ? "http_restart" : "http_status", tool: denied ? "http_restart" : "http_status",
      authorization_decision: stage === "invocation_received" ? "UNKNOWN" : denied ? "DENY" : "ALLOW",
      execution_status: denied && stage === "authorization_decision" ? "NOT_EXECUTED" : stage === "execution_result" ? "SUCCEEDED" : "UNKNOWN",
      decision: stage === "invocation_received" ? "" : denied ? "deny" : "allow",
      result_status: stage === "authorization_decision" ? "not_executed" : stage === "execution_result" ? "ok" : "unknown",
      reason: denied ? "scope_not_granted" : "execution_ok",
    });
  }
  const audit = path.join(directory, "audit.jsonl");
  await writeFile(audit, records.map(record => JSON.stringify(record)).join("\n") + "\n");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", AGENTTRUST_CONSOLE_SOURCE: "gateway", AGENTTRUST_GATEWAY_AUDIT_PATH: audit },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  const log = chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); };
  server.stdout.on("data", log);
  server.stderr.on("data", log);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Console exited before readiness: " + diagnostics);
    try { ready = (await fetch(base + "/audit")).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Console readiness timed out: " + diagnostics);
  browser = await chromium.launch({ headless: true, ...(process.env.AGENTTRUST_BROWSER_EXECUTABLE ? { executablePath: process.env.AGENTTRUST_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const fields = { agent: "", tool: "", authorization: "", execution: "", from: "", to: "" };
  async function controls(expected = {}) {
    for (const [name, value] of Object.entries({ ...fields, ...expected })) {
      await page.locator(`[name="${name}"]`).waitFor();
      try {
        await page.waitForFunction(({ name, value }) => document.querySelector(`[name="${name}"]`)?.value === value, { name, value });
      } catch {
        assert.equal(await page.locator(`[name="${name}"]`).inputValue(), value, `visible ${name} must match applied filters`);
      }
    }
  }
  async function count(total, currentPage = 1, rows = Math.min(total, 100)) {
    await page.getByText(`${total} matching invocations · page ${currentPage}. Filters do not change lifecycle correlation.`, { exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), rows);
  }
  async function apply() {
    await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Apply filters", exact: true }).click()]);
    assert.equal(new URL(page.url()).searchParams.has("page"), false, "Apply must drop pagination");
  }
  async function reset() {
    await page.getByRole("link", { name: "Reset filters", exact: true }).click();
    await page.waitForURL(base + "/audit");
    await controls();
    await count(230);
  }
  await page.goto(base + "/audit");
  assert.ok((await page.locator("body").innerText()).includes("230 matching invocations"), "UI fixture must load as 230 valid invocations");
  await controls();
  await count(230);
  await page.getByLabel("Authorization", { exact: true }).selectOption("DENY");
  await apply();
  await controls({ authorization: "DENY" });
  await count(4);
  await reset();
  console.log("PASS: authorization filter and reset");

  await page.getByLabel("Tool", { exact: true }).selectOption("http_restart");
  await apply();
  await controls({ tool: "http_restart" });
  await count(4);
  await reset();
  console.log("PASS: tool filter and reset");

  const combined = { agent: "filter-agent", tool: "http_restart", authorization: "DENY", execution: "NOT_EXECUTED", from: "2026-10-24T12:01", to: "2026-10-24T12:02" };
  for (const name of ["agent", "tool", "authorization", "execution"]) await page.locator(`[name="${name}"]`).selectOption(combined[name]);
  for (const name of ["from", "to"]) await page.locator(`[name="${name}"]`).fill(combined[name]);
  await apply();
  await controls(combined);
  await count(2);
  await reset();
  console.log("PASS: combined filters, inclusive UTC date range and all six reset controls");

  // Same URL: the server key does not change; Reset must clear local drafts.
  await page.getByLabel("Tool", { exact: true }).selectOption("http_restart");
  await page.getByLabel("Authorization", { exact: true }).selectOption("DENY");
  await page.locator('[name="from"]').fill(combined.from);
  await reset();
  console.log("PASS: same-URL reset clears unapplied edits");

  await page.getByLabel("Authorization", { exact: true }).selectOption("ALLOW");
  await apply();
  await count(226);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await page.waitForURL(/page=2/);
  await count(226, 2, 100);
  await controls({ authorization: "ALLOW" });
  assert.equal(new URL(page.url()).searchParams.get("authorization"), "ALLOW");
  await page.goBack();
  await count(226);
  await controls({ authorization: "ALLOW" });
  await page.goForward();
  await count(226, 2, 100);
  await controls({ authorization: "ALLOW" });
  await page.getByLabel("Authorization", { exact: true }).selectOption("DENY");
  await apply();
  await count(4);
  await controls({ authorization: "DENY" });
  // Return to the page whose draft was DENY but whose applied filter was ALLOW.
  await page.goBack();
  await count(226, 2, 100);
  await controls({ authorization: "ALLOW" });
  await page.goForward();
  await count(4);
  await controls({ authorization: "DENY" });
  await reset();
  await page.goBack();
  await count(4);
  await controls({ authorization: "DENY" });
  await page.goForward();
  await count(230);
  await controls();
  console.log("PASS: pagination preserves filters, Apply returns to page 1, Back/Forward restore controls and results");
  const native = await browser.newPage({ javaScriptEnabled: false });
  await native.goto(base + "/audit");
  await native.getByLabel("Authorization", { exact: true }).selectOption("DENY");
  await Promise.all([native.waitForNavigation(), native.getByRole("button", { name: "Apply filters", exact: true }).click()]);
  assert.equal(new URL(native.url()).searchParams.get("authorization"), "DENY");
  assert.equal(await native.locator("tbody tr").count(), 4);
  await Promise.all([native.waitForNavigation(), native.getByRole("link", { name: "Reset filters", exact: true }).click()]);
  assert.equal(new URL(native.url()).search, "");
  assert.equal(await native.getByLabel("Authorization", { exact: true }).inputValue(), "");
  assert.ok((await native.locator("body").innerText()).includes("230 matching invocations"));
  await native.close();
  console.log("PASS: native GET filtering and reset with JavaScript disabled");
  assert.deepEqual(errors, []);
  console.log("PASS: no browser runtime errors");
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(timeout);
  }
  await rm(directory, { recursive: true, force: true });
}
