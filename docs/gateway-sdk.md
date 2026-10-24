# Python SDK Gateway mode (T05/T06)

The authoritative versioned wire contract and compatibility notes are in
[Gateway execution protocol 1](gateway-protocol.md).

Gateway mode sends every tool execution to the Go Gateway. The Gateway verifies
identity, looks up the trusted tool, authorizes its exact required scope, applies
admission limits, persists mandatory audit evidence, and dispatches. SDK name
mappings select logical tools; they do not grant permissions or select upstream
URLs. No local policy decision substitutes for Gateway authorization.

Local mode remains `AgentTrust(...).start_run(...).call()/acall()` with the
existing HS256 issuer, glob scopes, and local audit sink. It is cooperative
in-process enforcement, not equivalent to Gateway protection. Gateway mode uses
separate explicit classes and never falls back to a local function or direct MCP
session. Whether tools can be bypassed by other network paths depends on
isolation/deployment verification in T09; T05 does not claim non-bypassability.

## Install and provision credentials

```sh
python -m pip install -e '.[gateway]'
```

This adds HTTPX; local-only installs do not require it. Framework extras remain
independent. The SDK accepts no signing private key, issues no Gateway JWT, and
never translates a local token. `GatewayCredentials(token)` or
`GatewayCredentials(provider=callable)` accepts an externally provisioned bearer
value in memory. Providers are synchronous, cheap lookups called once per
invocation; they must not implement blocking refresh/exchange in the event loop.
Provider errors are replaced with a fixed safe configuration error. No automatic
refresh, rotation, key discovery, or token persistence is implemented.

The SDK checks compact JWT framing, the Gateway's 8 KiB credential bound, and an
`alg=EdDSA` header to prevent accidental local HS256/unsigned token use. This
unverified header check establishes **no trust**. Only the Gateway verifies the
signature, key, issuer, audience, claims, and validity period. Its credential
contract uses `run_id`, not the local SDK's `run`; it requires `iss`, `sub`,
`aud`, `run_id`, non-empty `scp`, `iat`, `exp`, and `jti`. Do not use the local
SDK `verify()` to authorize Gateway calls.

Use existing platform demo tooling as a trusted local issuer, outside the SDK:

```sh
cd /path/to/agenttrust-platform
./scripts/demo-keygen.sh
./scripts/demo-token.sh
# In separate terminals:
./scripts/demo-mcp-server.sh
./scripts/demo-gateway.sh
```

The demo token is Ed25519-signed for issuer `agenttrust-demo`, audience
`agenttrust-gateway`, agent `deploy-agent`, run `demo-run`, with `service.status`
and `logs.read` scopes. Existing issuer tooling writes a short-lived (15-minute)
token to a mode-0600 file; the private key stays with that issuer. Neither file
belongs in the SDK repository. For local development only, load the token into
the environment without printing it:

```sh
export AGENTTRUST_GATEWAY_TOKEN="$(cat /path/to/agenttrust-platform/tmp/demo/token.jwt)"
cd /path/to/agenttrust
python examples/gateway_demo.py
```

Do not put credentials in source code, command-line arguments, exception text,
request IDs, tool arguments, or audit payloads. Environment provisioning is a
local convenience, not a production secrets service. The SDK does not write
credentials or Gateway execution arguments to local audit files.

## Client and mappings

```python
import os
from agenttrust.gateway import GatewayClient, GatewayCredentials, GatewayTool

client = GatewayClient(
    "http://127.0.0.1:8080",
    GatewayCredentials(provider=lambda: os.environ["AGENTTRUST_GATEWAY_TOKEN"]),
    allow_local_http=True,  # Explicit development-only exception.
    timeout=10,
    max_response_bytes=4 * 1024 * 1024,
)
run = client.bind({"status": GatewayTool("service_status", "mcp")})
result = run.execute("status", {}, request_id="my-correlation-123")
# In an async function:
# result = await run.aexecute("status", {}, request_id="my-correlation-456")
# result.data contains the actual result; result.invocation_id is audit identity.
```

`GatewayClient.execute(tool_id, arguments, kind="http", request_id=None)` and
`aexecute(...)` are the lower-level interfaces. `GatewayRun` snapshots explicit
SDK-name -> `GatewayTool(tool_id, kind)` mappings. Unknown mappings fail locally;
there is no inferred tool, wildcard permission, upstream URL, or local fallback.
Tool IDs are single safe path segments of 1–128 ASCII characters (letters,
digits, underscore, hyphen, dot and colon; first character excludes dot/colon).
The declared kind must match the trusted Gateway registry; it controls response
interpretation and does not change the Gateway's tool definition or permissions.

Gateway origins must be HTTPS. Userinfo, paths other than `/`, query strings,
fragments, control characters, and invalid ports are rejected. HTTP requires
`allow_local_http=True` and an exact loopback host (`localhost`, `127.0.0.1`,
`::1`). Production remote HTTP is not supported. TLS verification remains on;
environment proxies and environment credentials are ignored. Custom transports
are trusted test injections, not a supported way to disable production security.
Each call owns and closes its sync/async HTTP client and response stream.

## Actual wire contract

```text
POST /v1/tools/{logical-tool-id}/execute
Authorization: Bearer <external-token>
Content-Type: application/json
Accept: application/json
Accept-Encoding: identity
X-Request-ID: <correlation-id>
X-AgentTrust-Version: 1

{"argument_name":"value"}
```

Arguments must be a JSON object, not an invented wrapper or JSON-RPC request.
Serialization errors fail before dispatch. The Gateway performs request-size
validation. HTTP tools return their original bounded status/body. JSON HTTP
responses are decoded; other HTTP bodies are returned as bytes. MCP success
returns its unwrapped result object, preserving `content`, `isError`, and other
result fields. There is no universal Gateway success envelope.

`GatewayResult` exposes `data`, `status_code`, `request_id`, `invocation_id`, and
`outcome=SUCCEEDED`. Its representation omits data. Error responses use the actual
Gateway object `{request_id, code, message}`. The SDK validates known error
codes/status combinations and correlation, but never exposes the server's
message or raw error body in its exceptions. Duplicate JSON keys, invalid UTF-8,
invalid/non-finite JSON, malformed MCP results, and invalid metadata are rejected.

The SDK response limit defaults to 4 MiB, configurable from 1 byte to 64 MiB.
It reads raw streaming chunks of at most 64 KiB, detects overflow, and closes
without returning partial success. It requests identity encoding and rejects
compressed responses before decoding to avoid decompression bombs. A trusted
reverse proxy must honor this identity-encoding contract. `timeout` defaults to 10 seconds as an absolute monotonic budget across the
cancellable network exchange, with HTTPX I/O timeouts as defense in depth. Both
sync and async execution share the same async engine. Sync execute owns a private
event loop and must not be called inside an active loop; use aexecute there.
Sync-only injected transports are rejected. Blocking providers/transports, CPU
work, DNS executor shutdown and cleanup can delay return: this is not a hard
real-time process deadline. See the detailed limits in gateway-protocol.md. Async cancellation closes the transport
and raises `GatewayCancelled` (a `GatewayOutcomeUnknown`, deliberately a domain
exception rather than `asyncio.CancelledError`) so correlation/outcome metadata
survives Python 3.9 task boundaries. It does not cancel or roll back remote work.

Redirects are never followed, including 307/308 body replay. They raise
`GatewayRedirectRejected` with UNKNOWN outcome and discard Location/body. A
redirect target receives neither arguments nor bearer credentials. HTTP Gateway
upstreams also have the T03 no-redirect policy, independent of this SDK policy.

## Correlation versus invocation identity

`X-Request-ID` is caller correlation only. Supply 8–128 characters from letters,
digits, `_ . : -`, or omit it to generate a random correlation ID. Reuse does
not merge Gateway invocations. The SDK never sends `X-Invocation-ID` and never
generates authoritative invocation IDs. It preserves the Gateway's current
32-character lowercase hex `X-Invocation-ID` in results and safe errors. If no
header arrives, invocation identity is `None`, including many transport timeouts.
A supplied response correlation header must match the request. Caller IDs and
invocation IDs must never be used as bearer credentials or authorization proof.

## Errors and execution uncertainty

All client exceptions have fixed safe codes, `outcome`, optional `status_code`,
`request_id`, and optional `invocation_id`; no request/response object, headers,
JWT, raw exception message, or payload is retained as a diagnostic attribute.
`GatewayCredentials` representations redact the credential. The SDK emits no
credential/argument logs and disables no TLS verification.

| Condition | Exception / outcome |
|---|---|
| Locally invalid arguments | `GatewayInvalidRequest` / NOT_EXECUTED |
| Authentication rejected | `GatewayAuthenticationError` |
| Scope denied | `GatewayAuthorizationDenied` |
| Invalid/unknown tool request | `GatewayInvalidRequest` |
| Admission rejected | `GatewayOverloaded` |
| Confirmed HTTP non-2xx response without reserved error envelope | `GatewayExecutionFailed` / FAILED |
| Connection error or upstream unavailable | `GatewayUnavailable` / UNKNOWN |
| Client or Gateway timeout | `GatewayTimeout` / UNKNOWN |
| MCP application result with isError true | `GatewayMCPApplicationError` / FAILED, result preserved |
| MCP JSON-RPC error | `GatewayMCPProtocolError` / UNKNOWN |
| Internal error | `GatewayOutcomeUnknown` / UNKNOWN |
| SDK/Gateway response overflow | `GatewayResponseTooLarge` / UNKNOWN |
| Malformed response or metadata | `GatewayMalformedResponse` / UNKNOWN |
| Redirect | `GatewayRedirectRejected` / UNKNOWN |
| Async cancellation | `GatewayCancelled` / UNKNOWN |

Version-1 metadata distinguishes Gateway errors from upstream HTTP responses.
Recognized pre-dispatch authentication, authorization, request and overload errors
are NOT_EXECUTED for both HTTP and MCP. An upstream HTTP body that imitates a
Gateway error remains an HTTP application response, never a security denial.
Missing/unsupported metadata fails closed as UNKNOWN; there is no silent legacy
interpretation. HTTP status/body passthrough is preserved by the Gateway.

MCP tool-level isError results are FAILED and available at
`GatewayMCPApplicationError.result.data`. JSON-RPC error objects, malformed results
and transport failures are distinct error categories and UNKNOWN after dispatch.
Their raw server messages are not diagnostics. The new headers describe observed
outcomes, not proof of terminal audit persistence. Use invocation identity to
inspect durable evidence; this SDK does not implement an audit-query endpoint.

**No automatic execution retries occur.** A timeout, connection interruption,
malformed/oversized response, or cancellation may follow a completed side effect.
Do not retry based solely on an exception or assume rollback/non-execution.
Caller correlation IDs do not provide idempotency or duplicate suppression.

## LangChain

```python
from agenttrust.langchain import as_gateway_langchain_tool

def status_schema(service: str = "api") -> dict:
    """Read a service's status."""
    raise RuntimeError("schema only; must never execute")

tool = as_gateway_langchain_tool(run, "status", status_schema)
result = tool.invoke({"service": "api"})
# result = await tool.ainvoke({"service": "api"})
```

Only the function signature/docstring supplies schema. Both framework paths send
arguments through `GatewayRun` and return `GatewayResult`, retaining invocation
metadata. They never execute the schema function's body. Typed denial/UNKNOWN
errors propagate. Named parameters are required; variadic/positional-only schemas
are rejected. Legacy `as_langchain_tool(AgentRun, ...)` remains local; passing a
`GatewayRun` to it is rejected, preventing accidental mode mixing.

## MCP

```python
from agenttrust.mcp import GatewayMCPClient
mcp = GatewayMCPClient(run)
# Within an async function:
# result = await mcp.call_tool("status", {"service": "api"})
# result.data is the unwrapped MCP result; result.invocation_id links audit.
```

Mappings must explicitly have `kind="mcp"`. `GatewayMCPClient` takes no direct
session or server address and performs no discovery, initialization, or direct
protected-MCP connection. Existing `wrap_mcp_client(AgentRun, direct_session)`
remains an explicitly local/direct adapter; passing `GatewayRun` is rejected.
The new adapter returns `GatewayResult`, not an MCP SDK `CallToolResult` instance.
Universal transport support, sessions, SSE and MCP interoperability redesign are
outside T05; this uses the Gateway's existing narrow stateless HTTP tools/call.

## Verification

```sh
python -m pytest -q -rs
AGENTTRUST_PLATFORM=/absolute/path/to/agenttrust-platform \
  python -m pytest -q -rs tests/test_gateway_integration.py
python -m compileall -q agenttrust tests examples/gateway_demo.py
git diff --check
```

The real tests build the unchanged Go Gateway and existing demo issuer into
pytest temporary directories, generate ephemeral issuer keys, start HTTP/MCP
upstreams, and verify call counts and invocation-linked audits. No Docker,
Console, repository signing keys, or Gateway source changes are required. Without
`AGENTTRUST_PLATFORM`, six real tests explicitly skip. LangChain/real MCP tests
also depend on their existing optional packages; the known MCP 2.x test-helper
incompatibility is described in `sdk-security.md`. Python lint/type-check tools
are not configured. The working demo is `examples/gateway_demo.py`.

T05 verification results: the fully provisioned Python 3.14.6 environment
(HTTPX 0.28.1, PyJWT 2.15.1, LangChain Core 1.7.0, MCP 1.30.0) passes all
274 tests, including 88 Gateway unit/framework cases and six real Gateway tests,
with no skips. The default Python 3.9.6 environment passes 265 tests and skips
six opt-in Gateway tests plus three real-MCP tests. To reproduce complete
integration coverage with the existing test helper, install the existing dev
and Gateway extras plus `mcp>=1,<2` in a temporary environment; no repository
dependency pin is added. Go `test`, race-enabled `test`, and `vet` pass for the
unchanged platform checkout. Syntax compilation and `git diff --check` pass.
Python 3.10–3.12 were not available locally. No private keys or issued tokens
are embedded in source or repository artifacts.


T06 adds 20 real independent MCP 2.x interoperability cases, four real HTTP
spoofing cases, five slow-drip total-deadline cases and client metadata/application
error regressions. The old MCP 2.x test-helper/API incompatibility is resolved by
the test harness without production dependency pins; MCP 1.x local/direct tests
remain supported. For complete verification install the existing optional MCP
extra with 2.x in a temporary environment, set AGENTTRUST_PLATFORM, and run the
suite. The independent fixture imports no AgentTrust implementation.
