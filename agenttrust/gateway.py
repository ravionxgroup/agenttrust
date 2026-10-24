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
    "INVALID_REQUEST": ((400, 408), GatewayInvalidRequest, True),
    "UNKNOWN_TOOL": (404, GatewayInvalidRequest, True),
    "INVALID_GATEWAY_CONFIGURATION": (500, GatewayUnavailable, True),
    "GATEWAY_OVERLOADED": (503, GatewayOverloaded, True),
    "UPSTREAM_TIMEOUT": (504, GatewayTimeout, False),
    "UPSTREAM_UNAVAILABLE": (502, GatewayUnavailable, False),
    "UPSTREAM_ERROR": (502, GatewayOutcomeUnknown, False),
    "UPSTREAM_RESPONSE_TOO_LARGE": (502, GatewayResponseTooLarge, False),
    "INTERNAL_ERROR": (500, GatewayOutcomeUnknown, False),
}


class GatewayClient:
    """One POST per invocation, with native sync/async I/O and no retries.

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
                   "Accept-Encoding": "identity", "X-Request-ID": request_id}
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
        if 300 <= response.status_code < 400:
            raise GatewayRedirectRejected("REDIRECT_REJECTED", **meta)
        # Do not allow decompression to allocate beyond the response limit.
        if response.headers.get("Content-Encoding", "identity").lower() not in ("identity", ""):
            raise GatewayMalformedResponse("UNSUPPORTED_CONTENT_ENCODING", **meta)

    def _consume(self, chunks, meta):
        body = bytearray()
        for chunk in chunks:
            if len(body) + len(chunk) > self._max_response_bytes:
                raise GatewayResponseTooLarge("SDK_RESPONSE_TOO_LARGE", **meta)
            body.extend(chunk)
        return bytes(body)

    def _response(self, response, body, tool, meta):
        status = response.status_code
        is_json = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() == "application/json"
        parsed = None
        if not body and tool.kind == "http" and 200 <= status < 300:
            return GatewayResult(data=None, **meta)
        if is_json or tool.kind == "mcp":
            try:
                parsed = _json_loads(body)
            except (ValueError, UnicodeError, RecursionError, OverflowError):
                raise GatewayMalformedResponse("MALFORMED_JSON_RESPONSE", **meta) from None
        if not 200 <= status < 300:
            if (is_json and type(parsed) is dict and set(parsed) == {"request_id", "code", "message"}
                    and type(parsed["code"]) is str and parsed["code"] in _ERRORS
                    and type(parsed["message"]) is str and parsed["request_id"] == meta["request_id"]):
                expected_status, error_type, before_dispatch = _ERRORS[parsed["code"]]
                allowed = expected_status if type(expected_status) is tuple else (expected_status,)
                if status not in allowed:
                    raise GatewayMalformedResponse("INVALID_ERROR_STATUS", **meta)
                # HTTP upstreams can imitate Gateway envelopes. Never infer non-execution
                # from a reserved error envelope on that passthrough path.
                outcome = ExecutionOutcome.NOT_EXECUTED if before_dispatch and tool.kind == "mcp" else ExecutionOutcome.UNKNOWN
                raise error_type(parsed["code"], outcome=outcome, **meta)
            if tool.kind == "mcp":
                raise GatewayMalformedResponse("MALFORMED_GATEWAY_ERROR", **meta)
            raise GatewayExecutionFailed("HTTP_TOOL_EXECUTION_FAILED", outcome=ExecutionOutcome.FAILED, **meta)
        if tool.kind == "mcp" and type(parsed) is not dict:
            raise GatewayMalformedResponse("MALFORMED_MCP_RESULT", **meta)
        if tool.kind == "mcp" and "isError" in parsed:
            if type(parsed["isError"]) is not bool:
                raise GatewayMalformedResponse("MALFORMED_MCP_RESULT", **meta)
            if parsed["isError"]:
                raise GatewayExecutionFailed("MCP_TOOL_EXECUTION_FAILED", outcome=ExecutionOutcome.FAILED, **meta)
        return GatewayResult(data=parsed if is_json or tool.kind == "mcp" else body, **meta)

    def execute(self, tool_id: str, arguments: dict, *, kind="http", request_id=None) -> GatewayResult:
        tool, request_id, body, headers = self._request(tool_id, arguments, kind, request_id)
        meta = dict(request_id=request_id, invocation_id=None)
        try:
            with httpx.Client(timeout=self._timeout, follow_redirects=False, trust_env=False,
                              transport=self._transport) as client:
                with client.stream("POST", f"{self._base_url}/v1/tools/{tool.tool_id}/execute",
                                   content=body, headers=headers) as response:
                    meta = self._metadata(response, request_id)
                    self._check_headers(response, meta)
                    data = self._consume(response.iter_raw(chunk_size=65536), meta)
                    return self._response(response, data, tool, meta)
        except httpx.TimeoutException:
            raise GatewayTimeout("GATEWAY_TIMEOUT", **meta) from None
        except httpx.RequestError:
            raise GatewayUnavailable("GATEWAY_UNAVAILABLE", **meta) from None

    async def aexecute(self, tool_id: str, arguments: dict, *, kind="http", request_id=None) -> GatewayResult:
        tool, request_id, body, headers = self._request(tool_id, arguments, kind, request_id)
        meta = dict(request_id=request_id, invocation_id=None)
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=False, trust_env=False,
                                         transport=self._async_transport) as client:
                async with client.stream("POST", f"{self._base_url}/v1/tools/{tool.tool_id}/execute",
                                         content=body, headers=headers) as response:
                    meta = self._metadata(response, request_id)
                    self._check_headers(response, meta)
                    data = bytearray()
                    async for chunk in response.aiter_raw(chunk_size=65536):
                        if len(data) + len(chunk) > self._max_response_bytes:
                            raise GatewayResponseTooLarge("SDK_RESPONSE_TOO_LARGE", **meta)
                        data.extend(chunk)
                    return self._response(response, bytes(data), tool, meta)
        except asyncio.CancelledError:
            raise GatewayCancelled(request_id, meta.get("invocation_id")) from None
        except httpx.TimeoutException:
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
