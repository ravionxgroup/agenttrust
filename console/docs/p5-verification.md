# P5 Console verification — 2026-10-25

Classification: **READY_WITH_DOCUMENTED_LIMITATIONS**.

Application candidate: `cd2639bc5af70b00f2b2ba641e3fc99fdc1730a3` (P4-B.1).
Both repositories were clean at entry. The Gateway revision was recorded in local
review evidence and its repository remained unchanged. Subsequent changes are
verification scripts and documentation only; application code and dependencies
are unchanged. No staging, commits, pushes or external publication were performed.

## Evidence and coverage

The external Playwright driver was 1.64.1. Explicit installed binaries were used:
Chromium 149.0.7827.55 and Firefox 151.0. Default discovery initially requested
newer browser cache revisions that were not installed. Cached WebKit 27.2 launched
but did not complete the first test sequence; it was stopped after approximately
four minutes. WebKit and Safari are **NOT VERIFIED**, not inferred from Chromium.

For each passing browser, `acceptance-smoke.mjs` recorded:

- 100 route/theme/viewport checks: ten routes × two themes × five widths.
- Widths: 1440, 1024, 768, 390 and 320 CSS pixels.
- 54 source-state checks: nine audit-dependent routes × two themes × three states.
- 106 screenshots: 100 populated views and six empty/invalid/missing Overview views.
- Landmarks, control labels, scoped column headers and visible keyboard skip focus.
- Native select type-ahead, Enter Apply/Reset, disabled styling and no-match states.
- No document overflow or uncaught browser runtime errors.
- 720/360px effective widths for representative 200%/400% reflow. Native browser
  zoom controls were **NOT VERIFIED**.

Machine-readable route results and screenshot inventories are stored outside the
repository in `<evidence>/<browser>/<browser>-acceptance.json`. These list exact
filenames, routes, themes, viewport widths and fixture provenance. Screenshots use
explicitly synthetic UI data, not evidence of real tool execution.

## Route acceptance matrix

All PASS entries below refer to both themes and the five widths above. Navigation,
source states and keyboard checks have explicit assertions; component/data checks
and the unit suite supply additional semantic evidence. A successful render is
not used as proof of execution success.

| Route | Chromium | Firefox | Rendering / navigation / data | Keyboard / labels | Empty / unavailable / invalid | Existing real audit |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/agents` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/agents/[agentId]` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/runs` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/runs/[runId]` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/audit` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/invocations/[invocationId]` | PASS | PASS | PASS | PASS | PASS (empty source gives 404) | PASS |
| `/tools` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/tools/[tool]` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/policies` | PASS | PASS | PASS | PASS | NOT APPLICABLE: policy not ingested | PASS: neutral limitation |

WebKit/Safari coverage for every route: **NOT VERIFIED**. Real-data checks used
Chromium and both themes at desktop width; real-data Firefox/mobile coverage is
**NOT VERIFIED**. Synthetic-data responsive verification is a separate PASS.

## Phase regressions

| Phase | Result | Supporting checks |
| --- | --- | --- |
| P1 | PASS | Apply/Reset, same-URL drafts, GET without JS, Back/Forward, URL controls, pagination, inclusive UTC dates |
| P2 | PASS | Default Obsidian, Light, Sun/Moon, persistence/navigation, first frame, invalid/Midnight/blocked storage, no hydration errors |
| P3-A | PASS | Six destinations, ten route mappings, parent highlighting, mobile disclosure, Enter/Space/Escape/blur/resize, skip link |
| P3-B | PASS | Eight metric values, 80px desktop cards, independent badges, neutral policy limitation, incomplete/conflicting evidence |
| P4-A | PASS | Six native fields, shared 44px controls, primary/secondary actions, applied-only count, focus and disabled styles |
| P4-B | PASS | Numeric right alignment, headers, stable desktop timeline columns, mobile labels, full IDs, scope links, keyboard local scrolling |
| P4-B.1 | PASS | Whole UTC seconds without rounding, original `dateTime`/accessible label and full detail precision, non-UTC browser timezone |

The full prior-phase scripts passed in Chromium and Firefox. After harness
corrections, the affected component and final acceptance checks were rerun.

## Commands and results

From `console/`:

```bash
npm test
npx tsc --noEmit
npm run build
```

Results: **69 tests passed, zero skipped**, TypeScript PASS, production build PASS.
The configured test runner compiles tests with the declared TypeScript compiler.
There is no configured ESLint/formatter command; no tooling migration was added.

With the existing external Playwright module and installed executable selected
through environment variables, the executed browser command was:

```bash
AGENTTRUST_BROWSER=chromium node scripts/filter-smoke.mjs \
  --themes --navigation --components --controls --data --timestamps --acceptance
# Repeat with AGENTTRUST_BROWSER=firefox and its matching executable path.
```

Set `AGENTTRUST_PLAYWRIGHT_MODULE`, `AGENTTRUST_BROWSER_EXECUTABLE`,
`AGENTTRUST_COMPONENT_EVIDENCE_DIR` and `AGENTTRUST_ACCEPTANCE_EVIDENCE_DIR` first.
The runner creates an isolated loopback server and synthetic temporary audit file.
The final acceptance-only reruns used `node scripts/filter-smoke.mjs --acceptance`.
The Chromium component rerun used `--components --acceptance`.

Additional checks: `node --check` on new scripts and `git diff --check` in both
repositories passed. Next.js generated type-reference changes were restored.
The local production build required permission to bind Turbopack's internal port;
the successful retry did not change build configuration.

## Existing real deployment verification

The existing supported Compose deployment was inspected. Only its Console image
was rebuilt and its Console service recreated; Gateway configuration, source,
credentials, audit schema and tool services were not changed. All five services
were healthy afterward. The Console remained loopback-published. A read-only agent
health probe reached the Gateway with TLS certificate validation intact.

A temporary snapshot of existing persisted audit data was projected by the actual
bounded Console reader (`scripts/project-audit.mjs`) and compared to the live
Console with `scripts/real-acceptance-smoke.mjs`:

- 52 records, 16 distinct invocations, no lifecycle double-counting.
- 10 ALLOW, 4 DENY, 2 unknown authorization summaries.
- 6 SUCCEEDED, 0 FAILED, 6 NOT_EXECUTED, 4 UNKNOWN; no incomplete/conflicting
  lifecycles in this existing real snapshot.
- All eight Overview metrics matched the projection.
- Every invocation's authorization, execution and original timestamp matched.
- Existing detail event IDs and invocation IDs matched the persisted evidence.
- Ten routes and both themes rendered; DENY filtering matched the projection.
- No raw credentials, private keys or server filesystem paths were found by the
  browser HTML assertions. Browser runtime error capture was empty.
- The audit mount was read-only. The snapshot and live file had the same SHA-256
  and 29,199-byte length after verification; no audit records were altered.

No credentials were issued or displayed, and no tools were executed for P5.
This is real persisted-evidence integration, not a new end-to-end execution test.
Missing/invalid source tests modified only isolated synthetic fixtures. Failure
and conflict presentation beyond the existing real states was tested synthetically.

## Accessibility and visual review

PASS: semantic banner/main/navigation, labeled controls, table column scopes,
keyboard skip/navigation/disclosure interactions, native select type-ahead,
Enter/Space actions, visible focus, local table scrolling, reduced motion and
status text independent of color. Existing computed text/control/badge contrast
assertions passed in both themes in both passing engines. These are targeted
checks, not a complete automated accessibility audit.

Representative desktop, 1024px, tablet and narrow screenshots were visually
reviewed, including the Audit controls, tables, Run timeline and Invocation detail.
No reproducible product clipping, overlap or document-overflow defect was found.
Local table scrolling deliberately preserves offscreen columns.

NOT VERIFIED: native 200%/400% browser-chrome zoom, assistive-technology output,
human-operated keyboard traversal, and a full axe/WCAG audit. No existing axe
installation or screen-reader testing session was available. Effective-width
reflow and real automated keyboard events do not substitute for these checks.
No WCAG conformance claim is made.

## Defect / issue register

| ID | Severity / affected scope | Reproduction and evidence | Disposition |
| --- | --- | --- | --- |
| P5-TEST-001 | Low; Firefox component verifier | Run `--components`: metric `scrollHeight` exceeds its line box even with visible overflow; screenshot and recorded value boxes show no cut text | Fixed harness: retain width checks, detect hidden/clipped height overflow and require ink to remain within card bounds. Component/full browser regressions passed; no UI change |
| P5-TEST-002 | Low; acceptance harness on macOS | Native select Home/ArrowDown was assumed to commit an option; final value remained All in both engines | Replaced platform-specific assumption with native type-ahead plus Tab and Enter Apply/Reset; both final matrices passed |
| P5-TEST-003 | Low; screenshot presentation, both themes | Capturing immediately after skip-link keyboard test left its intentional focus overlay over branding | Verify focus first, then blur before ordinary portfolio capture; keyboard assertions retained |
| P5-ENV-001 | Verification limitation; WebKit/Safari | Default driver/browser cache revisions differed; explicit cached WebKit launched but did not complete first sequence, then was stopped | NOT VERIFIED; no browser/security checks disabled and no product compatibility claim |
| P5-ENV-002 | Resolved environment limitation; Docker/build | Sandboxed Docker builder activity-file write and Turbopack port binding were denied | Successful permitted retries; no configuration/security changes |
| P5-OBS-001 | Low, pre-existing heading hierarchy; all routes | Acceptance manifest records no h1; visible page titles begin at h2 | Documented for future accessibility review, outside confirmed regression fixes. Not by itself a WCAG failure declaration |

No confirmed application regression required a product-code correction.

## Documentation and portfolio assessment

The README was reviewed for routes, native filtering, horizontal navigation,
themes, metrics, scopes, timestamp precision, startup and limitations. Existing
behavior descriptions remain accurate. The verification instructions now describe
explicit browser selection, the acceptance matrix and read-only real integration.
Historical phase records remain unchanged.

Recommended screenshots, relative to the Chromium evidence directory:

| Use | File | Theme / width |
| --- | --- | --- |
| Overview | `chromium-overview-obsidian-1440.png` | Obsidian / 1440 |
| Audit Explorer | `chromium-audit-light-1440.png` | Light / 1440 |
| Run Details | `chromium-run-detail-obsidian-1440.png` | Obsidian / 1440 |
| Tool Details | `chromium-tool-detail-light-1440.png` | Light / 1440 |

Label these as synthetic demonstration data if used for a portfolio. Do not pass
fixture screenshots off as real operational execution evidence. No screenshots,
documentation or project descriptions were published by this verification.

Supported description: a local read-only security/audit viewer with separate
Gateway authorization and execution evidence, invocation timelines, UTC filters,
responsive tables and two themes. Suitable for a GitHub/portfolio/technical project
showcase with the limitations stated alongside it.

Required limitations: local MVP only; no production deployment/readiness claim;
no application-level Console login; local credential management; trusted Docker
host administrators; no Gateway policy ingestion; no claim of complete browser,
assistive-technology or WCAG coverage. Filesystem evidence is not tamper-proof.

## Change inventory

- `console/scripts/filter-smoke.mjs`: explicit browser selection and P5 hook.
- `console/scripts/components-smoke.mjs`: Firefox clipping diagnostics/correction.
- `console/scripts/acceptance-smoke.mjs`: route/state/accessibility/screenshot matrix.
- `console/scripts/real-acceptance-smoke.mjs`: read-only real evidence comparison.
- `console/README.md`: current verification instructions and report link.
- `console/docs/p5-verification.md`: this report.

Application source, dependencies, API contracts and the private repository are
unchanged. Final intended tree: three modified files and three new files, unstaged.
Classification remains **READY_WITH_DOCUMENTED_LIMITATIONS**, pending manual
acceptance and the explicitly unverified browser/accessibility scenarios.
