"""
Real MCP SDK smoke test — Week 3 validation.

Uses the official mcp package (requires Python >= 3.10) and an in-process
server/client pair so no external process or network is needed.

Run: .venv/bin/python examples/mcp_real_smoke.py
"""
import asyncio
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mcp.server.fastmcp import FastMCP
from mcp.shared.memory import create_connected_server_and_client_session

from agenttrust import AgentTrust, ToolDenied
from agenttrust.mcp import wrap_mcp_client
from agenttrust.policy import Policy


POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "ticket.*"]},
    },
}


def build_server() -> FastMCP:
    server = FastMCP("agenttrust-smoke-server")

    @server.tool(meta={"agenttrust/scope": "crm.read"})
    def get_customer(customer_id: int) -> dict:
        return {"id": customer_id, "name": "Asha"}

    @server.tool(meta={"agenttrust/scope": "payment.refund"})
    def refund_payment(amount: float, api_key: str = "") -> dict:
        return {"refunded": amount}

    return server


async def main() -> None:
    audit_path = "demo_mcp_real_smoke_audit.jsonl"
    if os.path.exists(audit_path):
        os.remove(audit_path)

    at = AgentTrust(
        policy=Policy.from_dict(POLICY),
        secret="dev-secret-change-me-32-byte-key",
        audit_path=audit_path,
    )
    run = at.start_run("support-agent")

    async with create_connected_server_and_client_session(build_server()) as session:
        mcp = wrap_mcp_client(run, session, default_to_tool_name=False)

        # Discover scopes declared in real Tool.meta (_meta JSON alias)
        scopes = await mcp.load_tool_scopes()
        print("discovered scopes ->", scopes)
        assert scopes.get("get_customer") == "crm.read", f"unexpected: {scopes}"
        assert scopes.get("refund_payment") == "payment.refund", f"unexpected: {scopes}"

        # Allowed call — crm.read is granted
        result = await mcp.call_tool("get_customer", {"customer_id": 42})
        print("ALLOWED get_customer ->", result)
        assert not result.isError

        # Denied call — payment.refund is not granted; api_key must be redacted
        try:
            await mcp.call_tool("refund_payment", {"amount": 999, "api_key": "sk-secret"})
            assert False, "expected ToolDenied"
        except ToolDenied as e:
            print("DENIED refund_payment ->", e)

    print("\n--- audit log ---")
    events = at.audit.read_all()
    for ev in events:
        print(json.dumps({
            k: ev[k]
            for k in ("agent_id", "tool", "required_scope", "decision",
                      "reason", "args_redacted", "result_status")
        }))

    # Verify audit correctness
    assert len(events) == 2
    allow_ev, deny_ev = events
    assert allow_ev["decision"] == "allow" and allow_ev["required_scope"] == "crm.read"
    assert deny_ev["decision"] == "deny" and deny_ev["required_scope"] == "payment.refund"
    assert deny_ev["args_redacted"]["arguments"]["api_key"] == "***redacted***"

    print("\nAll assertions passed.")


if __name__ == "__main__":
    asyncio.run(main())
