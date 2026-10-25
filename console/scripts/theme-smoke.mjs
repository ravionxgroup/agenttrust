// Called by filter-smoke.mjs --themes; uses its isolated server and UI fixture.
import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const key = "agenttrust.console.theme.v1";
const themes = ["midnight", "light", "obsidian"];
export async function verifyThemes(browser, base, audit) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  context.on("page", page => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  });
  await context.addInitScript(() => {
    // Observe the first rendered body frame, rather than just the final theme.
    new MutationObserver((_records, observer) => {
      if (!document.body) return;
      observer.disconnect();
      requestAnimationFrame(() => {
        window.__firstThemeFrame = { theme: document.documentElement.dataset.theme, background: getComputedStyle(document.body).backgroundColor };
      });
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  const original = await readFile(audit);
  try {
    // Compact UI-only evidence exercises every outcome and integrity treatment.
    // This is exclusively the runner's temporary file, never Gateway storage.
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
    await page.goto(base + "/audit");
    const selector = page.getByRole("combobox", { name: "Theme", exact: true });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Theme"]').disabled);
    assert.equal(await selector.inputValue(), "midnight");
    const routes = ["/", "/agents", "/agents/filter-agent", "/runs", "/runs/filter-run", "/audit", "/invocations/00000000000000000000000000000005", "/tools", "/tools/http_status", "/policies"];
    for (const theme of themes) {
      await page.evaluate(() => { window.__themeDocumentMarker = "same-document"; });
      await selector.selectOption(theme);
      assert.equal(await page.evaluate(() => window.__themeDocumentMarker), "same-document", "switching must not reload");
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), theme);
      await page.reload();
      await page.waitForFunction(() => window.__firstThemeFrame);
      await page.waitForFunction(() => !document.querySelector('[aria-label="Theme"]').disabled);
      assert.equal(await selector.inputValue(), theme);
      const first = await page.evaluate(() => window.__firstThemeFrame);
      assert.equal(first.theme, theme, "selected theme must be present at first body frame");
      assert.equal(first.background, { midnight: "rgb(8, 17, 31)", light: "rgb(245, 247, 250)", obsidian: "rgb(11, 13, 16)" }[theme]);
      for (const route of routes) {
        const response = await page.goto(base + route);
        assert.equal(response.status(), 200, route);
        assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
        await page.waitForFunction(() => !document.querySelector('[aria-label="Theme"]').disabled);
        assert.equal(await selector.inputValue(), theme);
      }
      // A client-side route transition must also retain preference.
      await page.getByRole("navigation", { name: "Console navigation" }).getByRole("link", { name: "Audit", exact: true }).click();
      await page.waitForURL(base + "/audit");
      assert.equal(await selector.inputValue(), theme);
      await page.reload();
      await page.waitForFunction(() => !document.querySelector('[aria-label="Theme"]').disabled);
      assert.equal(await selector.inputValue(), theme);
      const colors = {};
      for (const label of ["ALLOW", "DENY", "SUCCEEDED", "FAILED", "UNKNOWN", "NOT EXECUTED", "Incomplete", "Conflicting evidence"]) {
        const badge = page.locator("tbody").getByText(label, { exact: true }).first();
        assert.equal(await badge.isVisible(), true, `${theme} ${label} remains distinct`);
        colors[label] = await badge.evaluate(el => getComputedStyle(el).color);
      }
      assert.notEqual(colors.DENY, colors.FAILED);
      assert.notEqual(colors.UNKNOWN, colors["NOT EXECUTED"]);
      assert.notEqual(colors.Incomplete, colors["Conflicting evidence"]);
      const accessibility = await page.evaluate(() => {
        function rgb(value) { return value.match(/[\d.]+/g).map(Number); }
        function composite(fg, bg) { const alpha = fg[3] ?? 1; return fg.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha)); }
        function background(element) {
          if (!element) return [255, 255, 255];
          return composite(rgb(getComputedStyle(element).backgroundColor), background(element.parentElement));
        }
        function luminance(color) { const c = color.slice(0, 3).map(v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; }
        function ratio(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); }
        const text = [...document.querySelectorAll("h2,th,td,span,p,a,select,input")].filter(el => el.getClientRects().length && !el.children.length && (el.textContent.trim() || el.tagName === "INPUT"));
        const failures = text.map(el => ({ element: el.tagName, ratio: ratio(rgb(getComputedStyle(el).color), background(el)) })).filter(item => item.ratio < 4.5);
        const control = document.querySelector('[name="authorization"]');
        return { failures, controlBorder: ratio(rgb(getComputedStyle(control).borderTopColor), background(control)), colorScheme: getComputedStyle(document.documentElement).colorScheme };
      });
      assert.deepEqual(accessibility.failures, [], `${theme} rendered text contrast`);
      assert.ok(accessibility.controlBorder >= 3, `${theme} rendered control border contrast`);
      assert.equal(accessibility.colorScheme, theme === "light" ? "light" : "dark");
      if (process.env.AGENTTRUST_THEME_EVIDENCE_DIR) {
        await mkdir(process.env.AGENTTRUST_THEME_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.AGENTTRUST_THEME_EVIDENCE_DIR, `${theme}.png`) });
      }
    }
    // Keyboard selection and visible focus, using the native select.
    await selector.focus();
    await selector.press("l");
    assert.equal(await selector.evaluate(el => el.matches(":focus-visible")), true);
    assert.equal(await selector.evaluate(el => getComputedStyle(el).outlineWidth), "2px");
    await selector.press("Tab");
    assert.equal(await selector.inputValue(), "light");

    // Invalid persisted input is ignored, never interpreted as code or a theme.
    await page.evaluate(key => localStorage.setItem(key, "not-a-supported-theme"), key);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Theme"]').disabled);
    assert.equal(await selector.inputValue(), "midnight");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "midnight");

    // Read and write failures must not disable switching or leak exceptions.
    const blocked = await browser.newContext();
    try {
      await blocked.addInitScript(() => {
        Storage.prototype.getItem = () => { throw new Error("blocked storage"); };
        Storage.prototype.setItem = () => { throw new Error("blocked storage"); };
      });
      const denied = await blocked.newPage();
      denied.on("pageerror", error => errors.push(error.message));
      await denied.goto(base + "/audit");
      const select = denied.getByRole("combobox", { name: "Theme", exact: true });
      await denied.waitForFunction(() => !document.querySelector('[aria-label="Theme"]').disabled);
      assert.equal(await select.inputValue(), "midnight");
      await select.selectOption("obsidian");
      assert.equal(await denied.locator("html").getAttribute("data-theme"), "obsidian");
      await denied.reload();
      assert.equal(await denied.locator("html").getAttribute("data-theme"), "midnight");
    } finally { await blocked.close(); }

    // Empty, unavailable and invalid states retain the chosen theme and meaning.
    await selector.selectOption("light");
    await writeFile(audit, "");
    await page.reload();
    await page.getByText("No observed invocations match this view. An empty readable file is not execution evidence.", { exact: true }).waitFor();
    await rename(audit, audit + ".test-backup");
    try {
      await page.reload();
      await page.getByRole("heading", { name: "Gateway audit unavailable", exact: true }).waitFor();
      assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    } finally { await rename(audit + ".test-backup", audit); }
    await writeFile(audit, "not JSON\n");
    await page.reload();
    await page.getByRole("heading", { name: "Audit source error", exact: true }).waitFor();
    assert.deepEqual(errors, [], "no browser runtime, hydration or console errors");
    console.log("PASS: three themes across 10 routes, no-reload switching, first-frame initialization, persistence, keyboard/focus, computed contrast, invalid/blocked storage, empty/unavailable/error states and hydration");
  } finally {
    await writeFile(audit, original);
    await context.close();
  }
}
