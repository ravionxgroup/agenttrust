# AgentTrust Console

Read-only local visibility into **persisted Go Gateway audit lifecycle schema v1**.
The Gateway remains the enforcement boundary. The Console neither executes tools
nor issues credentials, edits policy, or repairs audit records.

## Run with real Gateway evidence

From `agenttrust/console/`:

```bash
npm ci
npm run build
AGENTTRUST_CONSOLE_SOURCE=gateway \
AGENTTRUST_GATEWAY_AUDIT_PATH=/absolute/physical/path/to/gateway-audit.jsonl \
npm exec next start -- --hostname 127.0.0.1 --port 3000
```

For development use the same environment variables with
`npm run dev -- --hostname 127.0.0.1`. `gateway` is the default source mode;
**no configured source means unavailable, never demo data**. Variables are
server-only; do not prefix them with `NEXT_PUBLIC_`. Query parameters cannot
select an audit file. Relative environment paths resolve against the server's
working directory; absolute paths are recommended.

Use the path of the JSONL sink configured on the Gateway. Grant the Console OS
user read access to the file and traversal access to its directories; no write
permission is needed. Keep the directory under trusted operator control. Symlinks
in any path component are rejected. On macOS use physical `/private/tmp/...`
rather than the `/tmp` symlink. The reader requires POSIX `O_NOFOLLOW` and
`O_NONBLOCK` support and rejects unsupported filesystems/platforms.

Bind the Console to loopback, or protect it through deployment access controls.
There is no application authentication in this local MVP. Operational identities
and scope names remain sensitive even though payloads and credentials are omitted.
Network isolation is a deployment responsibility, outside T07.

## Ingestion and safe evidence

Each server request reads one bounded snapshot through a read-only file handle.
All views in that provider instance share its projection. Pages render dynamically;
refresh to see newly persisted events. There is no background tailer or database.
The file must be regular; the opened inode/device must match the inspected file.

| Bound | Limit |
| --- | --- |
| JSONL snapshot | 8 MiB |
| One line | 16 KiB |
| Nonblank records | 5,000, including duplicate copies |
| JSON nesting | 32 levels |
| Serialized safe projection | 4 MiB |
| Invocation list / detail timeline | 100 rows / events per page |
| Overview | 20 recent invocations |

These caps bound processing and returned evidence. The projection cap is not an
exact HTTP response byte cap (HTML and framework framing add overhead). Large
sources fail explicitly; this MVP does not silently tail, truncate, or discard
older evidence. Operators must arrange trusted source selection/retention outside
the Console. The Console never rotates, modifies, or deletes Gateway records.

UTF-8, complete newline-terminated JSONL, schema version, canonical stage/state
combinations, aliases, IDs and UTC timestamps are validated. Duplicate JSON keys
are rejected. One malformed/unsupported record invalidates the entire view;
skipping records could hide a conflict or create apparent success. A snapshot
ending during an append is temporarily `INCOMPLETE_WRITE`; refresh after the
write completes. An empty readable file is explicitly empty, not proof that any
tool succeeded. Missing, inaccessible, invalid, oversized and unsafe sources show
fixed error codes and suppress dashboard counts. Filesystem paths and OS errors
are not sent to the browser. No source failure substitutes fixtures.

Only allow-listed metadata reaches the UI: event/invocation/request IDs,
timestamp, stage, safe agent/run/tool/scope strings, canonical decisions/outcomes,
and a finite vocabulary of Gateway reason codes (`other` for unrecognized codes).
Token IDs, trace IDs, credentials, argument data, headers, upstream bodies and
unknown fields are omitted. Identity text is length/character bounded; bearer/JWT
patterns and unsupported text are redacted. Internal hashes used for conflict
checks are not exposed. Event details show this safe projection, not raw JSONL.
React text rendering is used; no arbitrary HTML or raw-file endpoint is provided.
This is an evidence viewer, not cryptographic verification or tamper-proof storage;
a same-privilege malicious local writer is outside its trust boundary.

## Lifecycle correlation and metrics

The source contract is `agenttrust-platform/docs/audit-schema-v1.md`. SDK legacy
records use a different schema (`ts`, lowercase decisions, one row per call);
they are not silently interpreted as Gateway lifecycles.

Group **only by Gateway `invocation_id`**. Preserve original event IDs and UTC
nanosecond timestamps, sort the timeline by timestamp then event ID, and accept
out-of-order input. Caller `request_id` is correlation metadata, never a grouping
key. Agent/tool matches alone cannot merge invocations.

- `authorization_decision` supplies ALLOW, DENY or UNKNOWN. Missing authorization
  is UNKNOWN with an explicit missing-evidence label.
- ALLOW never implies success. Only a valid `execution_result` supplies SUCCEEDED,
  FAILED, NOT_EXECUTED or UNKNOWN. Missing terminal evidence stays UNKNOWN.
- Terminal DENY/NOT_EXECUTED or authentication UNKNOWN/NOT_EXECUTED is positive
  evidence of non-dispatch and needs no invented execution result.
- A normal ALLOW lifecycle needs receipt, authorization, intent and result.
  A definite pre-dispatch NOT_EXECUTED result does not require intent. Missing
  stages are labeled **Incomplete**. A valid terminal result in a partial capture
  retains its outcome while exposing the missing stages.
- Identical copies of an event ID are explicitly deduplicated and counted.
  Differing copies, repeated stages with different event IDs, conflicting identity
  or authorization, or execution evidence after non-allow authorization mark
  **Conflicting evidence**. Both summary outcomes become UNKNOWN; original safe
  event evidence remains visible. Conflicts never win in favor of success.

Every metric counts **distinct observed invocations**, not events. Allowed/denied
count the summary authorization; successful/failed/not-executed/unknown count the
summary execution. Missing execution contributes to unknown. Conflicts contribute
to unknown authorization and execution. Incomplete and conflicting counts are
integrity flags and can overlap outcome counts. Dashboard totals describe only
the readable configured snapshot, not all executions in the system.

The overview and Audit explorer separate authorization, execution and integrity.
Filters support agent, tool, authorization, execution and inclusive UTC time range
(using the earliest observed timestamp of each invocation). Details show missing
stages, conflict reasons, event IDs and safe evidence. Existing Agents/Runs/Tools
views reuse one projected row per invocation; their activity counts are not raw
lifecycle event counts. Gateway mode does not ingest policy or imply that a
persisted ALLOW proves the current policy or external business state.

## Explicit fixtures and legacy SDK mode

```bash
AGENTTRUST_CONSOLE_SOURCE=fixtures npm run dev -- --hostname 127.0.0.1
```

Fixtures remain clearly labeled demo data and are never a recovery path.
For the older SDK audit viewer, explicitly set `AGENTTRUST_CONSOLE_SOURCE=sdk`
and `AGENTTRUST_AUDIT_PATH`; optional `AGENTTRUST_POLICY_PATH` retains its legacy
behavior. This compatibility viewer is separate from the bounded Gateway reader
and does not provide Gateway invocation lifecycle guarantees. A missing SDK source
also never substitutes fixtures. Local SDK authorization does not provide the
Gateway's enforcement boundary.

## Verification and generating real evidence

### P2 appearance themes

The Console supports Obsidian (default) and Light. A compact native icon button
sits in the header's branding row. Sun switches
Obsidian to Light; Moon switches Light to Obsidian. Its accessible name and tooltip
describe the destination theme. Enter and Space activate it, and reduced-motion
preferences disable its color transition.
Switching changes the root `data-theme` attribute immediately without navigation.
Only the theme name is saved under `agenttrust.console.theme.v1` in localStorage.
Invalid preferences (including a previously stored Midnight choice) fall back
to Obsidian. If storage is unavailable, switching still works in the current
document, but persistence is unavailable.

CSS RGB custom properties in `src/app/globals.css` supply semantic Tailwind
colors. Existing component layouts and behavior are unchanged; authorization,
execution and integrity retain separate labels and semantic color families.
Control borders have separate contrast tokens from decorative card separators.

`src/lib/theme.ts` contains a fixed application-owned script that runs in the
document head before the body paints. It accepts only the two supported values;
storage contents are never interpolated into executable code. The button
hydrates with deterministic, initially disabled markup and then reads the root
attribute; the icon stays hidden until hydration so a restored Light preference
does not briefly display the wrong icon. Only the root's intentional attribute
change uses hydration-warning suppression. Pages and audit providers remain
server-rendered. With JavaScript
disabled, Obsidian remains available and the toggle stays disabled.

**Future CSP hardening:** this initialization script requires an authorized
script hash or per-response nonce under a restrictive `script-src`. Its current
SHA-256 source is `sha256-Tp1fNEXuVfGOBGyQ8xFK9rXJFFe98ybFTh58sRE58xs=`.
Recompute it whenever the exact script bytes change. Do not add `unsafe-inline`
or interpolate user input to accommodate themes. Next.js runtime scripts need
their own compatible CSP treatment; this hash alone is not a complete CSP policy.
No CSP or security-header behavior is changed in P2.

Unit tests calculate contrast from the actual CSS tokens, including 10% tinted
semantic backgrounds: normal text/badges must meet 4.5:1, control borders and
focus indicators 3:1. Current minimum ratios (text / badges / control borders):
Light 5.25 / 4.61 / 3.24;
Obsidian 6.08 / 5.05 / 4.54. These checks are not a full accessibility certification.

After `npm run build`, run theme browser checks together with P1 regressions:

```bash
AGENTTRUST_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node scripts/filter-smoke.mjs --themes
```

The runner uses only its temporary UI fixture and loopback server. It checks
both themes across existing routes, early initialization, reload/client-navigation
persistence, Sun/Moon icons, dynamic labels/tooltips, Enter/Space, reduced motion,
keyboard focus, rendered contrast, invalid/blocked storage,
empty/unavailable/error states and browser/hydration errors. Set
`AGENTTRUST_THEME_EVIDENCE_DIR` to an optional local screenshot directory.
Playwright remains externally supplied; no package dependency is added.

### P3-A horizontal navigation

The server-rendered header has a 64px branding row and a 48px horizontal
navigation row. The existing Sun/Moon toggle remains in the branding row.
The six destinations are unchanged. At widths of 640px and above all links are
visible; smaller viewports use a native Navigation button and a two-column disclosure.
This is ordinary link navigation, not an ARIA menu or modal drawer.

The mobile button exposes `aria-expanded` and `aria-controls`. Escape closes the
menu and restores button focus. Selection, route changes, outside clicks and
tabbing out close it; resizing keeps focus out of hidden controls. Mobile menu
interaction requires JavaScript. Desktop links remain ordinary anchors.

Section matching uses path-segment boundaries, including invocation details under
Audit. A border, heavier text and accent color identify the active section.
Only exact destinations receive `aria-current="page"`; highlighted parent links
on detail pages instead have a "Current section" description. A skip link targets
the single main landmark. Header and content share a centered 1600px maximum
width; existing page padding and table scroll containers are retained.

After a production build, use the same external Playwright setup:

```bash
AGENTTRUST_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node scripts/filter-smoke.mjs --themes --navigation
```

The navigation runner tests both themes at 1440, 768, 640, 639, 390 and 320px, all six links,
all ten route mappings, parent versus exact-page semantics, mobile keyboard and
close behavior, resize focus, skip navigation, theme persistence, reduced motion,
page overflow and the large-screen content cap. Optional screenshots go to
`AGENTTRUST_NAVIGATION_EVIDENCE_DIR`. These use isolated UI-only test fixtures;
they are not new real-Gateway interoperability evidence. No dependencies, routes,
providers, filtering, pagination or audit semantics change in P3-A.

### P3-B compact shared components

Overview retains its eight metrics and four desktop columns. Shared metric cards
use a content-driven minimum height of 80px, 14px vertical/16px horizontal padding,
28px tabular values and smaller decorative icons. Long values can wrap. Run summary
timestamps also wrap instead of using ellipsis. Status badges share sizing while
retaining separate authorization, execution and evidence-integrity labels/colors.
Policy-source indicators are neutral; ingestion limitations remain visible.

After a production build, capture component evidence and run all UI regressions:

```bash
AGENTTRUST_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
AGENTTRUST_COMPONENT_EVIDENCE_DIR=/private/tmp/agenttrust-component-evidence \
node scripts/filter-smoke.mjs --themes --navigation --components
```

The component runner checks all eight metric values, desktop dimensions, badge
heights, responsive clipping, Run/invocation details, policy limitations and
empty/error states in both themes. It saves screenshots and measured dimensions.
Use `--components-before` against the previous build for a baseline capture.
These checks use only the runner's temporary synthetic audit file, not live
Gateway storage or new interoperability evidence.

### Existing regression checks

```bash
npm test
npm run typecheck
npm run build
```

The Node test runner uses the existing TypeScript compiler; no added test dependency.
No ESLint/formatter command is configured in this package.

For the P1 Gateway filter regression, build the Console first and provide the
same external Playwright setup used by the smoke runner below:

```bash
AGENTTRUST_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node scripts/filter-smoke.mjs
```

Optionally set `AGENTTRUST_BROWSER_EXECUTABLE` to an existing Chromium executable.
This runner starts its own loopback-only production server on a temporary port,
uses synthetic UI-only audit records in a temporary directory, and cleans both
up afterward. It tests controlled values, Authorization/Tool/combined/date filters,
Reset (including unapplied edits at `/audit`), pagination and Back/Forward. It is
not real Gateway interoperability evidence and never edits Gateway audit storage.

Install Console dependencies with `npm ci` first: the projection CLI imports the
lockfile's TypeScript compiler. From the `agenttrust/` root, with its Python development environment and
Go available, run the real SDK → Gateway → HTTP/MCP fixture and Console reader:

```bash
AGENTTRUST_PLATFORM=/absolute/path/to/agenttrust-platform \
AGENTTRUST_T07_EVIDENCE_DIR=/private/tmp/agenttrust-t07-evidence \
python -m pytest -q console/tests/test_gateway_console.py tests/test_gateway_integration.py
```

This starts a real Gateway, uses temporary keys and its existing trusted demo
issuer, and persists authorized HTTP/MCP, denied HTTP, MCP application failure
and post-dispatch timeout records. It asserts matching invocation IDs, zero denied
upstream calls and five invocations from 18 records. The optional evidence
directory contains a copy of those real persisted records for browser testing;
no keys or tokens are copied. Point the Console at that copy to inspect them.
Without `AGENTTRUST_PLATFORM`, this opt-in integration test is skipped explicitly.

`node scripts/project-audit.mjs` exercises the actual bounded reader from the CLI
using `AGENTTRUST_GATEWAY_AUDIT_PATH`. It emits only the safe projection and is
not exposed as an application endpoint.

For an actual browser smoke test, provide Playwright externally (no production
package change), start the Console on loopback port 3107 against the evidence
copy, then run from `console/`:

```bash
AGENTTRUST_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
AGENTTRUST_T07_EVIDENCE_DIR=/private/tmp/agenttrust-t07-evidence \
node scripts/ui-smoke.mjs
```

Optional `AGENTTRUST_BROWSER_EXECUTABLE` selects an installed Chromium executable;
`AGENTTRUST_CONSOLE_URL` overrides the loopback URL. The script checks the real
IDs, list/filter/details/timeline, mobile layout, missing/invalid/empty states,
query-path isolation, absent execution endpoint and browser exceptions. It
briefly renames/rewrites **only the evidence copy**, restoring it afterwards;
do not run it against live Gateway storage. Screenshots stay in that temporary
directory.

## Troubleshooting

- `PATH_NOT_CONFIGURED`: set the server environment and restart the Console.
- `SOURCE_MISSING` / `SOURCE_UNREADABLE`: verify the configured physical path and
  OS permissions on the server; no demo data will appear automatically.
- `UNSAFE_PATH`: remove symlink components and use a trusted regular file.
- `INCOMPLETE_WRITE` / `SOURCE_CHANGED`: retry after the writer finishes; do not
  edit the source to manufacture a completion event.
- `UNSUPPORTED_SCHEMA`, `INVALID_*`, `DUPLICATE_JSON_KEY`: inspect the source with
  trusted operator tooling. Only Gateway v1 is supported, not historical SDK data.
- `SOURCE_TOO_LARGE`, `RECORD_TOO_LARGE`, `TOO_MANY_RECORDS`, `VIEW_TOO_LARGE`:
  the configured source exceeds this local MVP's documented bounds.
- UNKNOWN or Incomplete: persisted evidence cannot establish a final outcome.
  A successful SDK response or Gateway log is not a replacement audit event;
  do not repeat a side-effecting tool call just to fill an audit gap.
