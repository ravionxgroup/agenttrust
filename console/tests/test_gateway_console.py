"""Real Gateway audit -> Console projection. Uses the existing T05/T06 fixture.

AGENTTRUST_PLATFORM=/absolute/path/to/agenttrust-platform python -m pytest -q \
    console/tests/test_gateway_console.py
"""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

SDK = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SDK / "tests"))
from test_gateway_integration import real_gateway, gateway_mcp_endpoint  # noqa: E402,F401
from agenttrust.gateway import GatewayAuthorizationDenied, GatewayMCPApplicationError, GatewayTimeout  # noqa: E402

pytestmark = pytest.mark.skipif(not os.environ.get("AGENTTRUST_PLATFORM"), reason="set AGENTTRUST_PLATFORM for real Console ingestion")


def test_real_gateway_audit_projects_into_console_without_double_counting(real_gateway):
    client, calls, audit, _, _, _, _ = real_gateway
    expected = {}
    http = client.execute("http_ok", {})
    expected[http.invocation_id] = ("ALLOW", "SUCCEEDED")
    with pytest.raises(GatewayAuthorizationDenied) as denied:
        client.execute("http_denied", {})
    expected[denied.value.invocation_id] = ("DENY", "NOT_EXECUTED")
    mcp = client.execute("mcp_ok", {}, kind="mcp")
    expected[mcp.invocation_id] = ("ALLOW", "SUCCEEDED")
    with pytest.raises(GatewayMCPApplicationError) as failed:
        client.execute("mcp_fail", {}, kind="mcp")
    expected[failed.value.invocation_id] = ("ALLOW", "FAILED")
    with pytest.raises(GatewayTimeout) as timeout:
        client.execute("http_slow", {})
    expected[timeout.value.invocation_id] = ("ALLOW", "UNKNOWN")
    persisted = list(map(json.loads, audit.read_text().splitlines()))
    assert len(persisted) == 18 and calls["/denied"] == 0
    result = subprocess.run(["node", "scripts/project-audit.mjs"], cwd=SDK / "console",
                            env={**os.environ, "AGENTTRUST_GATEWAY_AUDIT_PATH": str(audit.resolve())},
                            capture_output=True, text=True, check=True, timeout=30)
    snapshot = json.loads(result.stdout)
    assert snapshot["recordCount"] == 18
    assert snapshot["metrics"] == dict(total=5, allowed=4, denied=1, authorizationUnknown=0,
                                       succeeded=2, failed=1, notExecuted=1, unknown=1, incomplete=0, conflicting=0)
    assert {item["invocationId"]: (item["authorization"], item["execution"]) for item in snapshot["invocations"]} == expected
    assert all(not item["incomplete"] for item in snapshot["invocations"])
    # Optional test-artifact copy for actual browser smoke tests; no records invented.
    destination = os.environ.get("AGENTTRUST_T07_EVIDENCE_DIR")
    if destination:
        output = Path(destination)
        output.mkdir(mode=0o700, parents=True, exist_ok=True)
        (output / "gateway-audit.jsonl").write_text(audit.read_text())
        (output / "expected.json").write_text(json.dumps({"invocations": expected, "metrics": snapshot["metrics"]}))
