// Runs against filter-smoke.mjs's isolated Console and synthetic UI-only fixture.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const destinations = ["/", "/agents", "/runs", "/audit", "/tools", "/policies"];
const routes = [
  ["/", "/"], ["/agents", "/agents"], ["/agents/filter-agent", "/agents"],
  ["/runs", "/runs"], ["/runs/filter-run", "/runs"], ["/audit", "/audit"],
  ["/invocations/00000000000000000000000000000005", "/audit"],
  ["/tools", "/tools"], ["/tools/http_status", "/tools"], ["/policies", "/policies"],
];

export async function verifyNavigation(browser, base) {
  const context = await browser.newContext();
  const errors = [];
  context.on("page", page => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  });
  const page = await context.newPage();
  const nav = page.locator("#console-navigation");
  const toggle = page.getByRole("button", { name: /^Switch to (Light|Obsidian) theme$/ });
  const menu = () => page.getByRole("button", { name: /^(Open|Close) navigation$/ });
  async function ready() { await page.waitForFunction(() => !document.querySelector('button[aria-label^="Switch to "]').disabled); }
  async function active(section, current) {
    await page.waitForFunction(href => document.querySelector('#console-navigation a[data-active="true"]')?.getAttribute("href") === href, section);
    const link = nav.locator('a[data-active="true"]');
    assert.equal(await link.count(), 1);
    assert.equal(await link.getAttribute("aria-current"), current ? "page" : null);
    assert.equal(await link.getAttribute("aria-describedby"), current ? null : "current-navigation-section");
    assert.equal(await nav.locator('[aria-current="page"]').count(), current ? 1 : 0);
    assert.equal(await link.evaluate(el => getComputedStyle(el).borderBottomWidth), "2px");
    assert.ok(Number(await link.evaluate(el => getComputedStyle(el).fontWeight)) >= 600);
  }
  async function noOverflow() {
    const size = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    assert.ok(size.width <= size.viewport + 1, JSON.stringify(size));
  }
  async function openMenu() {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    assert.equal(await menu().getAttribute("aria-expanded"), "true");
    assert.equal(await nav.isVisible(), true);
  }
  try {
    for (const theme of ["obsidian", "light"]) {
      for (const width of [1440, 1024, 1023, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(base + "/audit");
        await ready();
        if (await page.locator("html").getAttribute("data-theme") !== theme) await toggle.click();
        const mobile = width < 1024;
        for (const [route, section] of routes) {
          const response = await page.goto(base + route);
          assert.equal(response.status(), 200, route);
          await ready();
          assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
          if (mobile) {
            assert.equal(await menu().getAttribute("aria-expanded"), "false");
            assert.equal(await nav.isVisible(), false);
            await openMenu();
          } else {
            assert.equal(await menu().isVisible(), false);
            assert.equal(await nav.isVisible(), true);
            const height = await page.getByRole("banner").evaluate(el => el.getBoundingClientRect().height);
            assert.ok(height >= 72 && height <= 76, `single desktop header row: ${height}`);
          }
          assert.deepEqual(await nav.locator("a").evaluateAll(links => links.map(link => link.getAttribute("href"))), destinations);
          for (const link of await nav.locator("a").all()) assert.equal(await link.isVisible(), true);
          await active(section, route === section);
          await noOverflow();
          if (mobile) await page.getByRole("button", { name: "Close navigation", exact: true }).click();
        }
        // Exercise every actual link, including automatic mobile menu closure.
        for (const href of destinations) {
          if (mobile) await openMenu();
          await nav.locator(`a[href="${href}"]`).click();
          await page.waitForURL(base + href);
          await active(href, true);
          if (mobile) assert.equal(await menu().getAttribute("aria-expanded"), "false");
          assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
        }
        if (process.env.AGENTTRUST_NAVIGATION_EVIDENCE_DIR) {
          await page.goto(base + "/audit");
          await ready();
          if (mobile) await openMenu();
          await mkdir(process.env.AGENTTRUST_NAVIGATION_EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.AGENTTRUST_NAVIGATION_EVIDENCE_DIR, `${theme}-${width}.png`) });
        }
      }
      // Keyboard-only disclosure navigation, Escape, Space, outside click and blur.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base + "/audit");
      await ready();
      await menu().focus();
      await menu().press("Enter");
      assert.equal(await menu().getAttribute("aria-expanded"), "true");
      for (let index = 0; index < destinations.length; index++) {
        await page.keyboard.press("Tab");
        assert.equal(await nav.locator("a").nth(index).evaluate(el => el === document.activeElement), true);
        assert.equal(await nav.locator("a").nth(index).evaluate(el => getComputedStyle(el).outlineWidth), "2px");
      }
      await page.keyboard.press("Escape");
      assert.equal(await menu().getAttribute("aria-expanded"), "false");
      assert.equal(await menu().evaluate(el => el === document.activeElement), true);
      await menu().press("Space");
      assert.equal(await menu().getAttribute("aria-expanded"), "true");
      // The mobile dropdown overlays the heading; click visible outer page space.
      await page.mouse.click(4, 600);
      assert.equal(await menu().getAttribute("aria-expanded"), "false");
      await openMenu();
      await nav.locator("a").last().focus();
      await page.keyboard.press("Tab");
      assert.equal(await menu().getAttribute("aria-expanded"), "false");
      await openMenu();
      await nav.locator('a[href="/agents"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(base + "/agents");
      await active("/agents", true);
      assert.equal(await menu().getAttribute("aria-expanded"), "false");

      // Resizing must not strand focus in hidden navigation.
      await menu().focus();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.waitForFunction(() => document.activeElement?.matches('#console-navigation a[data-active="true"]'));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open navigation");
      assert.equal(await menu().getAttribute("aria-expanded"), "false");
      await noOverflow();

      // Skip link, main landmark and the unchanged theme toggle.
      await page.goto(base + "/audit");
      await ready();
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to content", exact: true });
      assert.equal(await skip.evaluate(el => el === document.activeElement), true);
      assert.equal(await skip.evaluate(el => getComputedStyle(el).position), "fixed");
      await skip.press("Enter");
      await page.waitForFunction(() => document.activeElement?.id === "main-content");
      assert.equal(await page.getByRole("main").count(), 1);
      const before = await page.locator("html").getAttribute("data-theme");
      await toggle.focus();
      await toggle.press("Enter");
      assert.equal(await page.locator("html").getAttribute("data-theme"), before === "light" ? "obsidian" : "light");
      await toggle.press("Space");
      assert.equal(await page.locator("html").getAttribute("data-theme"), before);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openMenu();
      assert.equal(await nav.locator("a").first().evaluate(el => getComputedStyle(el).transitionDuration), "0s");
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(base);
    const main = await page.getByRole("main").boundingBox();
    assert.ok(main.width <= 1600 && main.x >= 159, "content width is capped and centered");
    await noOverflow();
    assert.deepEqual(errors, [], "no runtime or hydration errors");
    console.log("PASS: six links and 10 route highlights in both themes at 1440/1024/1023/768/390/320px, mobile disclosure/keyboard/Escape/outside/blur/resize, skip link, theme persistence, reduced motion, no page overflow, 1600px content cap and no browser errors");
  } finally { await context.close(); }
}
