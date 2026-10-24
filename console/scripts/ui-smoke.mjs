// Browser smoke runner. Playwright is supplied externally, not a production dependency.
import assert from "node:assert/strict";
import { readFile, rename, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.AGENTTRUST_PLAYWRIGHT_MODULE ?? "playwright");
const base = process.env.AGENTTRUST_CONSOLE_URL ?? "http://127.0.0.1:3107";
const evidencePath = process.env.AGENTTRUST_T07_EVIDENCE_DIR;
if (!evidencePath) throw new Error("Set the temporary T07 integration evidence directory");
const expected = JSON.parse(await readFile(`${evidencePath}/expected.json`, "utf8"));
const auditPath = `${evidencePath}/gateway-audit.jsonl`;
const initial = await readFile(auditPath);
const browser = await chromium.launch({ headless: true, ...(process.env.AGENTTRUST_BROWSER_EXECUTABLE ? { executablePath: process.env.AGENTTRUST_BROWSER_EXECUTABLE } : {}) });
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => failures.push(error.message));
  await page.goto(base);
  await page.getByRole("heading", { name: "Gateway execution overview", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /18 persisted records/);
  assert.equal(await page.locator("tbody tr").count(), 5);
  for (const id of Object.keys(expected.invocations)) assert.equal(await page.getByRole("link", { name: id, exact: true }).count(), 1);
  await page.screenshot({ path: `${evidencePath}/overview-desktop.png`, fullPage: true });
  await page.getByRole("link", { name: "Explore all invocations" }).click();
  await page.getByRole("heading", { name: "Gateway audit explorer", exact: true }).waitFor();
  await page.getByLabel("Execution", { exact: true }).selectOption("FAILED");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL(/execution=FAILED/);
  assert.equal(await page.locator("tbody tr").count(), 1);
  const failedId = Object.keys(expected.invocations).find(id => expected.invocations[id][1] === "FAILED");
  await page.getByRole("link", { name: failedId, exact: true }).click();
  await page.getByRole("heading", { name: "Invocation details", exact: true }).waitFor();
  assert.equal(await page.locator("ol > li").count(), 4);
  assert.match(await page.locator("body").innerText(), /mcp_tool_execution_error/);
  await page.getByText("Safe event metadata", { exact: true }).first().click();
  assert.match(await page.locator("pre").first().innerText(), /event_id/);
  assert.ok(!(await page.locator("body").innerText()).includes("args_redacted"));
  await page.screenshot({ path: `${evidencePath}/invocation-details.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/audit");
  await page.getByRole("heading", { name: "Gateway audit explorer", exact: true }).waitFor();
  const bounds = await page.evaluate(() => ({ viewport: window.innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(bounds.width <= bounds.viewport + 1, `mobile document overflow: ${JSON.stringify(bounds)}`);
  await page.screenshot({ path: `${evidencePath}/audit-mobile.png`, fullPage: true });
  // These operations affect only the test-artifact copy, never Gateway storage.
  await rename(auditPath, auditPath + ".smoke-backup");
  try {
    await page.goto(base);
    await page.getByRole("heading", { name: "Gateway audit unavailable", exact: true }).waitFor();
    assert.ok(!(await page.locator("body").innerText()).includes("Successful executions"));
    assert.ok(!(await page.content()).includes(auditPath));
    await page.screenshot({ path: `${evidencePath}/source-unavailable.png`, fullPage: true });
    for (const route of ["/agents", "/runs", "/tools", "/agents/deploy-agent", "/runs/missing-run", "/tools/http_ok"]) {
      await page.goto(base + route);
      await page.getByRole("heading", { name: "Gateway audit unavailable", exact: true }).waitFor();
    }
  } finally { await rename(auditPath + ".smoke-backup", auditPath); }
  await writeFile(auditPath, "malformed audit line\n");
  await page.goto(base);
  await page.getByRole("heading", { name: "Audit source error", exact: true }).waitFor();
  await writeFile(auditPath, "");
  await page.goto(base + "/audit");
  assert.match(await page.locator("body").innerText(), /No observed invocations/);
  // Unknown query paths cannot change the configured source.
  await writeFile(auditPath, initial);
  await page.goto(base + "/audit?path=/T07_PRIVATE_PATH_SENTINEL&execution=UNKNOWN");
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.ok(!(await page.locator("body").innerText()).includes("T07_PRIVATE_PATH_SENTINEL"));
  const mutation = await page.request.post(base + "/api/execute", { data: {} });
  assert.ok([404, 405].includes(mutation.status()));
  assert.deepEqual(failures, []);
  console.log("PASS: dashboard, real invocation IDs, filters, details/timeline, mobile, missing/invalid/empty source, query-path isolation, no execution endpoint, no browser runtime errors");
} finally {
  await writeFile(auditPath, initial);
  await browser.close();
}
