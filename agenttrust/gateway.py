"""Explicit Gateway mode. The Gateway alone verifies identity and authorizes tools."""
from __future__ import annotations

import asyncio
import json
import math
import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Any, Callable, Mapping, Optional
from urllib.parse import urlsplit

import jwt

try:
    import httpx
except ImportError:  # Local-only SDK users do not need the Gateway extra.
    httpx = None


_ID = re.compile(r"[A-Za-z0-9_.:-]{8,128}\Z")
_TOOL = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,127}\Z")
_TOKEN = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\Z")


class ExecutionOutcome(str, Enum):
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    NOT_EXECUTED = "NOT_EXECUTED"
    UNKNOWN = "UNKNOWN"


class GatewayError(Exception):
    """Safe diagnostics only; never retains a request, response, token or body."""

    def __init__(self, code: str, *, outcome=ExecutionOutcome.UNKNOWN,
                 status_code=None, request_id=None, invocation_id=None):
        super().__init__(code)
        self.code = code
        self.outcome = outcome
        self.status_code = status_code
        self.request_id = request_id
        self.invocation_id = invocation_id


class GatewayAuthenticationError(GatewayError):
    pass


class GatewayAuthorizationDenied(GatewayError):
    pass


class GatewayInvalidRequest(GatewayError):
    pass


class GatewayOverloaded(GatewayError):
    pass


class GatewayUnavailable(GatewayError):
    pass


class GatewayExecutionFailed(GatewayError):
    pass


class GatewayOutcomeUnknown(GatewayError):
    pass


class GatewayMCPProtocolError(GatewayOutcomeUnknown):
    pass


class GatewayMCPApplicationError(GatewayExecutionFailed):
    """A valid isError result. result.data is payload, excluded from diagnostics."""

    def __init__(self, result):
        super().__init__("MCP_APPLICATION_ERROR", outcome=ExecutionOutcome.FAILED,
                         status_code=result.status_code, request_id=result.request_id,
                         invocation_id=result.invocation_id)
        self.result = result


class GatewayTimeout(GatewayOutcomeUnknown):
    pass


class GatewayMalformedResponse(GatewayOutcomeUnknown):
    pass


class GatewayResponseTooLarge(GatewayOutcomeUnknown):
    pass


class GatewayRedirectRejected(GatewayOutcomeUnknown):
    pass


class GatewayCancelled(GatewayOutcomeUnknown):
    """Cancellation after starting an exchange; remote effects may have occurred."""
    outcome = ExecutionOutcome.UNKNOWN

    def __init__(self, request_id, invocation_id=None):
        super().__init__("GATEWAY_REQUEST_CANCELLED", request_id=request_id,
                         invocation_id=invocation_id)


class GatewayCredentials:
    """External bearer token or synchronous, in-memory token provider.

    Header checks prevent accidental local-token use, not cryptographic validation.
    Only the Gateway validates signatures/claims. No signing key is accepted.
    """

    def __init__(self, token: Optional[str] = None, *, provider: Optional[Callable[[], str]] = None):
        if (token is None) == (provider is None) or (provider is not None and not callable(provider)):
            raise ValueError("configure exactly one Gateway token or provider")
        self.__token = self._validate(token) if provider is None else None
        self.__provider = provider

    def __repr__(self):
        return "GatewayCredentials(<redacted>)"

    @staticmethod
    def _validate(token):
        try:
            if type(token) is not str or len(token) > 8192 or not _TOKEN.fullmatch(token):
                raise ValueError
            if jwt.get_unverified_header(token).get("alg") != "EdDSA":
                raise ValueError
        except Exception:
            raise ValueError("invalid Gateway credential; an externally issued EdDSA JWT is required") from None
        return token

    def _bearer(self):
        try:
            token = self.__token if self.__provider is None else self.__provider()
            return self._validate(token)
        except Exception:
            raise ValueError("Gateway credential unavailable or invalid") from None


@dataclass(frozen=True)
class GatewayResult:
    status_code: int
    data: Any = field(repr=False)
    request_id: str
    invocation_id: Optional[str]
    outcome: ExecutionOutcome = ExecutionOutcome.SUCCEEDED


@dataclass(frozen=True)
class GatewayTool:
    tool_id: str
    kind: str = "http"

    def __post_init__(self):
        if type(self.tool_id) is not str or not _TOOL.fullmatch(self.tool_id):
            raise ValueError("invalid Gateway logical tool ID")
        if self.kind not in ("http", "mcp"):
            raise ValueError("Gateway tool kind must be http or mcp")


def _base_url(value, allow_local_http):
    try:
        if type(value) is not str or any(ord(c) <= 32 or ord(c) >= 127 for c in value):
            raise ValueError
        parsed = urlsplit(value)
        if (parsed.scheme not in ("https", "http") or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment
                or "\\" in value or parsed.port == 0):
            raise ValueError
        if parsed.scheme == "http" and not (
            allow_local_http is True and parsed.hostname in ("127.0.0.1", "::1", "localhost")
        ):
            raise ValueError
        # HTTPX is the transport's URL parser; reject alternate authority parsing.
        normalized = httpx.URL(value)
        if normalized.host != parsed.hostname or normalized.userinfo:
            raise ValueError
        return str(normalized).rstrip("/")
    except Exception:
        raise ValueError("Gateway URL must be an HTTPS origin, or explicitly enabled loopback HTTP") from None


def _json_loads(body):
    def invalid_constant(_):
        raise ValueError

    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError
            result[key] = value
        return result

    def finite_float(value):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError
        return number

    return json.loads(body, parse_constant=invalid_constant, parse_float=finite_float,
                      object_pairs_hook=unique_keys)


# Known Gateway errors, including the exact status required to classify an envelope.
_ERRORS = {
    "UNAUTHENTICATED": (401, GatewayAuthenticationError, True),
    "ACCESS_DENIED": (403, GatewayAuthorizationDenied, True),
    "INVALID_REQUEST": ((400, 408, 413), GatewayInvalidRequest, True),
    "UNKNOWN_TOOL": (404, GatewayInvalidRequest, True),
    "INVALID_GATEWAY_CONFIGURATION": (500, GatewayUnavailable, True),
    "GATEWAY_OVERLOADED": (503, GatewayOverloaded, True),
    "MCP_PROTOCOL_ERROR": (502, GatewayMCPProtocolError, False),
    "MCP_TOOL_NOT_FOUND": (502, GatewayMCPProtocolError, False),
    "MCP_INVALID_RESPONSE": (502, GatewayMalformedResponse, False),
    "UPSTREAM_TIMEOUT": (504, GatewayTimeout, False),
    "UPSTREAM_UNAVAILABLE": (502, GatewayUnavailable, False),
    "UPSTREAM_ERROR": (502, GatewayOutcomeUnknown, False),
    "UPSTREAM_RESPONSE_TOO_LARGE": (502, GatewayResponseTooLarge, False),
    "INTERNAL_ERROR": (500, GatewayOutcomeUnknown, False),
}


class GatewayClient:
    """One POST per invocation, with a shared cancellable total network deadline.

    Transport injection is for trusted testing only. Environment proxies and
    credentials are ignored; TLS verification is always enabled by default.
    """

    def __init__(self, base_url: str, credentials: GatewayCredentials, *,
                 timeout: float = 10, max_response_bytes: int = 4 * 1024 * 1024,
                 allow_local_http: bool = False, transport=None, async_transport=None):
        if httpx is None:
            raise ImportError("Gateway mode requires pip install 'agenttrust[gateway]'")
        if type(credentials) is not GatewayCredentials:
            raise ValueError("explicit GatewayCredentials required")
        if type(timeout) not in (int, float) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("Gateway timeout must be finite and positive")
        if type(max_response_bytes) is not int or not 1 <= max_response_bytes <= 64 * 1024 * 1024:
            raise ValueError("Gateway response limit must be between 1 byte and 64 MiB")
        if transport is not None and not isinstance(transport, httpx.AsyncBaseTransport):
            raise ValueError("Gateway total deadlines require an async-capable transport")
        self._base_url = _base_url(base_url, allow_local_http)
        self._credentials = credentials
        self._timeout = timeout
        self._max_response_bytes = max_response_bytes
        self._transport = transport
        self._async_transport = async_transport

    def bind(self, tools: Mapping[str, GatewayTool]) -> GatewayRun:
        return GatewayRun(self, tools)

    def _request(self, tool_id, arguments, kind, request_id):
        tool = GatewayTool(tool_id, kind)
        if request_id is None:
            request_id = uuid.uuid4().hex  # Correlation only; never an invocation ID.
        if type(request_id) is not str or not _ID.fullmatch(request_id):
            raise ValueError("invalid request correlation ID")
        if type(arguments) is not dict:
            raise GatewayInvalidRequest("ARGUMENTS_MUST_BE_OBJECT", outcome=ExecutionOutcome.NOT_EXECUTED,
                                        request_id=request_id)
        try:
            body = json.dumps(arguments, allow_nan=False, separators=(",", ":")).encode("utf-8")
        except Exception:
            raise GatewayInvalidRequest("ARGUMENTS_MUST_BE_JSON", outcome=ExecutionOutcome.NOT_EXECUTED,
                                        request_id=request_id) from None
        headers = {"Authorization": "Bearer " + self._credentials._bearer(),
                   "Content-Type": "application/json", "Accept": "application/json",
                   "Accept-Encoding": "identity", "X-Request-ID": request_id, "X-AgentTrust-Version": "1"}
        return tool, request_id, body, headers

    @staticmethod
    def _metadata(response, request_id):
        invocation_id = response.headers.get("X-Invocation-ID")
        returned_id = response.headers.get("X-Request-ID")
        if invocation_id is not None and not re.fullmatch(r"[a-f0-9]{32}", invocation_id):
            raise GatewayMalformedResponse("INVALID_INVOCATION_ID", request_id=request_id)
        if returned_id is not None and returned_id != request_id:
            raise GatewayMalformedResponse("CORRELATION_MISMATCH", request_id=request_id,
                                           invocation_id=invocation_id)
        return dict(status_code=response.status_code, request_id=request_id, invocation_id=invocation_id)

    def _check_headers(self, response, meta):
        # Never infer security decisions from an unversioned body or unknown version.
        if response.headers.get("X-AgentTrust-Version") != "1":
            raise GatewayMalformedResponse("UNSUPPORTED_GATEWAY_CONTRACT", **meta)
        kind = response.headers.get("X-AgentTrust-Response-Kind")
        authorization = response.headers.get("X-AgentTrust-Authorization")
        outcome = response.headers.get("X-AgentTrust-Execution")
        if (kind not in ("gateway_error", "http_result", "mcp_result")
                or authorization not in ("ALLOW", "DENY", "UNKNOWN")
                or outcome not in ExecutionOutcome._value2member_map_):
            raise GatewayMalformedResponse("INVALID_GATEWAY_METADATA", **meta)
        if response.headers.get("Content-Encoding", "identity").lower() not in ("identity", ""):
            raise GatewayMalformedResponse("UNSUPPORTED_CONTENT_ENCODING", **meta)
        if 300 <= response.status_code < 400:
            raise GatewayRedirectRejected("REDIRECT_REJECTED", **meta)

    def _response(self, response, body, tool, meta):
        status = response.status_code
        response_kind = response.headers["X-AgentTrust-Response-Kind"]
        authorization = response.headers["X-AgentTrust-Authorization"]
        outcome = ExecutionOutcome(response.headers["X-AgentTrust-Execution"])
        is_json = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() == "application/json"
        if response_kind == "gateway_error":
            try:
                parsed = _json_loads(body)
                if (not is_json or type(parsed) is not dict or set(parsed) != {"request_id", "code", "message"}
                        or parsed["request_id"] != meta["request_id"] or type(parsed["code"]) is not str
                        or parsed["code"] not in _ERRORS or type(parsed["message"]) is not str):
                    raise ValueError
                expected_status, error_type, before_dispatch = _ERRORS[parsed["code"]]
                allowed = expected_status if type(expected_status) is tuple else (expected_status,)
                if parsed["code"] in ("ACCESS_DENIED", "UNKNOWN_TOOL") and authorization != "DENY":
                    raise ValueError
                if parsed["code"] == "UNAUTHENTICATED" and authorization != "UNKNOWN":
                    raise ValueError
                if (parsed["code"] == "GATEWAY_OVERLOADED" or parsed["code"].startswith(("UPSTREAM_", "MCP_"))) and authorization != "ALLOW":
                    raise ValueError
                if status not in allowed or outcome == ExecutionOutcome.SUCCEEDED:
                    raise ValueError
                if before_dispatch and outcome != ExecutionOutcome.NOT_EXECUTED:
                    raise ValueError
                if not before_dispatch and outcome not in (ExecutionOutcome.UNKNOWN, ExecutionOutcome.NOT_EXECUTED):
                    # Legacy application failures are not emitted for negotiated v1 requests.
                    raise ValueError
            except (ValueError, UnicodeError, RecursionError, OverflowError):
                raise GatewayMalformedResponse("MALFORMED_GATEWAY_ERROR", **meta) from None
            raise error_type(parsed["code"], outcome=outcome, **meta)
        if response_kind != tool.kind + "_result" or authorization != "ALLOW":
            raise GatewayMalformedResponse("INVALID_RESULT_METADATA", **meta)
        if response_kind == "http_result" and not 200 <= status < 300:
            if outcome != ExecutionOutcome.FAILED:
                raise GatewayMalformedResponse("INVALID_HTTP_OUTCOME", **meta)
            # Body contents never participate in control-plane classification.
            raise GatewayExecutionFailed("HTTP_TOOL_EXECUTION_FAILED", outcome=outcome, **meta)
        parsed = None
        if body and (is_json or tool.kind == "mcp"):
            try:
                parsed = _json_loads(body)
            except (ValueError, UnicodeError, RecursionError, OverflowError):
                raise GatewayMalformedResponse("MALFORMED_JSON_RESPONSE", **meta) from None
        if tool.kind == "mcp":
            if not is_json or type(parsed) is not dict or type(parsed.get("isError", False)) is not bool:
                raise GatewayMalformedResponse("MALFORMED_MCP_RESULT", **meta)
            if parsed.get("isError", False):
                if outcome != ExecutionOutcome.FAILED or status != 502:
                    raise GatewayMalformedResponse("INVALID_MCP_OUTCOME", **meta)
                raise GatewayMCPApplicationError(GatewayResult(data=parsed, outcome=outcome, **meta))
        if not 200 <= status < 300 or outcome != ExecutionOutcome.SUCCEEDED:
            raise GatewayMalformedResponse("INVALID_SUCCESS_OUTCOME", **meta)
        return GatewayResult(data=parsed if is_json or tool.kind == "mcp" else body, **meta)

    def execute(self, tool_id: str, arguments: dict, *, kind="http", request_id=None) -> GatewayResult:
        # A private event loop provides the same cancellation/deadline engine as async
        # without timer threads, orphan workers, or a second network implementation.
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise ValueError("use aexecute inside a running event loop")
        return asyncio.run(self._execute(tool_id, arguments, kind=kind, request_id=request_id,
                                         transport=self._transport or self._async_transport))

    async def aexecute(self, tool_id: str, arguments: dict, *, kind="http", request_id=None) -> GatewayResult:
        return await self._execute(tool_id, arguments, kind=kind, request_id=request_id,
                                   transport=self._async_transport)

    async def _execute(self, tool_id, arguments, *, kind, request_id, transport):
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self._timeout
        tool, request_id, body, headers = self._request(tool_id, arguments, kind, request_id)
        meta = dict(request_id=request_id, invocation_id=None)

        async def exchange():
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=False, trust_env=False,
                                         transport=transport) as client:
                async with client.stream("POST", f"{self._base_url}/v1/tools/{tool.tool_id}/execute",
                                         content=body, headers=headers) as response:
                    meta.update(self._metadata(response, request_id))
                    self._check_headers(response, meta)
                    data = bytearray()
                    async for chunk in response.aiter_raw(chunk_size=65536):
                        if loop.time() >= deadline:
                            raise asyncio.TimeoutError
                        if len(data) + len(chunk) > self._max_response_bytes:
                            raise GatewayResponseTooLarge("SDK_RESPONSE_TOO_LARGE", **meta)
                        data.extend(chunk)
                    result = self._response(response, bytes(data), tool, meta)
                    if loop.time() >= deadline:
                        raise asyncio.TimeoutError
                    return result
        try:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise GatewayTimeout("GATEWAY_TOTAL_DEADLINE", outcome=ExecutionOutcome.NOT_EXECUTED, **meta)
            return await asyncio.wait_for(exchange(), timeout=remaining)
        except asyncio.CancelledError:
            raise GatewayCancelled(request_id, meta.get("invocation_id")) from None
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise GatewayTimeout("GATEWAY_TIMEOUT", **meta) from None
        except httpx.RequestError:
            raise GatewayUnavailable("GATEWAY_UNAVAILABLE", **meta) from None


class GatewayRun:
    """Explicit name mapping, independent of local AgentRun and its policy/issuer."""

    def __init__(self, client: GatewayClient, tools: Mapping[str, GatewayTool]):
        snapshot = dict(tools)
        if not snapshot or any(type(name) is not str or not name or type(tool) is not GatewayTool
                               for name, tool in snapshot.items()):
            raise ValueError("explicit Gateway tool mappings required")
        self._client = client
        self._tools = MappingProxyType(snapshot)

    def _tool(self, name):
        if type(name) is not str or name not in self._tools:
            raise ValueError("tool has no Gateway mapping")
        return self._tools[name]

    def execute(self, name: str, arguments: dict, *, request_id=None) -> GatewayResult:
        tool = self._tool(name)
        return self._client.execute(tool.tool_id, arguments, kind=tool.kind, request_id=request_id)

    async def aexecute(self, name: str, arguments: dict, *, request_id=None) -> GatewayResult:
        tool = self._tool(name)
        return await self._client.aexecute(tool.tool_id, arguments, kind=tool.kind, request_id=request_id)
