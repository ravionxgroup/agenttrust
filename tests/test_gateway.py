"""Gateway client and no-fallback framework tests. No signing key is needed."""
import asyncio
import base64
import importlib.util
import json
import logging

import httpx
import pytest

from agenttrust.gateway import (
    GatewayClient, GatewayCredentials, GatewayTool, ExecutionOutcome,
    GatewayAuthenticationError, GatewayAuthorizationDenied, GatewayInvalidRequest,
    GatewayOverloaded, GatewayUnavailable, GatewayExecutionFailed, GatewayOutcomeUnknown,
    GatewayTimeout, GatewayMalformedResponse, GatewayResponseTooLarge,
    GatewayRedirectRejected, GatewayCancelled, GatewayMCPApplicationError,
)
from agenttrust.identity import Issuer

SECRET = "T05_SENSITIVE_TOKEN_SENTINEL"
ARGUMENT = "T05_SENSITIVE_TOOL_ARGUMENT_SENTINEL"
INVOCATION = "a" * 32
REQUEST = "caller-request-123"


def credential():
    # A structural fixture only. Cryptographic validity is tested by the real Gateway.
    header = base64.urlsafe_b64encode(b'{"alg":"EdDSA","typ":"JWT"}').rstrip(b"=").decode()
    return header + "." + base64.urlsafe_b64encode(json.dumps({"fixture": SECRET}).encode()).rstrip(b"=").decode() + ".c2lnbmF0dXJl"


class Stream(httpx.SyncByteStream, httpx.AsyncByteStream):
    def __init__(self, body=b"", error=None):
        self.body, self.error, self.closed = body, error, False

    def __iter__(self):
        if self.error:
            raise self.error
        for start in range(0, len(self.body), 17):
            yield self.body[start:start + 17]

    async def __aiter__(self):
        for chunk in self:
            yield chunk

    def close(self):
        self.closed = True

    async def aclose(self):
        self.closed = True


def reply(request, status=200, data=None, body=None, headers=None, error=None, kind="mcp_result"):
    body = json.dumps({"ok": True} if data is None else data).encode() if body is None else body
    stream = Stream(body, error)
    error_envelope = type(data) is dict and set(data) == {"request_id", "code", "message"}
    origin = "gateway_error" if error_envelope else kind
    execution = "SUCCEEDED" if 200 <= status < 300 else "FAILED"
    authorization = "ALLOW"
    if error_envelope:
        execution = "NOT_EXECUTED" if data["code"] in ("UNAUTHENTICATED", "ACCESS_DENIED", "INVALID_REQUEST", "UNKNOWN_TOOL", "GATEWAY_OVERLOADED") else "UNKNOWN"
        if data["code"] in ("ACCESS_DENIED", "UNKNOWN_TOOL"): authorization = "DENY"
        if data["code"] == "UNAUTHENTICATED": authorization = "UNKNOWN"
    response = httpx.Response(status, headers={"Content-Type": "application/json",
        "X-Request-ID": request.headers["X-Request-ID"], "X-Invocation-ID": INVOCATION,
        "X-AgentTrust-Version": "1", "X-AgentTrust-Response-Kind": origin,
        "X-AgentTrust-Execution": execution, "X-AgentTrust-Authorization": authorization, **(headers or {})},
        stream=stream)
    return response, stream


def client(handler, **kwargs):
    transport = httpx.MockTransport(handler)
    return GatewayClient("https://gateway.example", GatewayCredentials(credential()),
                         transport=transport, async_transport=transport, **kwargs)


def execute(client, mode, *, arguments=None, kind="mcp"):
    args = {"secret_argument": ARGUMENT} if arguments is None else arguments
    if mode == "sync":
        return client.execute("logical-tool", args, request_id=REQUEST, kind=kind)
    return asyncio.run(client.aexecute("logical-tool", args, request_id=REQUEST, kind=kind))


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_success_credentials_headers_ids_and_body(mode, caplog):
    calls, streams = [], []

    def handler(request):
        calls.append(request)
        assert request.method == "POST"
        assert request.url.path == "/v1/tools/logical-tool/execute"
        assert request.headers["Authorization"] == "Bearer " + credential()
        assert "X-Invocation-ID" not in request.headers
        assert request.headers["X-Request-ID"] == REQUEST
        assert json.loads(request.content) == {"secret_argument": ARGUMENT}
        response, stream = reply(request, data={"content": [{"type": "text", "text": ARGUMENT}]})
        streams.append(stream)
        return response

    with caplog.at_level(logging.DEBUG):
        result = execute(client(handler), mode)
    assert result.invocation_id == INVOCATION
    assert result.request_id == REQUEST
    assert result.outcome == ExecutionOutcome.SUCCEEDED
    assert result.data["content"][0]["text"] == ARGUMENT
    assert len(calls) == 1 and streams[0].closed
    for text in (caplog.text, repr(result), repr(GatewayCredentials(credential()))):
        assert SECRET not in text and credential() not in text and ARGUMENT not in text


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("status,code,error,outcome", [
    (401, "UNAUTHENTICATED", GatewayAuthenticationError, "NOT_EXECUTED"),
    (403, "ACCESS_DENIED", GatewayAuthorizationDenied, "NOT_EXECUTED"),
    (400, "INVALID_REQUEST", GatewayInvalidRequest, "NOT_EXECUTED"),
    (404, "UNKNOWN_TOOL", GatewayInvalidRequest, "NOT_EXECUTED"),
    (503, "GATEWAY_OVERLOADED", GatewayOverloaded, "NOT_EXECUTED"),
    (504, "UPSTREAM_TIMEOUT", GatewayTimeout, "UNKNOWN"),
    (502, "UPSTREAM_UNAVAILABLE", GatewayUnavailable, "UNKNOWN"),
    (502, "UPSTREAM_ERROR", GatewayOutcomeUnknown, "UNKNOWN"),
    (502, "UPSTREAM_RESPONSE_TOO_LARGE", GatewayResponseTooLarge, "UNKNOWN"),
    (500, "INTERNAL_ERROR", GatewayOutcomeUnknown, "UNKNOWN"),
])
def test_gateway_errors_are_safe_structured_and_not_retried(mode, status, code, error, outcome, caplog):
    calls, streams = [], []

    def handler(request):
        calls.append(1)
        response, stream = reply(request, status, data={"request_id": REQUEST, "code": code,
                                                      "message": SECRET + ARGUMENT + credential()})
        streams.append(stream)
        return response

    with pytest.raises(error) as raised:
        execute(client(handler), mode)
    exc = raised.value
    assert exc.outcome == outcome and exc.code == code
    assert exc.invocation_id == INVOCATION and exc.request_id == REQUEST and exc.status_code == status
    assert calls == [1] and streams[0].closed
    diagnostic = str(exc) + repr(exc) + repr(vars(exc)) + caplog.text
    assert SECRET not in diagnostic and ARGUMENT not in diagnostic and credential() not in diagnostic


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("error_type", [httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError,
                                       httpx.ReadError, httpx.RemoteProtocolError])
def test_transport_failures_never_retry_or_claim_nonexecution(mode, error_type):
    calls = []

    def handler(request):
        calls.append(1)
        raise error_type(SECRET + ARGUMENT + credential(), request=request)

    with pytest.raises(GatewayUnavailable if error_type not in (httpx.ReadTimeout, httpx.ConnectTimeout) else GatewayTimeout) as raised:
        execute(client(handler), mode)
    assert calls == [1]
    assert raised.value.outcome == ExecutionOutcome.UNKNOWN
    assert raised.value.invocation_id is None
    assert SECRET not in str(raised.value)


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_interrupted_body_preserves_invocation_and_closes(mode):
    streams = []

    def handler(request):
        response, stream = reply(request, error=httpx.ReadTimeout(SECRET))
        streams.append(stream)
        return response

    with pytest.raises(GatewayTimeout) as raised:
        execute(client(handler), mode)
    assert raised.value.invocation_id == INVOCATION and streams[0].closed


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("body,headers,status,error", [
    (b"{broken", {}, 200, GatewayMalformedResponse),
    (b"[]", {}, 200, GatewayMalformedResponse),
    (b'{"isError":"false"}', {}, 200, GatewayMalformedResponse),
    (b'{"isError":true}', {}, 200, GatewayMalformedResponse),
    (b'{"x":1,"x":2}', {}, 200, GatewayMalformedResponse),
    (b'{"x":NaN}', {}, 200, GatewayMalformedResponse),
    (b'{"ok":true}', {"X-Invocation-ID": SECRET}, 200, GatewayMalformedResponse),
    (b'{"ok":true}', {"X-Request-ID": "other-correlation"}, 200, GatewayMalformedResponse),
    (b'{"ok":true}', {"Content-Encoding": "gzip"}, 200, GatewayMalformedResponse),
    (b'{"ok":true}', {"Location": "https://evil.example/?" + SECRET}, 307, GatewayRedirectRejected),
    (b"upstream secret " + SECRET.encode(), {"Content-Type": "text/plain"}, 502, GatewayMalformedResponse),
])
def test_malformed_responses_and_redirects_are_safe(mode, body, headers, status, error):
    calls, streams = [], []

    def handler(request):
        calls.append(str(request.url))
        response, stream = reply(request, status, body=body, headers=headers)
        streams.append(stream)
        return response

    with pytest.raises(error) as raised:
        execute(client(handler), mode)
    assert len(calls) == 1 and streams[0].closed
    assert SECRET not in repr(raised.value) + repr(vars(raised.value))


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("overflow", [False, True])
def test_exact_response_limit_and_overflow(mode, overflow):
    body = b'{"value":"' + b"x" * 80 + b'"}'
    streams = []

    def handler(request):
        response, stream = reply(request, body=body + (b" " if overflow else b""))
        streams.append(stream)
        return response

    gateway = client(handler, max_response_bytes=len(body))
    if overflow:
        with pytest.raises(GatewayResponseTooLarge) as raised:
            execute(gateway, mode)
        assert raised.value.invocation_id == INVOCATION
    else:
        assert execute(gateway, mode).data["value"] == "x" * 80
    assert streams[0].closed


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_http_passthrough_failure_and_ambiguous_error_envelope(mode):
    response = execute(client(lambda req: reply(req, body=b"opaque", headers={"Content-Type": "text/plain"}, kind="http_result")[0]), mode, kind="http")
    assert response.data == b"opaque"
    with pytest.raises(GatewayExecutionFailed) as failed:
        execute(client(lambda req: reply(req, 422, body=SECRET.encode(), headers={"Content-Type": "text/plain"}, kind="http_result")[0]), mode, kind="http")
    assert failed.value.outcome == ExecutionOutcome.FAILED
    with pytest.raises(GatewayAuthorizationDenied) as ambiguous:
        execute(client(lambda req: reply(req, 403, data={"request_id": REQUEST,
                "code": "ACCESS_DENIED", "message": "could be upstream"})[0]), mode, kind="http")
    assert ambiguous.value.outcome == ExecutionOutcome.NOT_EXECUTED


@pytest.mark.parametrize("url", ["http://gateway.example", "http://127.0.0.1", "https://user:pass@example.com",
    "https://example.com/path", "https://example.com?token=" + SECRET, "file:///tmp/foo",
    "https://example.com/#x", "https://example.com\n", "https://example.com:0", "https://"])
def test_unsafe_configuration_is_rejected(url):
    with pytest.raises(ValueError) as raised:
        GatewayClient(url, GatewayCredentials(credential()))
    assert SECRET not in str(raised.value)


def test_credential_provider_and_local_contract_separation():
    local, _ = Issuer("local-key-012345678901234567890123456789").issue("agent", ["crm.read"])
    for token in (local, "Bearer " + credential(), "bad\r\n" + SECRET, "a" * 8193):
        with pytest.raises(ValueError) as raised:
            GatewayCredentials(token)
        assert token not in str(raised.value)
    with pytest.raises(ValueError):
        GatewayCredentials()
    with pytest.raises(ValueError):
        GatewayCredentials(credential(), provider=credential)
    assert GatewayCredentials(provider=credential)._bearer() == credential()
    def bad_provider():
        raise RuntimeError(SECRET)
    with pytest.raises(ValueError) as raised:
        GatewayCredentials(provider=bad_provider)._bearer()
    assert SECRET not in str(raised.value)
    for url in ("http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"):
        assert GatewayClient(url, GatewayCredentials(credential()), allow_local_http=True)
    with pytest.raises(ValueError):
        GatewayClient("http://gateway.example", GatewayCredentials(credential()), allow_local_http=True)


@pytest.mark.parametrize("options", [dict(timeout=0), dict(timeout=float("nan")), dict(timeout=True),
    dict(max_response_bytes=0), dict(max_response_bytes=True), dict(max_response_bytes=2**63)])
def test_invalid_bounds_rejected(options):
    with pytest.raises(ValueError):
        client(lambda request: reply(request)[0], **options)


@pytest.mark.parametrize("arguments", [None, [], {"bad": object()}, {"bad": float("nan")}])
def test_invalid_arguments_never_dispatch(arguments):
    def forbidden(request):
        pytest.fail("invalid arguments dispatched")
    with pytest.raises(GatewayInvalidRequest) as raised:
        client(forbidden).execute("tool", arguments)
    assert raised.value.outcome == ExecutionOutcome.NOT_EXECUTED


def test_missing_invocation_is_unavailable_not_invented():
    def handler(request):
        response, _ = reply(request)
        del response.headers["X-Invocation-ID"]
        return response
    assert execute(client(handler), "sync").invocation_id is None


def test_async_cancellation_keeps_unknown_and_closes():
    async def scenario():
        entered = asyncio.Event()
        class Blocking(Stream):
            async def __aiter__(self):
                entered.set()
                await asyncio.Event().wait()
                yield b""
        stream = Blocking()
        def handler(request):
            return httpx.Response(200, headers={"X-Invocation-ID": INVOCATION, "X-AgentTrust-Version": "1",
                "X-AgentTrust-Response-Kind": "mcp_result", "X-AgentTrust-Authorization": "ALLOW",
                "X-AgentTrust-Execution": "SUCCEEDED"}, stream=stream)
        task = asyncio.create_task(client(handler).aexecute("tool", {}, request_id=REQUEST))
        await entered.wait()
        task.cancel()
        with pytest.raises(GatewayCancelled) as raised:
            await task
        assert raised.value.outcome == ExecutionOutcome.UNKNOWN
        assert raised.value.invocation_id == INVOCATION and stream.closed
    asyncio.run(scenario())


def test_gateway_frameworks_never_invoke_local_or_direct_fallback():
    if importlib.util.find_spec("langchain_core") is None:
        pytest.skip("langchain-core not installed")
    from agenttrust.langchain import as_gateway_langchain_tool, as_langchain_tool
    from agenttrust.mcp import GatewayMCPClient, wrap_mcp_client
    calls = []
    def handler(request):
        calls.append(request.url.path)
        return reply(request, kind="mcp_result" if request.url.path.endswith("logical-mcp/execute") else "http_result")[0]
    gateway = client(handler)
    mapping = {"customer": GatewayTool("logical-tool"), "mcp_customer": GatewayTool("logical-mcp", "mcp")}
    run = gateway.bind(mapping)
    mapping["customer"] = GatewayTool("changed")
    def schema(customer_id: int, include_orders: bool = False) -> dict:
        """A schema only; direct execution is forbidden."""
        pytest.fail("local protected tool executed")
    tool = as_gateway_langchain_tool(run, "customer", schema)
    assert tool.args_schema.model_json_schema()["properties"]["customer_id"]["type"] == "integer"
    assert tool.invoke({"customer_id": 7}).invocation_id == INVOCATION
    assert asyncio.run(tool.ainvoke({"customer_id": 7})).invocation_id == INVOCATION
    assert asyncio.run(GatewayMCPClient(run).call_tool("mcp_customer", {})).data == {"ok": True}
    assert calls == ["/v1/tools/logical-tool/execute"] * 2 + ["/v1/tools/logical-mcp/execute"]
    with pytest.raises(ValueError):
        run.execute("unmapped", {})
    with pytest.raises(ValueError):
        as_langchain_tool(run, "customer", schema)
    with pytest.raises(ValueError):
        wrap_mcp_client(run, object())  # Reject a direct MCP session in Gateway mode.
    with pytest.raises(ValueError):
        asyncio.run(GatewayMCPClient(run).call_tool("customer", {}))

    def deny(request):
        return reply(request, 403, data={"code": "ACCESS_DENIED", "request_id": request.headers["X-Request-ID"], "message": SECRET})[0]
    denied_run = client(deny).bind({"customer": GatewayTool("tool", "mcp")})
    denied_tool = as_gateway_langchain_tool(denied_run, "customer", schema)
    with pytest.raises(GatewayAuthorizationDenied):
        denied_tool.invoke({"customer_id": 7})
    with pytest.raises(GatewayAuthorizationDenied):
        asyncio.run(denied_tool.ainvoke({"customer_id": 7}))
    with pytest.raises(GatewayAuthorizationDenied):
        asyncio.run(GatewayMCPClient(denied_run).call_tool("customer", {}))


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_empty_http_success_and_safe_dotted_tool_ids(mode):
    calls = []
    def handler(request):
        calls.append(request.url.path)
        return reply(request, 204, body=b"", kind="http_result")[0]
    gateway = client(handler)
    if mode == "sync":
        result = gateway.execute("customer.read:v1", {})
    else:
        result = asyncio.run(gateway.aexecute("customer.read:v1", {}))
    assert result.data is None and result.outcome == ExecutionOutcome.SUCCEEDED
    assert calls == ["/v1/tools/customer.read:v1/execute"]
    for tool_id in ("..", "../evil", "a/b", "a?x=1", "a#fragment", "https://evil.example"):
        with pytest.raises(ValueError):
            gateway.execute(tool_id, {})


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_http_body_cannot_impersonate_gateway_error(mode):
    def handler(request):
        return reply(request, 403, data={"request_id": REQUEST, "code": "ACCESS_DENIED", "message": SECRET},
                     headers={"X-AgentTrust-Response-Kind": "http_result", "X-AgentTrust-Authorization": "ALLOW",
                              "X-AgentTrust-Execution": "FAILED"})[0]
    with pytest.raises(GatewayExecutionFailed) as failed:
        execute(client(handler), mode, kind="http")
    assert not isinstance(failed.value, GatewayAuthorizationDenied)
    assert failed.value.outcome == ExecutionOutcome.FAILED


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("headers", [
    {"X-AgentTrust-Version": "0"}, {"X-AgentTrust-Version": ""},
    {"X-AgentTrust-Response-Kind": "forged"}, {"X-AgentTrust-Execution": "maybe"},
    {"X-AgentTrust-Authorization": "yes"},
])
def test_unversioned_or_invalid_metadata_is_not_trusted(mode, headers):
    gateway = client(lambda request: reply(request, headers=headers)[0])
    with pytest.raises(GatewayMalformedResponse):
        execute(gateway, mode)


def test_sync_client_rejects_running_event_loop_without_dispatch():
    async def scenario():
        gateway = client(lambda request: pytest.fail("unexpected dispatch"))
        with pytest.raises(ValueError, match="aexecute"):
            gateway.execute("tool", {})
    asyncio.run(scenario())


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_application_error_preserves_payload_without_diagnostic_leak(mode, caplog):
    def handler(request):
        return reply(request, 502, data={"isError": True, "content": [{"type": "text", "text": SECRET}]})[0]
    with pytest.raises(GatewayMCPApplicationError) as raised:
        execute(client(handler), mode)
    assert raised.value.result.data["content"][0]["text"] == SECRET
    assert raised.value.outcome == ExecutionOutcome.FAILED
    assert SECRET not in str(raised.value) + repr(raised.value) + repr(vars(raised.value)) + caplog.text
