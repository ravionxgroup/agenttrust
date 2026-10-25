import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NAVIGATION_ITEMS, navigationState } from "../src/lib/navigation";
import { AppHeader } from "../src/components/layout/app-header";

const routes = [
  ["/", "/"], ["/agents", "/agents"], ["/agents/agent-id", "/agents"],
  ["/runs", "/runs"], ["/runs/run-id", "/runs"], ["/audit", "/audit"],
  ["/invocations/0123456789abcdef0123456789abcdef", "/audit"],
  ["/tools", "/tools"], ["/tools/tool-id", "/tools"], ["/policies", "/policies"],
];
for (const [route, section] of routes) test(`${route} highlights ${section} without claiming a parent link is the current page`, () => {
  const active = NAVIGATION_ITEMS.filter(item => navigationState(route, item.href).active);
  assert.deepEqual(active.map(item => item.href), [section]);
  assert.equal(navigationState(route, section).current, route === section);
});

test("route matching respects segment boundaries and trailing slashes", () => {
  for (const route of ["/agents-other", "/toolshed", "/runs-old/id", "/auditing", "/invocations-archive/id", "/invocations", "/policies-old", "/unknown"]) {
    assert.equal(NAVIGATION_ITEMS.some(item => navigationState(route, item.href).active), false, route);
  }
  assert.deepEqual(navigationState("/agents/", "/agents"), { active: true, current: true });
  assert.deepEqual(navigationState("/agents/id/", "/agents"), { active: true, current: false });
});

test("navigation preserves exactly six destinations", () => {
  assert.deepEqual(NAVIGATION_ITEMS.map(item => [item.label, item.href]), [
    ["Overview", "/"], ["Agents", "/agents"], ["Runs", "/runs"],
    ["Audit", "/audit"], ["Tools", "/tools"], ["Policies", "/policies"],
  ]);
});

test("header renders branding, theme toggle and a non-modal native navigation disclosure", () => {
  const html = renderToStaticMarkup(<AppHeader />);
  assert.match(html, /^<header\b/);
  assert.ok(html.includes("AI Agent Security &amp; Observability"));
  assert.ok(html.includes('aria-label="Switch to Light theme"'));
  assert.ok(html.includes('aria-label="Console navigation"'));
  assert.ok(html.includes('aria-label="Open navigation"'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="console-navigation"'));
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  for (const item of NAVIGATION_ITEMS) assert.ok(html.includes(`href="${item.href}"`));
  assert.ok(!html.includes('role="menu"'));
  assert.ok(!html.includes("<aside"));
});
