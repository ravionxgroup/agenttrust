# T07 implementation and verification

## Compatibility assessment

Gateway audit schema v1 has four lifecycle stages with independent event IDs,
Gateway invocation IDs, UTC RFC3339 timestamps, uppercase authorization and
execution states, plus legacy aliases. The previous Console consumed SDK events
with epoch `ts` and lowercase decisions and could silently fall back to fixtures.
A separate Gateway projection is required; neither ALLOW nor the authorization
record's legacy `not_executed` snapshot establishes execution success.

The Console now reuses existing layout, cards, badges and entity pages while
providing Gateway-specific overview, explorer and invocation details. Neither the
Gateway schema nor SDK execution behavior changes. Default mode is Gateway;
fixtures and legacy SDK mode require explicit selection.

## Final architecture and rules

`AGENTTRUST_GATEWAY_AUDIT_PATH` selects one server-only, read-only JSONL source.
The bounded file reader validates schema/IDs/states and projects allow-listed
metadata; no path, token ID, payload or unknown field is sent to browsers. The
provider caches one read per provider instance. Source failures have fixed codes
and never substitute fixtures. Query parameters only filter/paginate evidence.

Bounds: 8 MiB file, 16 KiB line, 5,000 records, depth 32, 4 MiB safe projection;
100 invocation rows/timeline events per page. Reject symlinks in all components,
nonregular files, inconsistent opened inode/device and malformed/partial records.
There are no audit mutation, credential or tool execution routes.

Group only by invocation ID. Identical duplicate event IDs are counted and
explicitly deduplicated. Conflicting copies/stages/identity/authorization are
flagged, retaining safe individual events and setting both summaries UNKNOWN.
Out-of-order input is sorted by original nanosecond timestamps then event ID.
Missing stages remain visible. ALLOW without a result remains UNKNOWN. Terminal
DENY/NOT_EXECUTED and authentication UNKNOWN/NOT_EXECUTED establish non-dispatch.
A positive pre-dispatch NOT_EXECUTED result needs no intent record. A valid result
in a partial capture retains its state alongside an Incomplete label.

Metrics count distinct observed invocations once: total, allowed, denied,
succeeded, failed, not-executed, unknown, authorization-unknown. Incomplete and
conflicting flags can overlap these states. Counts describe only this snapshot.
The dashboard displays total/allowed/denied/succeeded/failed/unknown/incomplete/
conflicting; the projection also exposes the remaining two counts.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | PASS: 25 tests, zero skipped |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, all routes rendered dynamically |
| ESLint / formatter | Not configured or installed; no dependency added |
| `AGENTTRUST_PLATFORM=... python3 -m pytest -q --tb=short -rs console/tests/test_gateway_console.py tests/test_gateway_integration.py` | PASS: 11 tests, zero skipped |
| Python compilation of new integration test | PASS |
| `go test ./internal/audit ./internal/gateway` | PASS (cached) |
| Actual Chromium production UI smoke test | PASS |
| `git diff --check` | PASS |

Console tests cover lifecycle combinations, partial/out-of-order records,
duplicates/conflicts, ID separation, schema validation, malformed JSONL, duplicate
JSON keys, depth/file/line/record/projection limits, missing/unreadable sources,
leaf/parent symlinks, secret sentinels, filters, counts, safe rendering and absence
of execution/mutation routes and implicit fixture fallback.

Real SDK → Go Gateway → HTTP/MCP integration generated 18 persisted records for
five invocations: authorized HTTP SUCCEEDED, denied HTTP NOT_EXECUTED, authorized
MCP SUCCEEDED, MCP application error FAILED, post-dispatch timeout UNKNOWN.
Reader IDs/authorization/outcomes match persisted records and counts are
`total=5, allowed=4, denied=1, succeeded=2, failed=1, notExecuted=1, unknown=1,
incomplete=0, conflicting=0`. Denied upstream calls remain zero. These are actual
Gateway records, not synthetic records or SDK response-derived audit events.

Browser checks used a production server bound to 127.0.0.1 and a copy of those
real records. Dashboard/list/filter/details/timeline, matching invocation IDs,
390px mobile layout, missing/invalid/empty source, ignored query paths, absent
execution endpoint and no browser runtime exceptions all passed. Missing-source
checks also cover the existing agent/run/tool list and detail pages. Desktop and
mobile screenshots were visually inspected. Test-only source-state simulations
modify and restore the copy, never Gateway storage.

## Scope and limitations

Only Console implementation, documentation and test harness files changed.
Gateway working tree remains clean; SDK and dependency declarations are unchanged
apart from Console test/typecheck scripts. No files staged, committed or pushed.
The Next-generated `next-env.d.ts` was restored after building to avoid an
unrelated generated-path change.

This is a local snapshot viewer, without application authentication, database,
automatic retention or live tailing. Bind to loopback or protect deployment
access. Oversized sources fail explicitly; operators manage retention externally.
In-progress appends can temporarily produce INCOMPLETE_WRITE. Safe metadata is
still sensitive operational context. The viewer cannot authenticate a local
writer, prove audit completeness, guarantee immutability, or replace missing
persisted evidence with Gateway logs/responses. Legacy SDK mode remains a separate
compatibility reader, without these Gateway lifecycle guarantees. Full Python
suite and full Go suite were not repeated because production SDK/Gateway code was
unchanged; the relevant real integration and audit regressions passed.

Configuration, permissions, lifecycle details, fixture mode, commands to generate
real records, browser reproduction and troubleshooting are in [README](README.md).

Suggested commit: `feat(console): integrate persisted Gateway audit lifecycles`

## Changed files

- `console/README.md`
- `console/package.json`
- `console/scripts/project-audit.mjs`
- `console/scripts/test.mjs`
- `console/scripts/ui-smoke.mjs`
- `console/src/app/agents/[agentId]/page.tsx`
- `console/src/app/agents/page.tsx`
- `console/src/app/audit/page.tsx`
- `console/src/app/invocations/[invocationId]/page.tsx`
- `console/src/app/layout.tsx`
- `console/src/app/page.tsx`
- `console/src/app/policies/page.tsx`
- `console/src/app/runs/[runId]/page.tsx`
- `console/src/app/runs/page.tsx`
- `console/src/app/tools/[tool]/page.tsx`
- `console/src/app/tools/page.tsx`
- `console/src/components/badges/decision-badge.tsx`
- `console/src/components/metrics/source-indicator.tsx`
- `console/src/components/tables/execution-timeline.tsx`
- `console/src/components/tables/gateway-audit.tsx`
- `console/src/lib/domain.ts`
- `console/src/lib/format.ts`
- `console/src/lib/gateway/ingest.ts`
- `console/src/lib/gateway/model.ts`
- `console/src/lib/providers/audit-jsonl.ts`
- `console/src/lib/providers/gateway.ts`
- `console/src/lib/providers/index.ts`
- `console/tests/gateway.test.tsx`
- `console/tests/test_gateway_console.py`
- `console/T07-VERIFICATION.md` (this report)
