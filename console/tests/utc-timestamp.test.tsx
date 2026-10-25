import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { formatUtcTimestamp } from "../src/lib/format";
import { UtcTimestamp } from "../src/components/metadata/utc-timestamp";

for (const fraction of [".039433338", ".039433", ".039", "", ".999999999"]) {
  test(`UTC whole-second display preserves seconds for ${fraction || "whole seconds"}`, () => {
    const original = `2026-10-24T14:32:18${fraction}Z`;
    assert.equal(formatUtcTimestamp(original), "2026-10-24 14:32:18");
    const html = renderToStaticMarkup(<UtcTimestamp value={original} />);
    assert.ok(html.includes(`dateTime="${original}"`));
    assert.ok(html.includes(`aria-label="2026-10-24 14:32:18 UTC; original timestamp ${original}"`));
    assert.ok(html.includes(">2026-10-24 14:32:18</time>"));
  });
}
for (const [original, expected] of [
  ["2026-10-24T14:32:18.999999999+05:30", "2026-10-24 09:02:18"],
  ["2026-10-24T00:00:00.999999999+01:00", "2026-10-23 23:00:00"],
  ["2026-12-31T23:59:59.999999999-01:00", "2027-01-01 00:59:59"],
  ["2024-03-01T00:00:00+01:00", "2024-02-29 23:00:00"],
]) test(`explicit offset normalizes to UTC without rounding: ${original}`, () => {
  assert.equal(formatUtcTimestamp(original), expected);
  const html = renderToStaticMarkup(<UtcTimestamp value={original} />);
  assert.ok(html.includes(`dateTime="${original}"`));
  assert.ok(html.includes(`>${expected}</time>`));
});

test("invalid and missing timestamps remain invalid/missing rather than becoming valid dates", () => {
  for (const value of [undefined, null, "", "invalid", "2026-02-30T12:00:00Z", "2026-10-24T24:00:00Z", "2026-10-24T14:32:60Z", "2026-10-24T14:32:18", "2026-10-24T14:32:18+24:00", "2026-10-24T14:32:18+01:60", "2026-10-24T14:32:18.Z"]) {
    assert.equal(formatUtcTimestamp(value), null);
    const html = renderToStaticMarkup(<UtcTimestamp value={value} />);
    assert.equal(html, `<span>${value ?? ""}</span>`);
  }
});

test("UTC formatter never depends on browser local time or mutates input", () => {
  const original = "2026-10-24T23:59:59.999999999Z";
  assert.equal(formatUtcTimestamp(original), "2026-10-24 23:59:59");
  assert.equal(original, "2026-10-24T23:59:59.999999999Z");
});
