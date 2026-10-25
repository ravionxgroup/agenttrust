// Presentation checks on the existing runner-owned synthetic UI fixture only.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyControls(browser, base) {
  const directory = process.env.AGENTTRUST_CONTROLS_EVIDENCE_DIR;
  if (directory) await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const routes = ["/", "/agents", "/agents/filter-agent", "/runs", "/runs/filter-run", "/audit", "/invocations/00000000000000000000000000000001", "/tools", "/tools/http_restart", "/policies"];
  try {
    await page.goto(base + "/audit");
    for (const theme of ["obsidian", "light"]) {
      await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled);
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /^Switch to/ }).click();
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(base + "/audit");
        const form = page.getByRole("form", { name: "Investigate invocations" });
        assert.equal(await form.locator("select,input").count(), 6);
        for (const control of await form.locator("select,input").all()) {
          const bounds = await control.boundingBox();
          assert.ok(bounds.height >= 40 && bounds.height <= 44);
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, "no control clipping");
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(base + "/audit?authorization=DENY&tool=http_restart");
      await page.getByText("2 filters active", { exact: true }).waitFor();
      await page.getByLabel("Agent", { exact: true }).selectOption("filter-agent");
      assert.equal(await page.getByText("2 filters active", { exact: true }).count(), 1, "draft edits must not affect applied count");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await page.getByText("3 filters active", { exact: true }).waitFor();
      await page.goBack();
      await page.getByText("2 filters active", { exact: true }).waitFor();
      await page.goForward();
      await page.getByText("3 filters active", { exact: true }).waitFor();
      await page.getByRole("link", { name: "Reset filters", exact: true }).click();
      await page.getByText("0 filters active", { exact: true }).waitFor();
      for (const locator of [page.getByLabel("Agent", { exact: true }), page.getByRole("button", { name: "Apply filters", exact: true }), page.getByRole("link", { name: "Reset filters", exact: true })]) {
        await page.keyboard.press("Tab");
        await locator.focus();
        assert.ok(await locator.evaluate(el => getComputedStyle(el).outlineStyle === "solid" && parseFloat(getComputedStyle(el).outlineWidth) >= 2));
      }
      const contrast = await page.locator(".ui-button-primary").evaluate(el => {
        const style = getComputedStyle(el);
        const luminance = color => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      assert.ok(contrast >= 4.5, `${theme} primary text contrast ${contrast}`);
      for (const route of routes) {
        const response = await page.goto(base + route);
        assert.equal(response.status(), 200, route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route);
        if (directory && ["/audit", "/agents", "/tools/http_restart", "/policies"].includes(route)) await page.screenshot({ path: path.join(directory, `${route === "/" ? "overview" : route.slice(1).replaceAll("/", "-")}-${theme}.png`) });
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS: P4-A six 44px native controls at 1440/768/390/320, applied-only counts/history/reset, focus, ten routes, both themes, no overflow or runtime errors");
  } finally { await context.close(); }
}
