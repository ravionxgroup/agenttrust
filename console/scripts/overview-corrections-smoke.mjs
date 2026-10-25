import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyOverviewCorrections(browser, base, audit, browserName) {
  const original = await readFile(audit);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const routes = ["/", "/agents", "/agents/filter-agent", "/runs", "/runs/filter-run", "/audit", "/invocations/00000000000000000000000000000005", "/tools", "/tools/http_status", "/policies"];
  try {
    await page.goto(base);
    for (const theme of ["obsidian", "light"]) {
      await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled);
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /^Switch to/ }).click();
      await page.goto(base);
      const pagination = page.getByRole("navigation", { name: "Recent invocation pages" });
      assert.equal(await page.locator("tbody tr").count(), 10);
      assert.ok((await page.locator("main").innerText()).includes("Showing 1–10 of 230 invocations"));
      assert.ok(await pagination.getByRole("button", { name: "Previous" }).isDisabled());
      const firstIds = await page.locator("tbody tr td:first-child").allTextContents();
      await pagination.getByRole("link", { name: "Next", exact: true }).click();
      await page.waitForURL(/page=2/);
      assert.ok((await page.locator("main").innerText()).includes("Showing 11–20 of 230 invocations"));
      assert.equal(await pagination.getByRole("link", { name: "Page 2", exact: true }).getAttribute("aria-current"), "page");
      assert.ok((await page.locator("tbody tr td:first-child").allTextContents()).every(id => !firstIds.includes(id)));
      await page.goBack();
      await page.waitForFunction(() => document.querySelector("main")?.textContent.includes("Showing 1–10 of 230 invocations"));
      assert.ok((await page.locator("main").innerText()).includes("Showing 1–10 of 230 invocations"));
      await page.goForward();
      await page.waitForFunction(() => document.querySelector("main")?.textContent.includes("Showing 11–20 of 230 invocations"));
      assert.ok((await page.locator("main").innerText()).includes("Showing 11–20 of 230 invocations"));
      await page.reload();
      assert.ok((await page.locator("main").innerText()).includes("Showing 11–20 of 230 invocations"));
      await pagination.getByRole("link", { name: "Previous", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(/page=1/);
      await page.goto(base + "/?page=23#recent-invocations");
      assert.ok(await pagination.getByRole("button", { name: "Next" }).isDisabled());
      await page.goto(base + "/audit?page=2");
      assert.equal(await page.locator("tbody tr").count(), 100, "Audit Explorer remains 100 rows per page");
      for (const route of routes) {
        await page.goto(base + route);
        assert.equal(await page.locator("h1").evaluate(el => getComputedStyle(el).fontSize), "26px");
        assert.ok(await page.locator("body").evaluate(el => getComputedStyle(el).fontFamily.toLowerCase().includes("inter")));
        assert.ok(await page.locator(".ui-clickable-id, .ui-tech-id").evaluateAll(els => els.filter(el => !el.classList.contains("font-mono")).every(el => !getComputedStyle(el).fontFamily.includes("monospace"))));
      }
      await page.goto(base);
      const cells = page.locator("tbody tr").first().locator("td");
      assert.ok((await cells.nth(0).locator("a").evaluate(el => getComputedStyle(el).fontFamily)).includes("monospace"));
      for (const n of [1, 2, 3, 7]) assert.ok(!(await cells.nth(n).evaluate(el => getComputedStyle(el).fontFamily)).includes("monospace"));
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await pagination.scrollIntoViewIfNeeded();
        assert.ok(await pagination.isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      // Explicitly synthetic 16-invocation screenshot: never touches real storage.
      const records = original.toString().trim().split("\n").map(line => JSON.parse(line)).filter(event => parseInt(event.invocation_id, 16) <= 16);
      await writeFile(audit, records.map(event => JSON.stringify(event)).join("\n") + "\n");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(base);
      assert.ok((await page.locator("main").innerText()).includes("Showing 1–10 of 16 invocations"));
      const directory = process.env.AGENTTRUST_CORRECTIONS_EVIDENCE_DIR;
      if (directory) {
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: path.join(directory, `${browserName}-overview-${theme}-pagination.png`), fullPage: true });
      }
      await pagination.getByRole("link", { name: "Next", exact: true }).click();
      await page.waitForURL(/page=2/);
      assert.equal(await page.locator("tbody tr").count(), 6);
      assert.ok((await page.locator("main").innerText()).includes("Showing 11–16 of 16 invocations"));
      assert.ok(await pagination.getByRole("button", { name: "Next" }).isDisabled());
      await writeFile(audit, original);
    }
    assert.deepEqual(errors, []);
    console.log("PASS: Overview 10-row pagination / 230 and 16 distinct invocations, reload/history/keyboard/boundaries, Audit 100-row pages unchanged, ten-route Inter typography, opaque IDs, both themes/five widths, no overflow/runtime errors");
  } finally { await writeFile(audit, original); await page.close(); }
}
