"""Real SDK -> Go Gateway -> independent official MCP 2.x HTTP server.

The library handles normal framing, modern stateless dispatch, structured results
and application errors. The fixture labels malformed/oversized/correlation wire
faults explicitly; those are not independent implementation success claims.
"""
import asyncio
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

import pytest
import httpx

from test_gateway_integration import real_gateway, events_for
from agenttrust.gateway import (
    GatewayClient, GatewayCredentials, GatewayTool, GatewayAuthorizationDenied,
    GatewayAuthenticationError, GatewayMCPApplicationError, GatewayMCPProtocolError,
    GatewayMalformedResponse, GatewayUnavailable, GatewayTimeout, GatewayResponseTooLarge,
    ExecutionOutcome,
)

pytestmark = pytest.mark.skipif(not os.environ.get("AGENTTRUST_PLATFORM"), reason="set AGENTTRUST_PLATFORM for independent MCP interoperability")


@pytest.fixture(scope="module")
def gateway_mcp_endpoint(tmp_path_factory):
    try:
        major = int(importlib.metadata.version("mcp").split(".")[0])
    except importlib.metadata.PackageNotFoundError:
        pytest.skip("independent MCP server requires optional mcp>=2")
    if major < 2:
        pytest.skip("2026-07-28 interoperability requires MCP 2.x; legacy 1.x checked separately")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    log = tmp_path_factory.mktemp("independent-mcp") / "server.log"
    script = Path(__file__).parent / "fixtures" / "independent_mcp.py"
    with log.open("w") as logs:
        process = subprocess.Popen([sys.executable, str(script), str(port)], stdout=logs, stderr=logs)
        base = f"http://127.0.0.1:{port}"
        try:
            ready = False
            for _ in range(150):
                if process.poll() is not None:
                    pytest.fail("independent MCP server exited before readiness: " + log.read_text())
                try:
                    with urlopen(base + "/counts", timeout=0.2) as response:
                        ready = response.status == 200
                except OSError:
                    pass
                if ready:
                    break
                time.sleep(0.02)
            assert ready
            yield base + "/mcp"
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def counter(endpoint):
    with urlopen(endpoint.removesuffix("/mcp") + "/counts") as response:
        return json.load(response)


def invoke(client, tool, mode):
    if mode == "sync":
        return client.execute(tool, {}, kind="mcp", request_id="interop-correlation")
    return asyncio.run(client.aexecute(tool, {}, kind="mcp", request_id="interop-correlation"))


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_independent_structured_result_stateless_dispatch(real_gateway, gateway_mcp_endpoint, mode):
    client, _, audit, _, _, _, _ = real_gateway
    result = invoke(client, "mcp_structured", mode)
    assert result.data["structuredContent"] == {"customer_id": 7, "source": "independent-mcp"}
    assert result.data.get("isError", False) is False
    assert events_for(audit, result.invocation_id)[-1]["execution_status"] == "SUCCEEDED"
    observation = counter(gateway_mcp_endpoint)["observed"][-1]
    assert observation == {"method": "tools/call", "version": "2026-07-28", "session": False, "authorization": False}


@pytest.mark.parametrize("mode", ["sync", "async"])
def test_independent_application_error_is_failed_and_structured(real_gateway, mode):
    client, _, audit, _, _, _, _ = real_gateway
    with pytest.raises(GatewayMCPApplicationError) as error:
        invoke(client, "mcp_application_error", mode)
    assert error.value.outcome == ExecutionOutcome.FAILED
    assert error.value.result.data["isError"] is True
    assert error.value.result.data["structuredContent"] == {"reason": "validation"}
    assert events_for(audit, error.value.invocation_id)[-1]["execution_status"] == "FAILED"


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("tool,error", [
    ("mcp_rpc_error", GatewayMCPProtocolError), ("mcp_rpc_from_server", GatewayMCPProtocolError),
    ("mcp_malformed", GatewayMalformedResponse), ("mcp_wrong_id", GatewayMalformedResponse),
    ("mcp_transport", GatewayUnavailable), ("mcp_slow", GatewayTimeout),
    ("mcp_too_large", GatewayResponseTooLarge),
])
def test_mcp_wire_failures_are_unknown(real_gateway, tool, error, mode):
    client, _, audit, _, _, _, _ = real_gateway
    with pytest.raises(error) as raised:
        invoke(client, tool, mode)
    assert raised.value.outcome == ExecutionOutcome.UNKNOWN
    assert "T06_PRIVATE_RPC_SENTINEL" not in repr(raised.value) + repr(vars(raised.value))
    assert events_for(audit, raised.value.invocation_id)[-1]["execution_status"] == "UNKNOWN"


def test_independent_authentication_and_scope_denials_never_dispatch(real_gateway, gateway_mcp_endpoint):
    client, _, audit, _, _, token, base_url = real_gateway
    before = counter(gateway_mcp_endpoint)["calls"]
    with pytest.raises(GatewayAuthorizationDenied) as denied:
        client.execute("mcp_denied", {}, kind="mcp")
    parts = token._bearer().split(".")
    parts[2] = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
    invalid = GatewayClient(base_url, GatewayCredentials(".".join(parts)), allow_local_http=True)
    with pytest.raises(GatewayAuthenticationError) as bad:
        invalid.execute("mcp_structured", {}, kind="mcp")
    assert counter(gateway_mcp_endpoint)["calls"] == before
    for error in (denied.value, bad.value):
        assert error.outcome == ExecutionOutcome.NOT_EXECUTED
        events = events_for(audit, error.invocation_id)
        assert events[-1]["execution_status"] == "NOT_EXECUTED"
        assert not any(event["event_type"] == "execution_attempted" for event in events)


def test_modern_server_discovery_without_initialization(gateway_mcp_endpoint):
    # Administrative interoperability probe, not a Gateway discovery feature.
    response = httpx.post(gateway_mcp_endpoint, headers={
        "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "server/discover",
    }, json={"jsonrpc": "2.0", "id": "discovery", "method": "server/discover", "params": {"_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {"name": "interop-probe", "version": "1"},
        "io.modelcontextprotocol/clientCapabilities": {},
    }}}, trust_env=False)
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "discovery" and "result" in payload
    assert "Mcp-Session-Id" not in response.headers
    discovered = httpx.post(gateway_mcp_endpoint, headers={
        "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/list",
    }, json={"jsonrpc": "2.0", "id": "tool-list", "method": "tools/list", "params": {"_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {"name": "interop-probe", "version": "1"},
        "io.modelcontextprotocol/clientCapabilities": {},
    }}}, trust_env=False)
    assert discovered.status_code == 200
    names = {tool["name"] for tool in discovered.json()["result"]["tools"]}
    assert {"structured", "application_error", "slow"} <= names
