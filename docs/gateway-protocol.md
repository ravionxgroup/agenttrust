# Gateway execution protocol 1 (T06)

## Request and trust boundary

`POST /v1/tools/{logical-tool}/execute` retains the existing bearer credential
and request body contract. HTTP tools receive the body; MCP tools receive a JSON
object as arguments. Upstream routing and authorization remain trusted Gateway
configuration. The SDK sends `X-AgentTrust-Version: 1`. An absent version retains
legacy body behavior; an unsupported explicit version is rejected after
successful authentication, before authorization/dispatch, with NOT_EXECUTED and
UNKNOWN authorization. No automatic downgrade or retry is supported.

Gateway-owned metadata accompanies every protected response:

| Header | Values |
|---|---|
| `X-AgentTrust-Version` | `1` |
| `X-AgentTrust-Response-Kind` | `gateway_error`, `http_result`, `mcp_result` |
| `X-AgentTrust-Authorization` | `ALLOW`, `DENY`, `UNKNOWN` |
| `X-AgentTrust-Execution` | `SUCCEEDED`, `FAILED`, `NOT_EXECUTED`, `UNKNOWN` |
| `X-Invocation-ID` | Gateway-generated 128-bit lowercase hex identity |
| `X-Request-ID` | Validated caller correlation or a generated correlation ID |

These headers are trusted only on the configured Gateway connection (TLS for
remote use), not as independently signed assertions. Upstream HTTP response
headers are allow-listed to Content-Type and Cache-Control. MCP response headers
are generated locally and only Content-Type leaves the adapter. Upstream
request/invocation IDs and all AgentTrust metadata are discarded. Incoming
caller metadata never supplies authorization, execution state, or invocation ID.
Trusted reverse proxies must preserve the Gateway's headers and not invent them.

`X-Request-ID` is correlation, not identity or idempotency. Reusing it produces
separate invocations. The Gateway's invocation ID ties receipt, authorization,
dispatch intent, and terminal audit events together. The SDK never fabricates
one if no response header arrived.

## HTTP result

HTTP status and body remain passthrough, including application 400/500 responses.
For example, a protected upstream can return this exact JSON with status 403:

```json
{"request_id":"example-request","code":"ACCESS_DENIED","message":"upstream text"}
```

Its response kind is still `http_result`, authorization ALLOW, execution FAILED.
A 2xx status maps to SUCCEEDED; every other completed HTTP response maps to
FAILED. A failure status reports an application response, not absence of side
effects. No body field is used to identify Gateway errors. Redirects remain
unfollowed; bounded upstream 3xx status/body are returned without Location and
audited FAILED. The SDK rejects redirect responses without contacting the target.

## MCP result and error

Success is HTTP 200, kind `mcp_result`, ALLOW / SUCCEEDED, with the unwrapped MCP
result, preserving structuredContent, content and other valid fields:

```json
{"content":[{"type":"text","text":"ok"}],"structuredContent":{"value":7},"isError":false}
```

A valid tool-level application error for a version-1 request is HTTP 502, kind
`mcp_result`, ALLOW / FAILED, retaining the unwrapped result:

```json
{"content":[{"type":"text","text":"input rejected"}],"structuredContent":{"reason":"validation"},"isError":true}
```

The SDK raises `GatewayMCPApplicationError` (a `GatewayExecutionFailed`) with
FAILED and a `GatewayResult` at `.result`. Application content is intentional
payload, not a safe diagnostic string; `.result.data` must not be logged blindly.
Its representation is hidden. Raw JSON-RPC messages, transport exception text,
and arbitrary server error descriptions are never copied to Gateway errors.

Gateway-generated errors retain the original JSON schema:

```json
{"request_id":"example-request","code":"MCP_PROTOCOL_ERROR","message":"MCP protocol error"}
```

They have kind `gateway_error`; code/status/body and metadata must agree.
New version-1 codes are MCP_PROTOCOL_ERROR, MCP_TOOL_NOT_FOUND, and
MCP_INVALID_RESPONSE (all HTTP 502). Existing authentication, authorization,
request, admission, size, timeout, and transport codes remain. Messages are
fixed and secret-safe. MCP numeric -32601 identifies a missing method/tool;
classification never searches error-message text for "not found".

| Observation | Gateway response | Audit execution |
|---|---|---|
| Valid result, absent/false isError | 200 mcp_result | SUCCEEDED |
| Valid result, isError true | 502 mcp_result | FAILED |
| Valid JSON-RPC error / missing method | 502 gateway_error, MCP_PROTOCOL_ERROR / MCP_TOOL_NOT_FOUND | UNKNOWN |
| Invalid JSON, framing, ID or result | 502 gateway_error, MCP_INVALID_RESPONSE | UNKNOWN |
| Unavailable transport / upstream HTTP 5xx | 502 gateway_error, UPSTREAM_UNAVAILABLE | UNKNOWN after dispatch |
| Upstream timeout | 504 gateway_error, UPSTREAM_TIMEOUT | UNKNOWN after dispatch |
| Upstream overflow | 502 gateway_error, UPSTREAM_RESPONSE_TOO_LARGE | UNKNOWN after dispatch |
| Known cancellation or mandatory audit failure before handoff | gateway_error | NOT_EXECUTED |
| Authentication rejection | 401 gateway_error | NOT_EXECUTED; authorization UNKNOWN |
| Scope denial | 403 gateway_error | NOT_EXECUTED; authorization DENY |
| Admission rejection | 503 gateway_error | NOT_EXECUTED; authorization ALLOW |

A server's JSON-RPC error proves a protocol failure but does not prove that a
side effect was absent or rolled back. It therefore cannot establish execution
FAILED or NOT_EXECUTED. Transport cancellation and missing terminal evidence
remain UNKNOWN. Header outcomes describe the Gateway's observed result; they
are not proof that terminal audit persistence succeeded. T02's normalization of
incomplete lifecycles remains authoritative for durable evidence.

## Supported MCP subset

The configured endpoint is MCP `2026-07-28` stateless HTTP, JSON response mode.
Every tools/call carries JSON-RPC 2.0, a string ID matching the Gateway request
correlation, fixed protocol/client metadata in `_meta`, and Gateway-controlled
MCP-Protocol-Version, Mcp-Method and Mcp-Name headers. The Gateway does not perform
initialize or maintain sessions; trusted static tool configuration avoids a
runtime discovery requirement. Independent server/discover and tools/list
probes verify modern stateless discovery separately from protected dispatch.

Responses must have application/json media type, UTF-8 JSON, exactly one result
or error, matching string ID and version, and no duplicate keys. Objects beyond
64 JSON nesting levels are rejected. Error codes must be signed 32-bit integers
and messages strings. Results must be objects; isError, if present, must be a
boolean, structuredContent an object, content an array of typed objects, and
text blocks must contain string text. Unexpected MCP session IDs are rejected.
T03's byte limit is applied to the stream before any JSON validation.

SSE is advertised in Accept as required by Streamable HTTP, but this MVP consumes
only single application/json responses. An SSE response fails safely as an
invalid response. Stateful/legacy 2025 initialization, SSE framing, subscriptions,
MRTR and server-to-client requests are not implemented. The existing MCP 1.x
local/direct SDK adapter remains distinct from this Gateway transport.

The official MCP 2.3.0 implementation is exercised as an independent process,
not the platform demo. Normal framing, structured success, tool application
errors, discovery and a server-generated unsupported-method error use its real
implementation. Malformed, mismatched-ID, oversized and selected RPC responses
are explicitly injected negative-wire faults and are not claimed as independent
implementation behavior. Denials/authentication failures cause zero server calls.

## SDK deadlines and compatibility

The SDK uses one absolute monotonic deadline across the cancellable HTTP exchange
for sync execute and async aexecute, including response streaming. HTTPX phase
timeouts remain defense in depth. Both paths use the same async transport engine;
the sync path owns a private event loop, without background execution workers.
Sync calls inside an existing event loop must use aexecute instead. Custom
sync-only transports are rejected; injected async transports must cooperate with
cancellation. LangChain invoke/ainvoke and GatewayMCPClient share these rules.

This is not a hard real-time process deadline. Synchronous credential providers,
JSON CPU work, event-loop scheduling, cancellation cleanup and OS DNS resolver
shutdown may delay return, especially while the synchronous runner closes its
loop. Blocking custom transports cannot be forcibly interrupted. Preflight time
consumes the budget; if it expires before the exchange, NOT_EXECUTED is returned.
After an exchange may have started, deadline/cancellation is UNKNOWN even if the
server later finishes. Known invocation headers survive timeout errors. No
retry, fallback, cancellation guarantee, rollback claim or idempotency is added.

Old clients keep HTTP passthrough and legacy MCP error envelopes when they omit
the version request header. They do not gain authoritative error classification.
Version-1 SDK clients require valid metadata and reject unversioned/unsupported
responses with UNKNOWN; they never infer a security decision from a legacy body.
For legacy requests MCP application errors remain generic UPSTREAM_ERROR, while
JSON-RPC errors now correctly audit UNKNOWN rather than confirmed FAILED.
No JWT or audit schema vocabulary changes are made.

Protocol reference: [MCP 2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).


## Verification evidence

The complete Python 3.14.6 environment (MCP 2.3.0, HTTPX 0.28.1,
LangChain Core 1.7.0, PyJWT 2.15.1) passes 318 tests with no skips. This includes
20 real independent-server cases, the SDK/Gateway HTTP/MCP integration cases,
and five actual slow-drip deadline cases spanning clients and framework adapters.
The MCP 1.30.0 local/direct harness also passes all three tests. Python 3.9.6
passes 285 tests with 33 explicit skips (10 opt-in Gateway, 20 independent MCP,
three unavailable real-MCP tests). Python 3.10–3.12 were not available locally.

Go test, race-enabled test, vet, Go formatting, Python syntax compilation and
both Git diff whitespace checks pass. Protocol/admission/cleanup tests also pass
20 repetitions under the race detector. No Python linter, formatter or type
checker is configured. No production dependencies are pinned or upgraded.

Reproduce complete cross-repository verification with the existing test extras
and optional MCP 2.x installed in a temporary Python environment:

```sh
AGENTTRUST_PLATFORM=/absolute/path/to/agenttrust-platform python -m pytest -q -rs
```

The independent server is an installed official MCP implementation in a separate
process. Negative-wire injections are labeled in the fixture. They are not
counted as independent implementation behavior; normal structured results,
application errors, discovery and unsupported-method handling are independent.
