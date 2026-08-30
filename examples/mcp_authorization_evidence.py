"""Public-safe MCP authorization evidence demo.

Run:
    python3 examples/mcp_authorization_evidence.py

Demonstrates that AgentTrust authorizes an MCP-style tool call before invoking
the underlying client: an allowed read executes, an unauthorized restart is
denied, and the denied tool is never called.
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agenttrust import AgentTrust, ToolDenied
from agenttrust.mcp import wrap_mcp_client
from agenttrust.policy import Policy


POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "ops-reader": {"scopes": ["service.read"]},
    },
}


class EvidenceMCPClient:
    def __init__(self):
        self.invocation_counts = {
            "service.read": 0,
            "service.restart": 0,
        }

    async def list_tools(self):
        return {
            "tools": [
                {"name": "service.read", "_meta": {"agenttrust/scope": "service.read"}},
                {"name": "service.restart", "_meta": {"agenttrust/scope": "service.restart"}},
            ]
        }

    async def call_tool(self, name, arguments=None):
        self.invocation_counts[name] += 1
        if name == "service.read":
            return {
                "service_id": arguments["service_id"],
                "status": "healthy",
            }
        if name == "service.restart":
            return {
                "service_id": arguments["service_id"],
                "status": "restart_requested",
            }
        raise ValueError(f"unknown synthetic tool: {name}")


async def run_demo() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        audit_path = os.path.join(tmp, "agenttrust_mcp_evidence.jsonl")
        agenttrust = AgentTrust(
            policy=Policy.from_dict(POLICY),
            secret="dev-secret-change-me-32-byte-key",
            audit_path=audit_path,
        )
        run = agenttrust.start_run("ops-reader")
        client = EvidenceMCPClient()
        mcp = wrap_mcp_client(run, client, default_to_tool_name=False)
        await mcp.load_tool_scopes()

        print("Agent: ops-reader")
        print(f"Run: {run.run_id}")

        allowed_result = await mcp.call_tool(
            "service.read",
            {"service_id": "svc-synthetic-001"},
        )
        print("\nALLOW")
        print("tool: service.read")
        print("required_scope: service.read")
        print(f"underlying_invoked: {client.invocation_counts['service.read'] == 1}")
        print(f"invocation_count: {client.invocation_counts['service.read']}")
        print(f"result_status: {allowed_result['status']}")

        denied = False
        try:
            await mcp.call_tool(
                "service.restart",
                {
                    "service_id": "svc-synthetic-001",
                    "reason": "synthetic evidence check",
                },
            )
        except ToolDenied:
            denied = True

        print("\nDENY")
        print("tool: service.restart")
        print("required_scope: service.restart")
        print(f"tool_denied: {denied}")
        print(f"underlying_invoked: {client.invocation_counts['service.restart'] > 0}")
        print(f"invocation_count: {client.invocation_counts['service.restart']}")

        print("\nAUDIT")
        for event in agenttrust.audit.read_all():
            status = event["result_status"] or "not_executed"
            print(
                f"{event['decision'].upper():5} "
                f"agent={event['agent_id']} "
                f"run={event['run_id']} "
                f"tool={event['tool']} "
                f"scope={event['required_scope']} "
                f"status={status}"
            )


if __name__ == "__main__":
    asyncio.run(run_demo())
