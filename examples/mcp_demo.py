"""Run: python examples/mcp_demo.py -- demonstrates the Week 3 MCP adapter."""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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


class FakeMCPClient:
    async def list_tools(self):
        return {
            "tools": [
                {"name": "get_customer", "_meta": {"agenttrust/scope": "crm.read"}},
                {"name": "refund_payment", "_meta": {"agenttrust/scope": "payment.refund"}},
            ]
        }

    async def call_tool(self, name, arguments=None):
        if name == "get_customer":
            return {"id": arguments["customer_id"], "name": "Asha"}
        if name == "refund_payment":
            return {"refunded": arguments["amount"]}
        raise ValueError(f"unknown tool: {name}")


async def main():
    audit_path = "demo_mcp_audit.jsonl"
    if os.path.exists(audit_path):
        os.remove(audit_path)

    at = AgentTrust(
        policy=Policy.from_dict(POLICY),
        secret="dev-secret-change-me-32-byte-key",
        audit_path=audit_path,
    )
    run = at.start_run("support-agent")
    mcp = wrap_mcp_client(run, FakeMCPClient(), default_to_tool_name=False)

    scopes = await mcp.load_tool_scopes()
    print("loaded MCP scopes ->", scopes)
    print("ALLOWED get_customer ->", await mcp.call_tool("get_customer", {"customer_id": 42}))

    try:
        await mcp.call_tool("refund_payment", {"amount": 999, "api_key": "sk-secret"})
    except ToolDenied as e:
        print("DENIED refund_payment ->", e)

    print("\n--- audit log ---")
    for ev in at.audit.read_all():
        print(json.dumps({
            k: ev[k]
            for k in ("agent_id", "tool", "required_scope", "decision",
                      "reason", "args_redacted", "result_status")
        }))


if __name__ == "__main__":
    asyncio.run(main())
