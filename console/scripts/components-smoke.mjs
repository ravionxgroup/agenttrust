// Uses filter-smoke.mjs's temporary UI-only fixture, never Gateway storage.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function verifyComponents(browser, base, audit, phase = "after") {
  const directory = process.env.AGENTTRUST_COMPONENT_EVIDENCE_DIR;
  if (!directory) throw new Error("Set AGENTTRUST_COMPONENT_EVIDENCE_DIR for before/after evidence");
  await mkdir(directory, { recursive: true });
  const original = await readFile(audit);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  context.on("page", page => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  });
  const page = await context.newPage();
  const toggle = page.getByRole("button", { name: /^Switch to (Light|Obsidian) theme$/ });
  const expected = {
    "Observed invocations": "9", "Allowed invocations": "4", "Denied invocations": "4", "Successful executions": "1",
    "Failed executions": "1", "Unknown execution outcomes": "3", "Incomplete lifecycles": "1", "Conflicting evidence": "1",
  };
  const report = {};
  async function ready() { await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled); }
  async function overflow() { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no document overflow"); }
  try {
    // A compact synthetic stream covers all metric categories and badge states.
    let records = original.toString().trim().split("\n").map(line => JSON.parse(line)).filter(event => parseInt(event.invocation_id, 16) <= 9);
    records = records.filter(event => !(parseInt(event.invocation_id, 16) === 7 && event.event_type === "execution_result"));
    for (const event of records) {
      if (event.event_type !== "execution_result") continue;
      const id = parseInt(event.invocation_id, 16);
      if (id === 5 || id === 6) {
        event.execution_status = id === 5 ? "FAILED" : "UNKNOWN";
        event.result_status = id === 5 ? "error" : "unknown";
        event.reason = id === 5 ? "upstream_error" : "upstream_timeout";
      }
    }
    const conflicting = records.find(event => parseInt(event.invocation_id, 16) === 8 && event.event_type === "execution_result");
    records.push({ ...conflicting, event_id: "f".repeat(32), execution_status: "FAILED", result_status: "error", reason: "upstream_error" });
    await writeFile(audit, records.map(event => JSON.stringify(event)).join("\n") + "\n");
    await page.goto(base);
    await ready();
    for (const theme of ["obsidian", "light"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await toggle.click();
      await page.goto(base);
      await ready();
      const values = page.locator(".ui-metric-value");
      assert.equal(await values.count(), 8);
      const cards = [];
      for (const [label, value] of Object.entries(expected)) {
        const card = page.locator(".ui-metric-card").filter({ has: page.getByText(label, { exact: true }) });
        assert.equal(await card.locator(".ui-metric-value").innerText(), value);
        cards.push(await card.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const value = el.querySelector(".ui-metric-value");
          const style = getComputedStyle(value);
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, padding: getComputedStyle(el).paddingTop, fontSize: style.fontSize, numerals: style.fontVariantNumeric };
        }));
      }
      assert.equal(new Set(cards.map(card => card.x)).size, 4);
      assert.equal(new Set(cards.map(card => card.y)).size, 2);
      if (phase === "after") {
        for (const card of cards) {
          assert.ok(card.height >= 96 && card.height <= 120, `compact height: ${card.height}`);
          assert.equal(card.numerals, "tabular-nums");
          assert.ok(parseFloat(card.fontSize) >= 26 && parseFloat(card.fontSize) <= 30);
        }
      }
      report[theme] = { values: expected, cards, valueBoxes: await values.evaluateAll(elements => elements.map(el => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: getComputedStyle(el).overflowY }))) };
      if (process.env.AGENTTRUST_SMOKE_SCREENSHOTS !== "0") await page.screenshot({ path: path.join(directory, `overview-${phase}-${theme}.png`) });
      await overflow();
      if (phase === "before") continue;

      // Every authorization/execution/integrity badge remains independently readable.
      const heights = [];
      for (const label of ["ALLOW", "DENY", "SUCCEEDED", "FAILED", "UNKNOWN", "NOT EXECUTED", "Incomplete", "Conflicting evidence"]) {
        const badge = page.locator("tbody").getByText(label, { exact: true }).first();
        assert.equal(await badge.isVisible(), true);
        heights.push((await badge.boundingBox()).height);
      }
      assert.equal(new Set(heights).size, 1, `consistent badge heights: ${heights}`);

      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(base);
        await ready();
        assert.equal(await values.count(), 8);
        const clipping = await values.evaluateAll(elements => elements.some(el => {
          const style = getComputedStyle(el);
          // Firefox includes font ink outside the line box in scrollHeight even
          // with overflow:visible. Only hidden/clip overflow can cut that ink.
          return el.scrollWidth > el.clientWidth + 1 || (el.scrollHeight > el.clientHeight + 1 && ["hidden", "clip"].includes(style.overflowY)) || el.getBoundingClientRect().top + el.scrollHeight > el.closest("section").getBoundingClientRect().bottom - 4;
        }));
        assert.equal(clipping, false, `${theme} metric values must not clip at ${width}`);
        await overflow();
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(base + "/runs/filter-run");
      const first = page.getByText("First Observed Event", { exact: true }).locator("xpath=ancestor::section[1]");
      assert.equal(await first.evaluate(el => [...el.querySelectorAll("div")].some(child => child.title && getComputedStyle(child).textOverflow === "ellipsis")), false);
      assert.ok(await first.evaluate(el => [...el.querySelectorAll("div")].filter(child => child.title).every(child => child.scrollWidth <= child.clientWidth + 1)));
      if (process.env.AGENTTRUST_SMOKE_SCREENSHOTS !== "0") await page.screenshot({ path: path.join(directory, `run-${theme}.png`) });
      await page.goto(base + "/invocations/00000000000000000000000000000005");
      await page.getByRole("heading", { name: "Invocation details", exact: true }).waitFor();
      assert.equal(await page.getByText("FAILED", { exact: true }).first().isVisible(), true);
      if (process.env.AGENTTRUST_SMOKE_SCREENSHOTS !== "0") await page.screenshot({ path: path.join(directory, `invocation-${theme}.png`) });
      await page.goto(base + "/policies");
      await page.getByRole("heading", { name: "Policy Unavailable", exact: true }).waitFor();
      assert.equal(await page.getByText("Gateway policy is not ingested", { exact: true }).isVisible(), true);
      assert.equal(await page.getByText("Gateway mode displays audit evidence only; policy configuration is not loaded by this viewer.", { exact: true }).isVisible(), true);
      const indicator = page.getByText("Gateway policy is not ingested", { exact: true }).locator("..");
      assert.equal(await indicator.locator(".text-accent,.text-success,.bg-accent,.bg-success").count(), 0);
      if (process.env.AGENTTRUST_SMOKE_SCREENSHOTS !== "0") await page.screenshot({ path: path.join(directory, `policies-${theme}.png`) });
    }
    if (phase === "after") {
      // The same source states stay distinct from successful zero metrics.
      await writeFile(audit, "");
      await page.goto(base);
      assert.equal(await page.locator(".ui-metric-value").count(), 8);
      await page.getByText("No observed invocations", { exact: true }).waitFor();
      await page.goto(base + "/audit?authorization=DENY");
      await page.getByText("No matching invocations", { exact: true }).waitFor();
      await writeFile(audit, "invalid JSON\n");
      await page.goto(base);
      await page.getByRole("heading", { name: "Audit source error", exact: true }).waitFor();
      assert.equal(await page.locator(".ui-metric-value").count(), 0);
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(directory, `metrics-${phase}.json`), JSON.stringify(report, null, 2));
    console.log(`PASS: ${phase} Overview evidence and all eight metric values in both themes${phase === "after" ? "; compact dimensions, responsive clipping, badge heights, details, policy limitation and empty/error states" : ""}`);
  } finally {
    await writeFile(audit, original);
    await context.close();
  }
}
