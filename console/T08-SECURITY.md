# T08 Console dependency security

Verified on 2026-10-24 with Node.js 22.23.1 and npm 10.9.8. Initial working tree
was clean. Scope is Console dependency remediation only; no application source,
Gateway, SDK, schema, deployment or CI changes.

## Baseline

Commands: `npm audit --json`, `npm outdated`, `npm ls --depth=0`, and dependency
path inspection using `npm ls ... --all`.

The initial audit reported **six affected packages: one critical, two high and
three moderate**. These represent fourteen unique advisories; `postcss-nested`
and `tailwindcss` inherit the selector-parser advisory rather than adding separate
vulnerabilities. React and React DOM 19.2.8 had no reported advisories.

The package has no explicit Node engine declaration. Both the installed Next.js
16.3.4 and selected 16.4.1 require Node >=20.9.0; Sharp has the same requirement.
The runtime requirement has not increased. TypeScript 5.9.3 compiles the Node test
suite; `npm test` runs 25 tests. The package has no configured ESLint/formatter.

`npm outdated` also reported newer unrelated releases: React/React DOM 19.3.1,
Next.js 16.4.3, Tailwind 4.3.3, TypeScript 7.0.2, Lucide 1.61.0, and updates for
PostCSS, Autoprefixer and type packages. These were not blanket-upgraded.
Next.js 16.4.1 is the first release in major 16 covering every baseline Next
advisory; 16.3.8 alone would leave the advisories affecting <=16.4.0.

Initial sandbox registry metadata requests encountered DNS restrictions; rerunning
with approved registry access succeeded. The final audits are real registry
results, not a cached or offline assumption.

## Remediation and dependency paths

All versions below are installed/locked versions, not just manifest ranges.

| Package / path | Before → after | Baseline severity | Production status and assessment | Remediation impact |
| --- | --- | --- | --- | --- |
| `console → next` | 16.3.4 → 16.4.1 | Critical aggregate | Production framework; feature-specific reachability below | Compatible major-16 minor upgrade; manifest minimum raised to `^16.4.1` |
| `next → sharp` | 0.35.4 → 0.35.5 | High | Optional production image processing dependency; no `next/image`/SVG processing in current application code | Patch within Next's supported range; matching native binaries updated |
| `next → postcss → source-map-js`; also direct dev PostCSS/Tailwind chains | 1.2.1 → 1.2.2 | High | Present in production tree and build tooling; no audit ingestion or request API accepts source maps | Compatible transitive patch, lockfile only |
| `tailwindcss → postcss-selector-parser` and `tailwindcss → postcss-nested → postcss-selector-parser` | 6.1.4 → 7.1.6 | Moderate | Development/build-only selector parsing; sources are repository-controlled, not audit values | Exact npm override; narrow transitive major change avoids Tailwind 4 migration |
| `tailwindcss → postcss-nested` | 6.2.0 → 6.2.0 | Moderate inherited | Build-only; affected via parser | Its parser resolves to 7.1.6; no direct version change required |
| `tailwindcss` | 3.4.19 → 3.4.19 | Moderate inherited | Development/build-only | Fixed both parser paths; no framework/CSS configuration migration |

Next's `@next/env` and all SWC platform packages move together to 16.4.1.
Sharp platform packages move together to 0.35.5 and their libvips packages move
1.3.3 → 1.3.4. These are required companion updates. No package paths or lifecycle
install-script flags were added to the lockfile. React, React DOM, TypeScript,
Tailwind, PostCSS, Autoprefixer, Lucide and type-package versions are unchanged.

The override is a deliberate compatibility exception: the consumers declare
parser 6.x, while the advisory's fixed version is 7.1.6. The
[7.0 release](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0)
changes insertion-during-iteration behavior. Current Console output was checked:
build succeeds, generated CSS is identical to the prior built assets after
normalizing only Next's generated font class name, and browser styling/interaction
passes. Retain the exact override until the upstream dependency ranges include a
patched parser, and reassess it when changing Tailwind or adding PostCSS plugins.
No force audit fix, new runtime dependency or test dependency was used.

## Advisory inventory and application assessment

Each Next row applies to installed `next@16.3.4` at `node_modules/next`; the selected
16.4.1 resolves all rows. Feature absence reduces current reachability but is not
a claim that every framework vulnerability has been exhaustively proven unreachable.
The production framework was upgraded regardless.

| Advisory | Severity | First fixed Next 16 version | Current Console assessment |
| --- | --- | --- | --- |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), `next/og` ImageResponse RCE | Critical | 16.3.6 | No `next/og` or ImageResponse routes |
| [GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7), Draft Mode cache leak | Moderate | 16.3.8 | No Draft Mode or `use cache` |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676), SSG/ISR cache poisoning | Moderate | 16.3.8 | Audit pages use dynamic rendering, not SSG/ISR |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv), development MCP endpoint disclosure | Low | 16.3.8 | Development-server issue inside the production dependency; not `next start` behavior |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x), metadata image-route bypass | Moderate | 16.3.8 | No dynamic metadata image routes |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p), SSG/ISR substitution/DoS | Moderate | 16.3.8 | No SSG/ISR audit pages |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4), image optimization SSRF | High | 16.3.8 | No `next/image` usage or remote-image configuration |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), SVG image optimization RCE | Critical | 16.4.1 | No application SVG image optimization path; advisory conditions include glibc Linux |
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), Server Actions DoS | High | 16.4.1 | No Server Actions; filter forms use GET |
| [GHSA-h694-7cp9-m8p3](https://github.com/advisories/GHSA-h694-7cp9-m8p3), nested cache root-param leak | Moderate | 16.3.8 | No `use cache` functions |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr), typed-array cache RCE | Critical | 16.4.1 | Cache Components not enabled, no `use cache` functions |

Other direct advisory sources:

| Advisory / baseline package | Severity | Patched version | Assessment |
| --- | --- | --- | --- |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), CVE-2026-96889 / Sharp 0.35.4 | High | 0.35.5 | Production optional native image library; overlaps Next's SVG advisory; fixed native dependency rather than relying on current host/feature absence |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), CVE-2026-93749 / source-map-js 1.2.1 | High | 1.2.2 | Production-tree and build dependency; attack needs crafted indexed source maps; no such application input path identified |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), CVE-2026-104844 / postcss-selector-parser 6.1.4 | Moderate | 7.1.6 | Build-only trusted CSS; vendor advisory distinguishes this from request-time untrusted selectors; remediated with the tested override |

## Verification

| Check | Result |
| --- | --- |
| `npm ci` | PASS; fresh lockfile installation |
| `npm audit` and `npm audit --json` | PASS; **zero vulnerabilities**, all severity counts zero |
| `npm audit --omit=dev --json` | PASS; zero production vulnerabilities |
| `npm ls --depth=0` and targeted `npm ls ... --all` | PASS; installed versions and both parser paths verified |
| `npm test --if-present` | PASS; 25 tests, zero skipped |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; Next.js 16.4.1, dynamic server-rendered audit routes preserved |
| Existing `console/tests/test_gateway_console.py` with real Gateway configured | PASS; one integration test exercising five real HTTP/MCP lifecycles |
| Existing Chromium `scripts/ui-smoke.mjs` against production build | PASS; desktop/mobile, dashboard/list/details/timeline/filtering, source states and security boundaries |
| `git diff --check` | PASS |
| ESLint / formatter | Not configured; no tooling expansion |

Real integration produced 18 persisted records grouped into five invocations:
HTTP success, HTTP denial, MCP success, MCP application failure and uncertain
post-dispatch timeout. Expected metrics remained total 5, allowed 4, denied 1,
succeeded 2, failed 1, not-executed 1, unknown 1, incomplete/conflicting 0.
IDs and audit outcomes matched; denied execution produced zero upstream calls.

The actual browser smoke suite verified matching invocation IDs, filtering,
invocation detail/timeline, 390px mobile width, missing versus empty
source behavior, malformed-source errors, ignored query file paths, absence of
an execution API and no browser runtime exceptions. Inaccessible-file behavior is
also covered by the Node filesystem tests. The desktop screenshot was visually
inspected. The server was bound to loopback; failure simulations used only a
restored test copy of real evidence, never live Gateway storage.

`npm ls --depth=0` reports optional WASM packaging artifacts (`@emnapi/runtime`
and `@img/sharp-wasm32`) as extraneous before and after `npm ci`; they are not new
direct dependencies. All vulnerable installed parser paths resolve to 7.1.6.

## Security boundaries, remaining risk and scope

Application source and architecture are unchanged. Audit ingestion stays
server-side and read-only. No public environment variables, query-controlled
sources, unsafe HTML, mutation API or raw audit route was added. Existing tests
check sensitive-field omission, symlink/path restrictions, bounded parsing,
missing-source errors, and absence of implicit fixtures. The patched dependency
tree introduces no new package paths or install-script flags and does not add an
application network listener. The test-only production server uses loopback.

**Remaining npm advisories: none reported by the final full and production-only
audits.** This reflects registry coverage at verification time, not a guarantee
against undisclosed vulnerabilities. The parser override crosses a transitive
major boundary and is verified for this application's present build and smoke
suite, not every possible future plugin. Existing local access-control and audit
retention limitations documented in T07 are unchanged.

Changed files:

- `console/package.json`: Next minimum and exact parser override.
- `console/package-lock.json`: reproducible security updates and required native
  companion packages.
- `console/T08-SECURITY.md`: baseline, advisory inventory, applicability,
  compatibility considerations and verification (this report).

The build-generated `next-env.d.ts` change was restored. No unrelated upgrades,
Gateway/SDK source changes, new tests, deployment changes or CI changes were made.
Nothing was staged, committed or pushed.

Suggested commit: `fix(console): remediate Next.js and transitive dependency advisories`
