// Presentation evidence using only the runner-owned synthetic audit file.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyData(browser, base, audit) {
  const original = await readFile(audit);
  const directory = process.env.AGENTTRUST_DATA_EVIDENCE_DIR;
  if (directory) await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const agent = "agent-" + "a".repeat(110), run = "run-" + "r".repeat(110), tool = "http-" + "t".repeat(110);
  const scopes = ["service:read", "service:write", "service:inspect"];
  async function noOverflow() {
    const state = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, outside: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest(".ui-table-scroll")).slice(0, 8).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })) }));
    assert.ok(state.scroll <= state.width + 1, `no page overflow: ${page.url()} ${JSON.stringify(state)}`);
  }
  try {
    const records = original.toString().trim().split("\n").map(line => JSON.parse(line)).filter(event => parseInt(event.invocation_id, 16) <= 9);
    for (const event of records) {
      const id = parseInt(event.invocation_id, 16);
      if (event.agent_id) event.agent_id = agent;
      if (event.run_id) event.run_id = run;
      if (event.tool === "http_status") event.tool = event.tool_id = tool;
      event.required_scope = scopes[id % 3];
      if (event.event_type === "execution_result" && [5, 6].includes(id)) {
        event.execution_status = id === 5 ? "FAILED" : "UNKNOWN";
        event.result_status = id === 5 ? "error" : "unknown";
        event.reason = id === 5 ? "upstream_error" : "upstream_timeout";
      }
    }
    await writeFile(audit, records.map(event => JSON.stringify(event)).join("\n") + "\n");
    const routes = ["/", "/agents", `/agents/${agent}`, "/runs", `/runs/${run}`, "/audit", "/invocations/00000000000000000000000000000005", "/tools", `/tools/${tool}`, "/policies"];
    await page.goto(base);
    for (const theme of ["obsidian", "light"]) {
      await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled);
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /^Switch to/ }).click();
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of routes) {
          assert.equal((await page.goto(base + route)).status(), 200);
          await noOverflow();
          assert.equal(await page.locator(".ui-table th:not([scope=col])").count(), 0);
          assert.ok(await page.locator(".ui-numeric").evaluateAll(elements => elements.every(el => getComputedStyle(el).textAlign === "right" && getComputedStyle(el).fontVariantNumeric.includes("tabular-nums"))));
          for (const table of await page.locator(".ui-table").all()) {
            const region = table.locator("xpath=..");
            assert.equal(await region.getAttribute("role"), "region");
            assert.equal(await region.getAttribute("tabindex"), "0");
            assert.ok(await region.getAttribute("aria-label"));
          }
          if (route === `/runs/${run}`) {
            const auth = await page.locator(".ui-timeline-authorization .ui-badge").evaluateAll(els => els.map(el => el.getBoundingClientRect().x));
            const execution = await page.locator(".ui-timeline-execution .ui-badge").evaluateAll(els => els.map(el => el.getBoundingClientRect().x));
            assert.equal(auth.length, 9);
            assert.ok(Math.max(...auth) - Math.min(...auth) <= 1, "stable authorization column");
            assert.ok(Math.max(...execution) - Math.min(...execution) <= 1, "stable execution column");
            const a = await page.locator(".ui-timeline-authorization").first().boundingBox(), e = await page.locator(".ui-timeline-execution").first().boundingBox();
            if (width >= 768) assert.ok(e.x > a.x && Math.abs(e.y - a.y) <= 1);
            else assert.ok(e.y > a.y, "labeled stacked groups");
            assert.equal(await page.getByText(run, { exact: true }).first().textContent(), run);
          }
          if (width === 1440 && directory && ["/audit", `/runs/${run}`, `/tools/${tool}`].includes(route)) {
            const name = route === "/audit" ? "audit" : route.startsWith("/runs/") ? "run" : "tool";
            await page.screenshot({ path: path.join(directory, `${name}-${theme}.png`) });
          }
        }
      }
      await page.goto(base + "/tools");
      await page.getByRole("link", { name: `View all 3 observed scopes for ${tool}`, exact: true }).click();
      await page.waitForURL(base + `/tools/${tool}`);
      for (const scope of scopes) assert.equal(await page.getByText(scope, { exact: true }).first().isVisible(), true);
      assert.equal(await page.getByText(tool, { exact: true }).first().textContent(), tool);
      await page.goto(base + "/audit");
      const region = page.getByRole("region", { name: "Gateway invocations", exact: true });
      await page.keyboard.press("Tab"); await region.focus();
      assert.ok(await region.evaluate(el => getComputedStyle(el).outlineStyle === "solid"));
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector('[aria-label="Gateway invocations"]').scrollLeft > 0);
      await noOverflow();
      // 200%-equivalent layout reflow: 1440 physical pixels -> 720 CSS pixels.
      // Native browser zoom controls are not exercised by this headless check.
      await page.setViewportSize({ width: 720, height: 500 });
      for (const route of ["/audit", `/runs/${run}`, `/tools/${tool}`]) { await page.goto(base + route); await noOverflow(); }
    }
    assert.deepEqual(errors, []);
    console.log("PASS: P4-B ten routes/both themes at 1440/768/390/320; numeric alignment, scoped headers, long IDs, aligned/stacked timeline columns, scope discovery, keyboard local scroll and 200%-equivalent reflow; no runtime errors");
  } finally { await writeFile(audit, original); await context.close(); }
}
