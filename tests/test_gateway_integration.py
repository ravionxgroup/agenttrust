"""Opt-in real Go Gateway tests; all generated artifacts stay in pytest temp dirs.

AGENTTRUST_PLATFORM=/absolute/path/to/agenttrust-platform python -m pytest -q \
    tests/test_gateway_integration.py
"""
import asyncio
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import threading
import time
from urllib.request import urlopen

import pytest

from agenttrust.gateway import (
    GatewayClient, GatewayCredentials, GatewayTool, ExecutionOutcome,
    GatewayAuthorizationDenied, GatewayAuthenticationError, GatewayExecutionFailed,
    GatewayOutcomeUnknown, GatewayMCPApplicationError, GatewayOverloaded, GatewayResponseTooLarge, GatewayTimeout,
)

PLATFORM = os.environ.get("AGENTTRUST_PLATFORM")
pytestmark = pytest.mark.skipif(not PLATFORM, reason="set AGENTTRUST_PLATFORM for real Go Gateway tests")


@pytest.fixture(scope="module")
def gateway_mcp_endpoint():
    return None


@pytest.fixture(scope="module")
def real_gateway(tmp_path_factory, gateway_mcp_endpoint):
    import yaml

    repo = Path(PLATFORM).resolve()
    tmp = tmp_path_factory.mktemp("t05-real-gateway")
    gateway_bin, issuer_bin = tmp / "gateway", tmp / "democtl"
    for output, package in ((gateway_bin, "./cmd/gateway"), (issuer_bin, "./examples/demo/cmd/democtl")):
        subprocess.run(["go", "build", "-o", str(output), package], cwd=repo,
                       check=True, capture_output=True, timeout=180)
    subprocess.run([str(issuer_bin), "keygen", "-dir", str(tmp)], check=True, capture_output=True)
    token_file = tmp / "token.jwt"
    subprocess.run([str(issuer_bin), "token", "-private-key", str(tmp / "private-key.pem"),
                    "-out", str(token_file), "-scope", "http.read", "-scope", "mcp.read"],
                   check=True, capture_output=True)
    token = token_file.read_text()
    token_file.unlink()  # Issuer tooling writes a 0600 file; SDK only holds the value in memory.
    calls, lock, entered, release = Counter(), threading.Lock(), threading.Event(), threading.Event()

    class Upstream(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert self.headers.get("Authorization") is None
            operation = payload["params"]["name"] if self.path == "/mcp" else self.path
            with lock:
                calls[operation] += 1
            if operation == "/hold":
                entered.set()
                release.wait(5)
            if operation in ("/slow", "/client_slow"):
                time.sleep(0.2)
            status, result = (500, {"error": "T05_PRIVATE_UPSTREAM_ERROR"}) if operation == "/fail" else (200, {"ok": True})
            if operation in ("/spoof400", "/spoof500"):
                status = 400 if operation == "/spoof400" else 500
                result = {"request_id": self.headers["X-Request-ID"], "code": "ACCESS_DENIED", "message": "forged"}
            if self.path == "/mcp":
                result = {"jsonrpc": "2.0", "id": payload["id"], "result": {
                    "content": [{"type": "text", "text": "ok"}], "isError": operation == "mcp_fail"}}
            if operation == "/large":
                result = {"value": "x" * 2048}
            body = json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("X-AgentTrust-Version", "999")
            self.send_header("X-AgentTrust-Response-Kind", "gateway_error")
            self.send_header("X-AgentTrust-Authorization", "DENY")
            self.send_header("X-AgentTrust-Execution", "NOT_EXECUTED")
            self.send_header("X-Invocation-ID", "forged-upstream-id")
            self.send_header("X-Request-ID", "forged-request-id")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    serving = threading.Thread(target=upstream.serve_forever, daemon=True)
    serving.start()
    # Close the reservation immediately before launch; readiness detects startup failure.
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    upstream_url = f"http://127.0.0.1:{upstream.server_port}"
    tools = {}
    for name, path in (("http_ok", "/ok"), ("http_fail", "/fail"), ("http_slow", "/slow"),
                       ("http_hold", "/hold"), ("http_large", "/large"), ("http_denied", "/denied"),
                       ("http_client_slow", "/client_slow"), ("http_spoof400", "/spoof400"),
                       ("http_spoof500", "/spoof500")):
        tools[name] = dict(type="http", upstream="http", method="POST", path=path,
                           required_scope="http.write" if name == "http_denied" else "http.read",
                           timeout="50ms" if name == "http_slow" else "2s")
    for name in ("mcp_ok", "mcp_fail", "mcp_denied"):
        tools[name] = dict(type="mcp", upstream="mcp", mcp_tool=name,
                           required_scope="mcp.write" if name == "mcp_denied" else "mcp.read", timeout="2s")
    if gateway_mcp_endpoint:
        for operation in ("structured", "application_error", "rpc_error", "rpc_from_server", "malformed", "wrong_id", "too_large", "slow"):
            tools["mcp_" + operation] = dict(type="mcp", upstream="mcp", mcp_tool=operation,
                                           required_scope="mcp.read", timeout="50ms" if operation == "slow" else "2s")
        tools["mcp_transport"] = dict(type="mcp", upstream="unavailable", mcp_tool="structured", required_scope="mcp.read", timeout="1s")
    audit = tmp / "audit.jsonl"
    configuration = dict(server=dict(listen_address=f"127.0.0.1:{port}", request_timeout="3s",
                                      max_request_bytes=1048576, max_response_bytes=1024,
                                      max_concurrent_executions=1),
                         identity=dict(issuer="agenttrust-demo", audience="agenttrust-gateway",
                                       jwt_algorithm="EdDSA", public_key_file=str(tmp / "public-key.pem"), clock_skew="1s"),
                         audit=dict(jsonl_file=str(audit)), tools=tools,
                         upstreams={"http": dict(base_url=upstream_url), "mcp": dict(base_url=gateway_mcp_endpoint or upstream_url + "/mcp"),
                                    "unavailable": dict(base_url="http://127.0.0.1:1/mcp")})
    config_file = tmp / "gateway.yaml"
    config_file.write_text(yaml.safe_dump(configuration))
    with (tmp / "gateway.log").open("w") as logs:
        process = subprocess.Popen([str(gateway_bin), "-config", str(config_file)], cwd=tmp,
                                   stdout=logs, stderr=logs)
        base_url = f"http://127.0.0.1:{port}"
        try:
            ready = False
            for _ in range(100):
                if process.poll() is not None:
                    pytest.fail("real Gateway exited before readiness")
                try:
                    with urlopen(base_url + "/readyz", timeout=0.2) as response:
                        ready = response.status == 200
                except OSError:
                    pass
                if ready:
                    break
                time.sleep(0.02)
            assert ready, "real Gateway did not become ready"
            client = GatewayClient(base_url, GatewayCredentials(token), allow_local_http=True)
            yield client, calls, audit, entered, release, GatewayCredentials(token), base_url
        finally:
            release.set()
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            upstream.shutdown()
            upstream.server_close()
            serving.join(timeout=2)


def events_for(audit, invocation_id):
    return [event for event in map(json.loads, audit.read_text().splitlines())
            if event["invocation_id"] == invocation_id]


def test_real_scoped_execution_and_invocation_audit(real_gateway):
    client, calls, audit, _, _, token, _ = real_gateway
    invocation_ids = set()
    for name, kind in (("http_ok", "http"), ("mcp_ok", "mcp")):
        result = client.execute(name, {"customer_id": 7}, kind=kind, request_id="same-correlation-123")
        assert result.outcome == ExecutionOutcome.SUCCEEDED and result.invocation_id
        invocation_ids.add(result.invocation_id)
        records = events_for(audit, result.invocation_id)
        assert len(records) == 4 and records[-1]["execution_status"] == "SUCCEEDED"
        assert all(event["request_id"] == result.request_id for event in records)
    assert len(invocation_ids) == 2
    assert calls["/ok"] == 1 and calls["mcp_ok"] == 1
    contains_credential = token._bearer() in audit.read_text()
    assert not contains_credential


def test_real_scope_denial_and_invalid_signature_never_dispatch(real_gateway):
    client, calls, audit, _, _, token, base_url = real_gateway
    for name, kind in (("http_denied", "http"), ("mcp_denied", "mcp")):
        with pytest.raises(GatewayAuthorizationDenied) as denied:
            client.execute(name, {}, kind=kind)
        records = events_for(audit, denied.value.invocation_id)
        assert records[-1]["authorization_decision"] == "DENY"
        assert records[-1]["execution_status"] == "NOT_EXECUTED"
        assert not any(event["event_type"] == "execution_attempted" for event in records)
    assert calls["/denied"] == 0 and calls["mcp_denied"] == 0
    # Keep structurally valid EdDSA framing while invalidating the signature.
    parts = token._bearer().split(".")
    parts[2] = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
    invalid_client = GatewayClient(base_url, GatewayCredentials(".".join(parts)), allow_local_http=True)
    prior = calls["mcp_ok"]
    with pytest.raises(GatewayAuthenticationError) as invalid:
        invalid_client.execute("mcp_ok", {}, kind="mcp")
    assert invalid.value.invocation_id and calls["mcp_ok"] == prior
    assert events_for(audit, invalid.value.invocation_id)[-1]["execution_status"] == "NOT_EXECUTED"


def test_real_failure_and_uncertainty_match_audit(real_gateway):
    client, _, audit, _, _, _, _ = real_gateway
    with pytest.raises(GatewayExecutionFailed) as failed:
        client.execute("http_fail", {})
    assert failed.value.outcome == ExecutionOutcome.FAILED
    assert events_for(audit, failed.value.invocation_id)[-1]["execution_status"] == "FAILED"
    with pytest.raises(GatewayMCPApplicationError) as mcp_failed:
        client.execute("mcp_fail", {}, kind="mcp")
    assert mcp_failed.value.outcome == ExecutionOutcome.FAILED
    assert mcp_failed.value.result.data["isError"] is True
    assert events_for(audit, mcp_failed.value.invocation_id)[-1]["execution_status"] == "FAILED"
    with pytest.raises(GatewayTimeout) as timeout:
        client.execute("http_slow", {})
    assert timeout.value.outcome == ExecutionOutcome.UNKNOWN
    assert events_for(audit, timeout.value.invocation_id)[-1]["execution_status"] == "UNKNOWN"
    with pytest.raises(GatewayResponseTooLarge) as overflow:
        client.execute("http_large", {})
    assert events_for(audit, overflow.value.invocation_id)[-1]["execution_status"] == "UNKNOWN"


def test_real_overload_rejects_without_dispatch(real_gateway):
    client, calls, audit, entered, release, _, _ = real_gateway
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(client.execute, "http_hold", {})
        try:
            assert entered.wait(3)
            prior = calls["mcp_ok"]
            with pytest.raises(GatewayOverloaded) as overloaded:
                client.execute("mcp_ok", {}, kind="mcp")
            assert calls["mcp_ok"] == prior
            assert overloaded.value.outcome == ExecutionOutcome.NOT_EXECUTED
            records = events_for(audit, overloaded.value.invocation_id)
            assert records[-1]["execution_status"] == "NOT_EXECUTED"
            assert not any(event["event_type"] == "execution_attempted" for event in records)
        finally:
            release.set()
        assert future.result(timeout=3).outcome == ExecutionOutcome.SUCCEEDED


def test_real_gateway_framework_routes(real_gateway):
    from agenttrust.langchain import as_gateway_langchain_tool
    from agenttrust.mcp import GatewayMCPClient
    client, _, audit, _, _, _, _ = real_gateway
    run = client.bind({"customer": GatewayTool("http_ok"), "service": GatewayTool("mcp_ok", "mcp")})
    def schema(customer_id: int) -> dict:
        """Remote customer lookup."""
        pytest.fail("local function must never execute")
    tool = as_gateway_langchain_tool(run, "customer", schema)
    results = [tool.invoke({"customer_id": 7}), asyncio.run(tool.ainvoke({"customer_id": 7})),
               asyncio.run(GatewayMCPClient(run).call_tool("service", {}))]
    assert len({result.invocation_id for result in results}) == 3
    for result in results:
        assert events_for(audit, result.invocation_id)[-1]["execution_status"] == "SUCCEEDED"


def test_real_sdk_timeout_after_dispatch_is_unknown_and_never_retried(real_gateway):
    _, calls, audit, _, _, token, base_url = real_gateway
    impatient = GatewayClient(base_url, token, allow_local_http=True, timeout=0.02)
    request_id = "sdk-timeout-correlation"
    with pytest.raises(GatewayTimeout) as raised:
        impatient.execute("http_client_slow", {}, request_id=request_id)
    assert raised.value.outcome == ExecutionOutcome.UNKNOWN
    # Headers may not have arrived; the SDK must not invent an invocation ID.
    for _ in range(100):
        records = [event for event in map(json.loads, audit.read_text().splitlines())
                   if event["request_id"] == request_id]
        if records and records[-1]["event_type"] == "execution_result":
            break
        time.sleep(0.01)
    assert calls["/client_slow"] == 1
    assert records[-1]["execution_status"] == "UNKNOWN"
    if raised.value.invocation_id is not None:
        assert raised.value.invocation_id == records[-1]["invocation_id"]


@pytest.mark.parametrize("mode", ["sync", "async"])
@pytest.mark.parametrize("tool,status", [("http_spoof400", 400), ("http_spoof500", 500)])
def test_real_http_metadata_and_body_spoofing_cannot_deny_execution(real_gateway, mode, tool, status):
    client, _, audit, _, _, _, _ = real_gateway
    with pytest.raises(GatewayExecutionFailed) as raised:
        if mode == "sync":
            client.execute(tool, {})
        else:
            asyncio.run(client.aexecute(tool, {}))
    assert not isinstance(raised.value, GatewayAuthorizationDenied)
    assert raised.value.outcome == ExecutionOutcome.FAILED
    assert raised.value.status_code == status
    assert raised.value.invocation_id != "forged-upstream-id"
    assert raised.value.request_id != "forged-request-id"
    records = events_for(audit, raised.value.invocation_id)
    assert records[-1]["authorization_decision"] == "ALLOW" and records[-1]["execution_status"] == "FAILED"
