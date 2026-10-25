"""Real Gateway audit -> Console projection. Uses the existing T05/T06 fixture.

AGENTTRUST_PLATFORM=/absolute/path/to/agenttrust-platform python -m pytest -q \
    console/tests/test_gateway_console.py
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import pytest

SDK = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SDK / "tests"))
from test_gateway_integration import real_gateway, gateway_mcp_endpoint  # noqa: E402,F401
from agenttrust.gateway import GatewayAuthorizationDenied, GatewayMCPApplicationError, GatewayTimeout  # noqa: E402

requires_gateway = pytest.mark.skipif(not os.environ.get("AGENTTRUST_PLATFORM"), reason="set AGENTTRUST_PLATFORM for real Console ingestion")


def _safe_projection_stderr(stderr):
    # Extract only fixed diagnostics, never arbitrary exception text, paths,
    # audit contents or environment values. Bound processing as well as output.
    stderr = (stderr or "")[:4096]
    details = [code for code in ("ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND",
                                "ERR_UNKNOWN_FILE_EXTENSION", "ERR_REQUIRE_ESM",
                                "EACCES", "EPERM", "ENOENT") if code in stderr]
    if re.search(r"Cannot find (?:package|module) ['\"]typescript['\"]", stderr):
        details.append("Cannot find package 'typescript'; run npm ci in console")
    if "Gateway audit projection unavailable" in stderr:
        details.append("Gateway audit projection unavailable")
    version = re.search(r"\bNode\.js v[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\b", stderr)
    if version:
        details.append(version.group())
    return "; ".join(details) or "[unrecognized stderr omitted]"


def _project_gateway_audit(audit):
    try:
        return subprocess.run(
            ["node", "scripts/project-audit.mjs"], cwd=SDK / "console",
            env={**os.environ, "AGENTTRUST_GATEWAY_AUDIT_PATH": str(audit.resolve())},
            capture_output=True, text=True, check=True, timeout=30,
        )
    except subprocess.CalledProcessError as error:
        pytest.fail(
            f"Console audit projection exited {error.returncode}; sanitized Node stderr: "
            + _safe_projection_stderr(error.stderr), pytrace=False,
        )


def test_projection_stderr_reports_missing_dependency_without_secrets():
    secret = "projection-diagnostic-private-sentinel"
    diagnostic = _safe_projection_stderr(
        "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'typescript' imported from /"
        + secret + "/project-audit.mjs\nAuthorization: Bearer " + secret
        + "\nNode.js v22.23.1\n"
    )
    assert "ERR_MODULE_NOT_FOUND" in diagnostic and "typescript" in diagnostic
    assert "Node.js v22.23.1" in diagnostic
    assert secret not in diagnostic and "Bearer" not in diagnostic
    assert _safe_projection_stderr(secret) == "[unrecognized stderr omitted]"


def test_projection_failure_exposes_only_sanitized_stderr(monkeypatch):
    secret = "projection-failure-private-sentinel"

    def fail(*args, **kwargs):
        raise subprocess.CalledProcessError(
            1, args[0], output=secret,
            stderr="Gateway audit projection unavailable\n" + secret,
        )

    monkeypatch.setattr(subprocess, "run", fail)
    with pytest.raises(pytest.fail.Exception) as failed:
        _project_gateway_audit(Path("audit.jsonl"))
    assert "exited 1" in str(failed.value)
    assert "Gateway audit projection unavailable" in str(failed.value)
    assert secret not in str(failed.value)


@requires_gateway
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
    result = _project_gateway_audit(audit)
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
