# T10 SDK and Console CI

`.github/workflows/ci.yml` runs on pull requests, main pushes and manual requests:

- Python 3.9–3.12: install from pyproject extras, pip check, all local SDK tests,
  CI helper tests and syntax compilation. Python 3.9 omits optional MCP and reports
  its three skips. Real Gateway modules run in the separate integration workflow.
- Node 22 Console: npm ci, tests, Next type generation, TypeScript, production
  build, full and production-only npm audits at moderate severity.
- Python security: isolated PyPA pip-audit 2.10.1 against cleanly resolved SDK/dev/
Gateway/MCP extras and pinned demo runtime dependencies; actionlint 1.7.12
  validates workflows. No configured ESLint or Python lint/type checker is added.

`.github/workflows/integration.yml` runs on trusted main pushes and manual
requests. It uses sibling checkout paths `agenttrust/` and `agenttrust-platform/`,
tests the real Go Gateway and independent MCP server, rejects any skipped tests,
runs Console ingestion tests, and builds/starts the existing five-service T09
Compose deployment. The existing verifier proves runtime network isolation,
zero denied upstream calls, audit-write failure protection, persistence and real
Console evidence. No images are published and no deployment occurs.

## Private repository prerequisite

The SDK is public; the Gateway is private. SDK GITHUB_TOKEN cannot read it.
An administrator must configure a protected `cross-repository-ci` environment
with maintainer review, restricted trusted workflow refs and environment-only
`AGENTTRUST_PLATFORM_READ_TOKEN`. Use a short-lived fine-grained PAT with Metadata
read and Contents read **only** on `ravionxgroup/agenttrust-platform`; an equivalent
GitHub App token may be provisioned administratively. Do not put this credential
in repository-wide secrets or grant write access.

Missing access explicitly fails BLOCKED. Private integration is intentionally
not run by pull_request, so untrusted/fork PRs receive no sibling credential.
For a proposed PR, a maintainer reviews the workflow and both commit inputs, then
dispatches the trusted integration workflow. Do not treat Python-only PR checks
as proof of cross-repository integration. Configure branch protection accordingly.

## Compatible revisions

`.github/ci/compatible.json` pins Gateway
`31ab03d5d1afbbb8b23f2cfa4026a62d9538f1fb`, the committed T09 baseline.
The workflow verifies and records both actual SHAs in logs and its summary.
Pin updates require review; update to the reviewed T10 Gateway commit after
coordinated merge to include its new Linux bridge-address probes.

Manual inputs `platform_revision` and `sdk_revision` accept only full lowercase
40-character SHAs reachable from branches of the fixed repositories. No external
repository override is accepted. To test a proposed pair after workflow review:

```bash
gh workflow run integration.yml --repo ravionxgroup/agenttrust --ref main \
  -f platform_revision=FULL_GATEWAY_SHA -f sdk_revision=FULL_SDK_SHA
gh run list --repo ravionxgroup/agenttrust
gh run watch RUN_ID --repo ravionxgroup/agenttrust --exit-status
```

## Security policy and local checks

Actions are commit-pinned, GITHUB_TOKEN is contents-read only, checkout credentials
are not persisted, jobs are time-bounded and obsolete runs cancel. No
pull_request_target, environment dumps, credential artifacts, raw container log
uploads, image publishing, automatic commits or deployment.

Python audits fail on any reported advisory or scanner error; strict mode rejects
unauditable packages. npm audits fail moderate or higher, including production-only
audit. There are no advisory exceptions. The Gateway's original Go findings were
remediated with targeted dependency upgrades; its scan passes with no suppressions.
Keep scanner failures distinct from a clean report. T08 application dependencies
and targeted override are unchanged.

Local SDK reproduction (Python 3.10+ for MCP, 3.12 matches integration):

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -e ".[dev,gateway,mcp]"
python -m pip check
AGENTTRUST_PLATFORM=../agenttrust-platform python -m pytest -q -ra --junitxml=/tmp/agenttrust-tests.xml
python .github/ci/check-results.py /tmp/agenttrust-tests.xml
python -m unittest discover -s .github/ci -p 'test_*.py'
python -m compileall -q agenttrust examples
python -m pip freeze --exclude-editable > /tmp/agenttrust-requirements.txt
python3.12 -m venv /tmp/agenttrust-auditor
/tmp/agenttrust-auditor/bin/python -m pip install pip-audit==2.10.1
/tmp/agenttrust-auditor/bin/python -m pip_audit --strict -r /tmp/agenttrust-requirements.txt
/tmp/agenttrust-auditor/bin/python -m pip_audit --strict -r requirements-container.txt
cd console
npm ci
npm test --if-present
npx next typegen
npx tsc --noEmit
npm run build
npm audit --audit-level=moderate
npm audit --omit=dev --audit-level=moderate
```

Without AGENTTRUST_PLATFORM the existing real Gateway tests report skips; this is
not passing integration evidence. The integration workflow enforces zero skips.
Next generates next-env.d.ts during build; this generated change need not be
committed. No fixture fallback is added.

Full deployment/local verification commands, fault coverage, operational caveats
and recorded T10 results are in sibling `agenttrust-platform/docs/ci.md` and
`docs/ci-verification.md`. Use a fresh sibling checkout for independent CI Docker
testing; never delete an existing developer audit volume. CI runs on ephemeral
Ubuntu 24.04 AMD64; local Docker Desktop ARM64 proof is reported separately.
Allow 5–10 minutes for unit jobs and 15–25 minutes for cold integration builds
(maximum 40 minutes). Hosted verification is not implied by local passes.

Suggested commit: `ci: verify SDK, Console security and pinned Gateway integration`.
