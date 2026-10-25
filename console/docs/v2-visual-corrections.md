# V2 visual acceptance corrections

Starting HEAD: `6c7f8b8a90ac752ed24b356c8a49ed9d2615bb59`.
Existing uncommitted V2 changes and the supplied reference image were preserved.
The Gateway repository remains unchanged. No dependencies, providers, projection,
API, authorization/execution, timestamp, filtering or theme-persistence behavior
was changed. This is a follow-up to the initial V2 visual acceptance report.

## Pagination root cause and correction

Overview previously rendered `snapshot.invocations.slice(0, 20)` and had no footer
or page controls. Pagination was neither hidden nor removed by V2: the previous
implementation already had that cap. The source is the complete configured,
bounded audit snapshot; ingestion rejects unsafe/oversized sources rather than
returning a silently truncated remote page. Correct pagination over that observed
snapshot is therefore possible without changing data providers or fabricating a
historical total.

Overview now uses ten-row server-rendered pages, selected by `/?page=N`.
The footer shows `Showing 1–10 of 16 invocations`, Previous, bounded numeric page
links, Next, and the active page. Boundary actions use disabled native buttons.
Out-of-range numeric pages clamp to the final available page; invalid parameters
use page one. An empty readable source shows `Showing 0–0 of 0 invocations`;
an unavailable source still shows no counts or invented data.

Native GET anchors support keyboard use and browser history, including refresh.
They do not require JavaScript. A client-router experiment did not behave
consistently in Firefox for Back immediately after reload and was replaced with
plain anchors before acceptance. Audit Explorer retains its existing independent
100-row paging and URL filtering unchanged. Metrics/analytics always describe the
entire observed snapshot, not just the ten visible rows. Totals count distinct
invocations, never persisted lifecycle records. This is not an all-history total
beyond the configured audit file.

The footer is outside the horizontally scrollable table, so its controls remain
visible without scrolling the table sideways. It wraps on narrow screens. It is
at the bottom of the table, so a short viewport still requires ordinary vertical
page scrolling. No fixed overlay or unrelated table redesign was introduced.

## Shared typography

Inter remains the existing UI font, with no additional font families/dependencies.
Shared sizes are page titles 26px, section titles 16px, body 14px, support text
13px, table headers/values 13px, metrics 28px, and opaque IDs 12–13px.
Buttons/badges/table headers use restrained medium weights. Timestamps and numbers
retain tabular numerals. Colors, navigation layout and theme persistence remain
unchanged.

The `text-xs` token is now 13px/20px and shared table/technical-value defaults use
Inter. Agent/tool names, scope labels, classifications and metadata values no
longer inherit monospace simply because they appeared in a technical table.
Explicit monospace remains for invocation, run, token, event and request IDs,
environment-variable code and serialized code blocks. The small `TechId` helper
accepts an explicit opaque flag. Full identifiers, accessible timestamp originals,
local table scrolling, wrapping and existing detail links are retained.

## Verification

- Unit tests: **78 passed, zero skipped**, including four new pagination cases:
  ten-row boundaries/clamping, active/disabled links, empty/large snapshots, and
  actual Overview slicing with unchanged full-snapshot metrics/record counts.
- TypeScript (`npx tsc --noEmit`): PASS.
- Production build (`npm run build`): PASS. Generated type-reference changes
  were restored; no generated files are included.
- Existing browser regressions: PASS in Chromium 149 and Firefox 151 across
  theme initialization/persistence, navigation, native GET filters, reset/history,
  controls, tables, timestamps, timelines, long identifiers and source states.
- New `--overview` browser checks: PASS in both engines with 230- and 16-invocation
  synthetic fixtures, ten/six rows, accurate counts, boundaries, numeric page
  state, reload, independent Back/Forward, keyboard activation and unchanged
  100-row Audit Explorer pagination.
- Ten-route typography and both-theme checks: PASS. Inter for general values,
  monospace for opaque invocation IDs, 26px h1 and no document overflow.
- Acceptance matrix: 100 route/theme/viewport checks per engine at
  1440/1024/768/390/320px, plus source-state and reflow assertions; PASS.
- Real read-only Console integration: PASS for existing 52 persisted records /
  16 invocations, eight metrics, event/invocation IDs, original timestamps,
  authorization/execution and filters across ten routes/both themes.
  Only the Console service/image was rebuilt, with no tool calls, credential
  issuance or Gateway changes.
- Script syntax and Git whitespace checks: PASS. No configured ESLint command.

Run the existing external Playwright setup with:

```bash
node scripts/filter-smoke.mjs --themes --navigation --components --controls --data --timestamps --overview --acceptance
```

The existing regressions ran first; affected pagination/acceptance checks were
rerun after the native-link correction. Set `AGENTTRUST_CORRECTIONS_EVIDENCE_DIR`
for the two full-page Overview screenshots per engine. Screenshot fixtures contain
16 synthetic invocations (56 lifecycle records), clearly separate from real data.

Screenshots in the local Chromium evidence directory:

- `chromium-overview-light-pagination.png`
- `chromium-overview-obsidian-pagination.png`

Both show all ten first-page rows and the complete pagination footer. Firefox
also captured its equivalent pair. Screenshot files are outside the repository,
under `/private/tmp/agenttrust-v2-corrections/`, and were not committed.

### Remaining limitations

With the installed Firefox 151/Playwright combination, Back remains on the same
URL immediately after an automated reload, even on a minimal two-page
plain HTML server with no Console or framework code. Independent Back/Forward
and page preservation on reload pass; the combined Firefox sequence is **not
claimed verified**. Chromium passes that combined sequence. No history shims or
browser-specific application workarounds were introduced.

Safari, human screen-reader review and native browser zoom remain unverified.
The checks do not constitute WCAG certification. Pagination reflects the current
snapshot; new audit writes can change page contents between requests, and this
viewer does not freeze a historical snapshot. Table width still uses local
horizontal scrolling. These changes do not expand the local MVP security scope.

Final combined working tree: 31 modified tracked files, seven authored untracked
files, and the separately preserved untracked reference image. This includes the
prior V2 work; only the 20 files listed below were touched in this correction.
The Gateway working tree is clean; nothing is staged.

## Exact incremental file inventory

These files were edited for this correction in addition to the previously
uncommitted V2 work (the larger working-tree diff also contains that earlier work):

```text
console/README.md
console/docs/v2-visual-redesign.md
console/docs/v2-visual-corrections.md
console/scripts/filter-smoke.mjs
console/scripts/overview-corrections-smoke.mjs
console/src/app/globals.css
console/src/app/page.tsx
console/src/app/agents/[agentId]/page.tsx
console/src/app/runs/[runId]/page.tsx
console/src/app/tools/[tool]/page.tsx
console/src/app/policies/page.tsx
console/src/components/badges/tech-id.tsx
console/src/components/overview/overview-analytics.tsx
console/src/components/overview/overview-pagination.tsx
console/src/components/tables/gateway-audit.tsx
console/src/components/tables/runs-table.tsx
console/src/components/tables/recent-events-table.tsx
console/src/components/tables/audit-explorer.tsx
console/tailwind.config.ts
console/tests/overview-pagination.test.tsx
```

No staging, commits or pushes were performed.
