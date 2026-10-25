// P5 acceptance evidence. Synthetic records remain separate from real integration.
import assert from "node:assert/strict";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyAcceptance(browser, base, audit, browserName) {
  const directory = process.env.AGENTTRUST_ACCEPTANCE_EVIDENCE_DIR;
  if (!directory) throw new Error("Set AGENTTRUST_ACCEPTANCE_EVIDENCE_DIR");
  await mkdir(directory, { recursive: true });
  const original = await readFile(audit);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [], matrix = [], screenshots = [], observations = [];
  page.on("pageerror", error => errors.push(error.message));
  const routes = [["/", "overview", "/"], ["/agents", "agents", "/agents"], ["/agents/filter-agent", "agent-detail", "/agents"], ["/runs", "runs", "/runs"], ["/runs/filter-run", "run-detail", "/runs"], ["/audit", "audit", "/audit"], ["/invocations/00000000000000000000000000000005", "invocation-detail", "/audit"], ["/tools", "tools", "/tools"], ["/tools/http_status", "tool-detail", "/tools"], ["/policies", "policies", "/policies"]];
  try {
    // Add failure/unknown/incomplete/conflict evidence to a compact nine-invocation stream.
    let records = original.toString().trim().split("\n").map(line => JSON.parse(line)).filter(event => parseInt(event.invocation_id, 16) <= 9);
    records = records.filter(event => !(parseInt(event.invocation_id, 16) === 7 && event.event_type === "execution_result"));
    for (const event of records) {
      const id = parseInt(event.invocation_id, 16);
      event.required_scope = ["service:read", "service:write", "service:inspect"][id % 3];
      if (event.event_type === "execution_result" && [5, 6].includes(id)) {
        event.execution_status = id === 5 ? "FAILED" : "UNKNOWN";
        event.result_status = id === 5 ? "error" : "unknown";
        event.reason = id === 5 ? "upstream_error" : "upstream_timeout";
      }
    }
    records.push({ ...records.find(event => parseInt(event.invocation_id, 16) === 8 && event.event_type === "execution_result"), event_id: "f".repeat(32), execution_status: "FAILED", result_status: "error", reason: "upstream_error" });
    const fixture = records.map(event => JSON.stringify(event)).join("\n") + "\n";
    await writeFile(audit, fixture);
    await page.goto(base);
    for (const theme of ["obsidian", "light"]) {
      await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled);
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /^Switch to/ }).click();
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const [route, name, section] of routes) {
          const response = await page.goto(base + route);
          assert.equal(response.status(), 200);
          assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
          assert.equal(await page.locator("#console-navigation a[data-active=true]").getAttribute("href"), section);
          assert.equal(await page.getByRole("banner").count(), 1);
          assert.equal(await page.getByRole("main").count(), 1);
          assert.ok(await page.getByRole("main").getByRole("heading").count() > 0);
          if (await page.locator("h1").count() === 0 && observations.length === 0) observations.push("No h1: page titles start at h2 (pre-existing); no WCAG conformance claim.");
          assert.equal(await page.locator(".ui-table th:not([scope=col])").count(), 0);
          assert.ok(await page.locator("input,select").evaluateAll(els => els.every(el => el.labels?.length > 0 || el.getAttribute("aria-label"))));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.keyboard.press("Tab");
          const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, outline: getComputedStyle(document.activeElement).outlineWidth }));
          assert.equal(focus.tag, "A");
          assert.ok(parseFloat(focus.outline) >= 2);
          await page.evaluate(() => document.activeElement?.blur());
          matrix.push({ route, theme, width, rendering: "PASS", navigation: "PASS", responsive: "PASS", landmarksLabelsHeaders: "PASS", keyboardSkipFocus: "PASS" });
          const file = `${browserName}-${name}-${theme}-${width}.png`;
          await page.screenshot({ path: path.join(directory, file) });
          screenshots.push({ file, route, theme, width, source: "synthetic UI fixture" });
        }
      }
      for (const [state, data, title] of [["empty", "", "No observed invocations"], ["invalid", "invalid JSON\n", "Audit source error"], ["missing", null, "Gateway audit unavailable"]]) {
        if (data === null) await rename(audit, audit + ".p5-backup"); else await writeFile(audit, data);
        try {
          for (const [route] of routes) {
            const response = await page.goto(base + route);
            if (route === "/policies") continue; // This page reports policy non-ingestion independently.
            const text = await page.locator("main").innerText();
            if (state !== "empty") {
              assert.ok(text.includes(title), `${state} ${route}`);
              assert.equal(await page.locator(".ui-metric-value").count(), 0);
            } else if (["/", "/audit"].includes(route)) assert.ok(text.includes(title));
            else if (route.startsWith("/invocations/")) assert.equal(response.status(), 404);
            else if (route.includes("/filter-") || route.includes("/http_status")) assert.ok(/Not Observed/.test(text));
            else assert.ok(text.includes({ "/agents": "No Observed Agents", "/runs": "No Observed Runs", "/tools": "No Observed Tools" }[route]));
            matrix.push({ route, theme, state, result: "PASS" });
          }
          await page.goto(base);
          const file = `${browserName}-${state}-${theme}.png`;
          await page.screenshot({ path: path.join(directory, file) });
          screenshots.push({ file, route: "/", theme, width: 320, state, source: "synthetic UI fixture" });
        } finally { if (data === null) await rename(audit + ".p5-backup", audit); }
      }
      await writeFile(audit, fixture);
      await page.goto(base + "/audit?authorization=DENY&execution=SUCCEEDED");
      await page.getByText("No matching invocations", { exact: true }).waitFor();
      assert.equal(await page.locator("tbody tr").count(), 0);
      await page.goto(base + "/audit");
      const agentControl = page.getByLabel("Agent", { exact: true });
      await agentControl.focus(); await agentControl.press("f"); await agentControl.press("Tab");
      assert.equal(await agentControl.inputValue(), "filter-agent");
      await page.getByRole("button", { name: "Apply filters", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(/agent=filter-agent/);
      await page.getByRole("link", { name: "Reset filters", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(base + "/audit");
      for (const selector of ['button[type="submit"]', 'select[name="agent"]']) {
        const control = page.locator(selector);
        await control.evaluate(el => { el.disabled = true; });
        assert.equal(await control.evaluate(el => getComputedStyle(el).cursor), "not-allowed");
        assert.equal(await control.isDisabled(), true);
        await control.evaluate(el => { el.disabled = false; });
      }
      // Effective layout widths for 200% and 400% reflow, NOT native browser zoom UI.
      for (const width of [720, 360]) {
        await page.setViewportSize({ width, height: 600 });
        for (const [route] of routes) { await page.goto(base + route); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
      }
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(directory, `${browserName}-acceptance.json`), JSON.stringify({ browser: browserName, version: browser.version(), matrix, screenshots, observations, nativeZoom: "NOT VERIFIED", screenReader: "NOT VERIFIED", errors }, null, 2));
    console.log(`PASS: ${browserName} P5 100 route/theme/viewport checks, per-route source states, labels/landmarks/headers, keyboard skip focus, 200%/400%-equivalent reflow and ${screenshots.length} screenshots`);
  } finally { await writeFile(audit, original); await context.close(); }
}
