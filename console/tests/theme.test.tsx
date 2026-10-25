import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { THEMES, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "../src/lib/theme";
import { ThemeToggle } from "../src/components/layout/theme-toggle";
import { EvidenceBadge } from "../src/components/tables/gateway-audit";

test("theme names have a strict Obsidian fallback without coercion", () => {
  for (const theme of THEMES) assert.equal(resolveTheme(theme), theme);
  for (const value of [null, undefined, "", "midnight", "dark", "LIGHT", {}, ["light"], 1]) assert.equal(resolveTheme(value), "obsidian");
});

test("fixed early initialization reads only the theme preference and handles blocked storage", () => {
  for (const stored of [...THEMES, null, "invalid", '";globalThis.executed=true;//', new Error("blocked")]) {
    const context = {
      localStorage: { getItem(key: string) { assert.equal(key, THEME_STORAGE_KEY); if (stored instanceof Error) throw stored; return stored; } },
      document: { documentElement: { setAttribute(key: string, value: string) { assert.equal(key, "data-theme"); selected = value; } } },
      executed: false,
    };
    let selected = "";
    runInNewContext(THEME_INIT_SCRIPT, context, { timeout: 100 });
    assert.equal(selected, stored instanceof Error ? "obsidian" : resolveTheme(stored));
    assert.equal(context.executed, false);
  }
});

test("theme toggle has a native button, matching tooltip and deterministic server markup", () => {
  const html = renderToStaticMarkup(<ThemeToggle />);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /aria-label="Switch to Light theme"/);
  assert.match(html, /title="Switch to Light theme"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /lucide-sun/);
  assert.match(html, /aria-hidden="true"/);
  assert.ok(!html.includes("<select"));
});

type RGB = number[];
function luminance(color: RGB) {
  const linear = color.map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a: RGB, b: RGB) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); }
function tint(foreground: RGB, background: RGB, alpha: number) { return foreground.map((value, index) => value * alpha + background[index] * (1 - alpha)); }
const css = readFileSync("src/app/globals.css", "utf8");
for (const theme of THEMES) test(`${theme}: text, tinted badges, controls and focus meet contrast targets`, t => {
  const block = css.match(new RegExp(`:root\\[data-theme="${theme}"\\] \\{([^}]+)\\}`))?.[1];
  assert.ok(block);
  const tokens = Object.fromEntries([...block.matchAll(/--([a-z-]+): ([\d ]+);/g)].map(match => [match[1], match[2].split(" ").map(Number)]));
  let textMinimum = Infinity, badgeMinimum = Infinity, controlMinimum = Infinity;
  for (const background of ["canvas", "sidebar", "surface", "raised", "hover", "control"]) {
    for (const name of ["foreground", "muted", "accent"]) {
      const ratio = contrast(tokens[name], tokens[background]);
      assert.ok(ratio >= 4.5, `${theme} ${name}/${background}: ${ratio}`);
      textMinimum = Math.min(textMinimum, ratio);
    }
    assert.ok(contrast(tokens.accent, tokens[background]) >= 3, "focus indicator");
    for (const status of ["success", "denied", "failed", "unknown", "incomplete", "conflict", "muted"]) {
      const ratio = contrast(tokens[status], tint(tokens[status], tokens[background], 0.1));
      assert.ok(ratio >= 4.5, `${theme} tinted ${status}/${background}: ${ratio}`);
      badgeMinimum = Math.min(badgeMinimum, ratio);
    }
  }
  for (const background of ["control", "canvas", "surface"]) {
    const ratio = contrast(tokens["control-border"], tokens[background]);
    assert.ok(ratio >= 3, `${theme} control border/${background}: ${ratio}`);
    controlMinimum = Math.min(controlMinimum, ratio);
  }
  t.diagnostic(`minimum contrast: text ${textMinimum.toFixed(2)}, badges ${badgeMinimum.toFixed(2)}, control borders ${controlMinimum.toFixed(2)}`);
});

test("evidence badges retain distinct semantic labels and color families", () => {
  for (const [value, tone] of [["ALLOW", "success"], ["DENY", "denied"], ["SUCCEEDED", "success"], ["FAILED", "failed"], ["UNKNOWN", "unknown"], ["NOT_EXECUTED", "muted"]]) {
    const html = renderToStaticMarkup(<EvidenceBadge value={value} />);
    assert.ok(html.includes(`text-${tone}`));
    assert.ok(html.includes(value.replaceAll("_", " ")));
  }
});
