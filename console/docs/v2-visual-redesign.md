# Console V2 — implementation and visual acceptance

Result: **READY_FOR_VISUAL_ACCEPTANCE**. Manual visual acceptance is pending.

Starting public revision: `6c7f8b8a90ac752ed24b356c8a49ed9d2615bb59`.
The Gateway revision was recorded locally and its repository stayed unchanged.
Application working trees were clean at entry; the only untracked item was the
user-supplied `console/design-reference/agenttrust-premium-overview.png`. It was
inspected and preserved as the authorized reference input, not rewritten.

The P5 baseline report was reviewed. Its historical results remain unchanged.
This work changes presentation and presentation-only aggregation/tests; it does
not change providers, storage, contracts, credentials or enforcement.

## Shared design and route treatment

The reference guided the single-row header, blue primary accent, restrained icon
containers, white Light cards, soft blue-gray canvas, navy Obsidian surfaces,
subtle shadows, consistent borders/radii, typography and compact tables.

Existing CSS variables and semantic classes remain the design system. Inter and
Lucide are retained. No UI framework, chart package or other dependency was added.
All existing listing/detail pages reuse the shared card, control, badge, table,
metadata and source-state presentation. Full identifiers, original evidence,
neutral policy limitations and locally scrollable tables remain available.

Desktop navigation is one 72px row from 1024px upward. It contains branding, the
six existing destinations and the existing Sun/Moon toggle; the subtitle appears
where space permits. Smaller widths use the same native disclosure and keyboard
behavior in a compact header. Parent highlighting, Escape, outside click, focus
on resize, skip navigation and theme preference initialization are preserved.
No Settings, user profile, global search or unsupported time controls were added.

Every supported populated page now has one h1; section headings use h2. Early
source-failure returns retain a screen-reader page title above the error section.
This corrects the P5 heading observation without weakening failure messages.

## Overview and accurate analytics

The eight metric labels/calculations are unchanged. Factual helper labels and
left-aligned colored icons accompany the values. At 1440px the metric cards form
four columns/two rows and measure 100px high; values remain 28px and tabular.
Cards remain content-driven and may grow on narrow layouts.

The source card exposes actual record/duplicate counts. The existing Audit link
is the primary header action. Recent invocations retain their existing columns,
links, original timestamps/accessibility metadata and separate
authorization/execution/integrity evidence in a shared section surface.

Analytics are computed only from the already-projected, readable snapshot:

| Panel | Population and calculation | Important bounds/limitations |
| --- | --- | --- |
| Invocation activity | One count per invocation at its earliest observed timestamp; eight equal-width bins from observed minimum through maximum, inclusive last endpoint | Uses exact nanosecond integer arithmetic for boundaries. A single observed time has one bin. Original strings are retained; no rolling 24h window or prior-period comparison |
| Tool usage | Counts of all observed requests by logical tool, including denied/not-executed requests; top five tools plus combined remainder | Denominator is all observed invocations. Bars scale to the largest displayed count, not a percentage or authorization claim |
| Execution outcomes | SUCCEEDED, FAILED, NOT_EXECUTED and UNKNOWN across all observed invocations | These are mutually exclusive execution summary categories. DENY is not an additional execution category. Unknown includes missing/conflicting outcome evidence; integrity flags still overlap categories separately |

All panels show visible counts and descriptive accessible SVG labels. Missing
source evidence suppresses analytics entirely. A readable empty source has
explicit no-observation messages and no fabricated successful chart. A missing
usable timestamp is disclosed instead of replaced with a current timestamp.
The trusted ingestion contract still determines valid evidence.

Historical trends, percentage deltas, sparklines, duration columns, sorting,
exports and unsupported row actions from the mockup were deliberately omitted.
No history/comparison window, new API or storage is implied.

## Verification results

| Check | Result |
| --- | --- |
| Full unit suite (`npm test`) | PASS: 74 tests, zero skips |
| Targeted shared/theme/navigation/analytics checks | PASS: 29 tests during implementation |
| Analytics rerun after TypeScript compatibility correction | PASS: 5 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| Chromium 149.0.7827.55 | PASS: prior-phase regressions and V2 acceptance |
| Firefox 151.0 | PASS: prior-phase regressions and V2 acceptance |
| Ten routes / both themes / 1440, 1024, 768, 390, 320px | PASS: 100 route/theme/viewport checks per engine |
| Empty, unavailable, invalid and missing-detail states | PASS: 54 explicit source-state checks per engine |
| Keyboard, disclosure, focus, native GET, same-URL reset, history, dates, pagination | PASS |
| Eight metric values, analytics categories, UTC precision, long IDs, scope links, timeline alignment | PASS |
| Contrast / reduced motion / semantic headings and labels | PASS: targeted assertions, not a conformance audit |
| 200%/400%-equivalent effective-width reflow | PASS; native browser-chrome zoom remains NOT VERIFIED |
| Git whitespace checks in both repositories | PASS |
| Existing real Console integration | PASS, as described below |

There is no configured ESLint/formatter command. No lint framework was introduced.
The full suite ran once after the shared implementation stabilized. Failures were
corrected and affected checks rerun. The successful production build required the
normal permission for Turbopack's internal local port.

New unit cases cover authorization/execution separation, one-count-per-invocation
aggregation, exact sub-millisecond window boundaries, top-five/remainder tool
counts, empty/missing timestamp evidence and unavailable-source suppression.

Existing browser assertions were adapted to intentional design changes: the
1024px navigation breakpoint and 72px row; new first-frame canvas colors; metric
helper-label height; h1 hierarchy; scoped metric-card selectors; and clicking
visible outside space beneath the mobile dropdown. All behavioral assertions are
retained. Screenshot capture defaults to representative views and can be disabled.
The test runner also supports explicit unit-file selection without silent skips.

Executed browser sequence (external Playwright/binaries, no repository dependency):

```bash
node scripts/filter-smoke.mjs --themes --navigation --components --controls --data --timestamps --acceptance
# After the presentation-selector adjustment, rerun the affected remainder:
node scripts/filter-smoke.mjs --skip-filters --components --controls --data --timestamps --acceptance
```

Both Chromium and Firefox completed their required checks across these runs.
Set `AGENTTRUST_BROWSER`, `AGENTTRUST_BROWSER_EXECUTABLE`,
`AGENTTRUST_PLAYWRIGHT_MODULE`, `AGENTTRUST_COMPONENT_EVIDENCE_DIR` and
`AGENTTRUST_ACCEPTANCE_EVIDENCE_DIR` to the local test setup. For bounded evidence,
use `AGENTTRUST_SMOKE_SCREENSHOTS=0` and
`AGENTTRUST_ACCEPTANCE_SCREENSHOTS=representative` (Chromium) / `none` (Firefox).
The normal command still runs P1 filters; `--skip-filters` is an explicit focused
rerun option only after those checks have already passed.

## Real integration and security boundaries

Only the local Console image/service was rebuilt/recreated using the existing
supported Compose configuration. The Gateway repository and configuration were
not modified. The existing real audit volume was consumed read-only.

A restricted temporary snapshot was passed through the actual projection CLI and
compared to the redesigned viewer using the existing real acceptance script:

- 52 persisted records, 16 invocations; all eight metrics matched.
- Every invocation's authorization/execution and original timestamp matched.
- Invocation/event IDs and DENY filtering matched persisted evidence.
- Ten existing routes rendered in both themes without browser runtime errors.
- No credentials, private keys or server paths were found by the existing HTML
  assertions. No credentials were issued and no protected tools were executed.

This is real persisted-evidence integration, not a new execution/authorization
acceptance test. Failure/conflict presentation beyond the available real records
was tested with explicitly synthetic fixtures, never inserted into the real path.

Local MVP limitations remain: no application-level Console login, no production
security/readiness claim, trusted Docker host administrators, local credential
management, read-only filesystem evidence rather than tamper-proof storage, and
no Gateway policy ingestion. No API, provider, SDK or enforcement change was made.

## Final screenshots and limitations

Chromium captured 22 representative images, not hundreds. Firefox ran the same
assertions without duplicate screenshots. The JSON manifests in each external
browser evidence directory list route, theme, width, source state and filename.
All showcase screenshots use synthetic demonstration data and must be labeled so.

Recommended files, relative to the Chromium evidence directory:

- `chromium-overview-light-1440.png` and `chromium-overview-obsidian-1440.png`
- `chromium-audit-light-1024.png` and `chromium-audit-obsidian-390.png`
- `chromium-run-detail-light-768.png`
- `chromium-tool-detail-light-320.png`

Representative desktop/mobile screenshots were visually reviewed. No document
horizontal overflow, clipped controls/badges or runtime exceptions remained in
verified engines. Wide tables intentionally retain local scrolling.

WebKit/Safari, human screen-reader output and native browser-chrome zoom were not
verified for V2. Effective reflow/automated keyboard checks do not replace those
checks. No WCAG conformance claim is made. Manual visual acceptance remains open.
Nothing was published externally, staged, committed or pushed.

## Exact authored change inventory

```text
console/README.md
console/docs/v2-visual-redesign.md
console/scripts/acceptance-smoke.mjs
console/scripts/components-smoke.mjs
console/scripts/filter-smoke.mjs
console/scripts/navigation-smoke.mjs
console/scripts/real-acceptance-smoke.mjs
console/scripts/test.mjs
console/scripts/theme-smoke.mjs
console/src/app/globals.css
console/src/app/page.tsx
console/src/app/agents/page.tsx
console/src/app/agents/[agentId]/page.tsx
console/src/app/audit/page.tsx
console/src/app/invocations/[invocationId]/page.tsx
console/src/app/policies/page.tsx
console/src/app/runs/page.tsx
console/src/app/runs/[runId]/page.tsx
console/src/app/tools/page.tsx
console/src/app/tools/[tool]/page.tsx
console/src/components/layout/app-header.tsx
console/src/components/layout/navigation.tsx
console/src/components/layout/state-message.tsx
console/src/components/metrics/metric-card.tsx
console/src/components/metrics/source-indicator.tsx
console/src/components/overview/overview-analytics.tsx
console/src/components/tables/audit-explorer.tsx
console/src/components/tables/gateway-audit.tsx
console/src/components/tables/gateway-filters.tsx
console/tests/overview-analytics.test.tsx
```

Separate preserved input: `console/design-reference/agenttrust-premium-overview.png`.
No dependency files changed. Generated Next.js type references were restored.

## Subsequent visual acceptance corrections

The [correction report](v2-visual-corrections.md) records the ten-row Overview
pagination and shared Inter typography requested after initial visual review.
The original verification counts above describe the initial V2 pass; the newer
report records subsequent verification and the incremental changed-file list.
