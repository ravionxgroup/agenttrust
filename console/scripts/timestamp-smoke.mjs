// Display-only verification against the existing runner's temporary UI fixture.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyTimestamps(browser, base, audit) {
  const original = await readFile(audit);
  const directory = process.env.AGENTTRUST_TIMESTAMP_EVIDENCE_DIR;
  if (directory) await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Los_Angeles" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const records = original.toString().trim().split("\n").map(line => JSON.parse(line));
    for (const record of records) record.timestamp = record.timestamp.replace(/Z$/, ".999999999Z");
    await writeFile(audit, records.map(record => JSON.stringify(record)).join("\n") + "\n");
    await page.goto(base);
    for (const theme of ["obsidian", "light"]) {
      await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled);
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /^Switch to/ }).click();
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of ["/", "/audit"]) {
          await page.goto(base + route);
          const times = page.locator(".ui-invocation-table time");
          assert.ok(await times.count() > 0);
          for (const time of await times.all()) {
            const raw = await time.getAttribute("datetime");
            const expected = raw.slice(0, 19).replace("T", " ");
            assert.ok(raw.endsWith(".999999999Z"));
            assert.equal(await time.textContent(), expected, "fraction is dropped without rounding");
            assert.equal(await time.getAttribute("aria-label"), `${expected} UTC; original timestamp ${raw}`);
            assert.ok(await time.evaluate(el => { const style = getComputedStyle(el); return style.whiteSpace === "nowrap" && style.fontVariantNumeric.includes("tabular-nums") && el.getBoundingClientRect().height <= 24; }));
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          if (width === 1440 && route === "/audit" && directory) await page.screenshot({ path: path.join(directory, `timestamps-${theme}.png`) });
          if (width === 320) {
            const region = page.getByRole("region", { name: "Gateway invocations", exact: true });
            assert.ok(await region.evaluate(el => el.scrollWidth > el.clientWidth));
            await region.focus(); await page.keyboard.press("ArrowRight");
            await page.waitForFunction(() => document.querySelector('[aria-label="Gateway invocations"]').scrollLeft > 0);
          }
        }
      }
      await page.goto(base + "/invocations/00000000000000000000000000000005");
      assert.ok((await page.locator("main").innerText()).includes("2026-10-24T12:10:00.999999999Z"), "full-precision detail evidence is retained");
    }
    assert.deepEqual(errors, []);
    console.log("PASS: compact UTC seconds in Overview/Audit, preserved full datetime/accessibility/detail evidence, single-line values, both themes at 1440/768/390/320, keyboard local scrolling, no overflow or browser errors");
  } finally { await writeFile(audit, original); await context.close(); }
}
