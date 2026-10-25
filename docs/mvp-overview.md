# AgentTrust MVP: project overview

AgentTrust addresses a practical problem in AI-agent systems: a convenient tool
wrapper is not an independent security boundary. An agent with direct tool access
can bypass an in-process permission check.

The local MVP combines a Python SDK, an independently enforced Go Gateway, and a
read-only Next.js audit Console:

```text
AI Agent -> Python SDK -> TLS Go Gateway -> Protected HTTP/MCP Tools
                              |
                       Persisted audit events
                              |
                       Read-only Web Console
```

## Implemented security model

Gateway mode accepts externally issued, short-lived Ed25519 JWTs. The SDK has no
signing private key and does not translate its legacy local HS256 credentials.
The Gateway verifies signature, identity claims, issuer, audience and expiry,
then authorizes the configured tool's exact required scope. SDK name mappings
select tools; they do not grant permissions.

The Gateway persists mandatory lifecycle evidence before dispatch. Denied calls
do not reach protected tools. Execution uses bounded response reads, a
process-local concurrency cap, timeouts, bounded metric labels and disabled
automatic redirects. Gateway-owned protocol metadata cannot be supplied by an
upstream response.

Authorization and execution are separate: ALLOW does not mean SUCCEEDED.
Confirmed application errors are FAILED; transport interruptions, post-dispatch
timeouts and incomplete durable evidence can remain UNKNOWN. The SDK does not
retry executions or fall back to a local/direct protected tool.

## Components

- **Go Gateway:** independent authentication, exact-scope authorization, configured
  HTTP/MCP dispatch, audit persistence and operational metrics/tracing.
- **Python SDK:** sync/async Gateway client, safe typed errors, correlation and
  invocation metadata, explicit LangChain and MCP Gateway adapters. Existing
  cooperative local mode remains supported.
- **MCP integration:** a tested stateless HTTP JSON-response subset with structured
  results and distinct application/protocol/transport failure semantics.
  Independent-server testing supplements the demo tool.
- **Audit and observability:** Gateway-generated invocation identity correlates
  lifecycle records. Request IDs are correlation, not authorization or idempotency.
  Metrics avoid unbounded caller-supplied labels.
- **Console:** server-side read-only ingestion of persisted events, invocation
  metrics, filters, details and timelines. Missing sources are unavailable;
  unknown, incomplete and conflicting evidence never becomes fabricated success.
- **Local deployment:** five hardened Docker services separate agent and protected
  networks. Tools publish no host ports; the Console binds to loopback. The
  Gateway writes audit storage and the Console mounts the same storage read-only.
- **CI verification:** Go tests/race/vet/build and vulnerability scanning; Python,
  framework and independent MCP tests; Console tests/types/build/audits; and real
  Docker execution, network isolation and persistence checks. No automated
  deployment or image publishing is implemented.

## Verified scope and limits

The candidate was exercised through real Gateway execution, persisted audit
projection, and Docker isolation tests. The full Python suite passed 321 tests
with no skips, Console tests passed 25 cases, and the coordinated candidate pair
passed hosted integration. These are acceptance results for tested revisions,
not a security certification or an indefinite guarantee about future dependencies.

This is a local MVP, not a hosted service or production authorization platform.
The full deployment requires authorized access to the separately maintained
Gateway repository. This public repository provides the SDK and Console.

The host, Docker administrator, issuer and Gateway configuration are trusted.
Local SDK guards remain bypassable by code with direct tool access. The tested
Docker topology blocks direct agent-to-tool routes; that claim does not extend
to arbitrary deployments or a compromised host.

There is no enterprise SSO, multi-tenancy, managed issuer, JWKS, rotation,
revocation, distributed rate limiting, database audit service or immutable audit
storage. Credential and TLS preparation are local operator responsibilities.
JSONL can be changed by a sufficiently privileged host writer and is not
transactional with tool side effects. The Console has no application-level login;
access needs loopback or deployment access controls. Redaction is key-based,
not universal free-text secret detection.

MCP support is not universal: stateful sessions, legacy initialization, SSE
response consumption and server-to-client features are outside the implemented
Gateway subset. Cancellation does not guarantee remote rollback. UNKNOWN must
not trigger an assumed-safe retry.

## Developer entry points

- [Gateway SDK configuration, credential provisioning and examples](gateway-sdk.md)
- [Gateway protocol and timeout semantics](gateway-protocol.md)
- [Local SDK security rules](sdk-security.md)
- [Console configuration, ingestion and troubleshooting](../console/README.md)
- [CI checks and local reproduction](ci.md)
- [Local SDK trust model](threat-model.md)
- [Security reporting and boundaries](../SECURITY.md)

Local-only installation:

```bash
python3 -m pip install -e '.[dev]'
python3 -m pytest -q
```

Gateway tests are explicitly skipped without a configured Gateway checkout.
For full cross-repository verification, install the existing Gateway/MCP extras,
run `npm ci` in Console first, and follow the sibling checkout and explicit
revision instructions in the CI documentation. A local-only test run does not
verify deployment isolation.

This summary is prepared for review. It does not publish a release or expose
private Gateway source, signing keys, operational tokens or audit payloads.
