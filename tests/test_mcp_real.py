"""
Integration tests against the real mcp SDK.
Skipped automatically when the mcp package is not installed (Python < 3.10 envs).
Run with: .venv/bin/python -m pytest tests/test_mcp_real.py -v
"""
import importlib
import os
import tempfile
import unittest

mcp_available = importlib.util.find_spec("mcp") is not None


@unittest.skipUnless(mcp_available, "mcp package not installed")
class RealMCPIntegrationTest(unittest.IsolatedAsyncioTestCase):
    def _make_server(self):
        from mcp.server.fastmcp import FastMCP

        server = FastMCP("test-server")

        @server.tool(meta={"agenttrust/scope": "crm.read"})
        def get_customer(customer_id: int) -> dict:
            return {"id": customer_id, "name": "Asha"}

        @server.tool(meta={"agenttrust/scope": "payment.refund"})
        def refund_payment(amount: float, api_key: str = "") -> dict:
            return {"refunded": amount}

        return server

    def _make_run(self, audit_path):
        from agenttrust import AgentTrust
        from agenttrust.policy import Policy

        at = AgentTrust(
            policy=Policy.from_dict({
                "issuer": "agenttrust-local",
                "default_ttl_seconds": 300,
                "agents": {"support-agent": {"scopes": ["crm.read", "ticket.*"]}},
            }),
            secret="dev-secret-change-me-32-byte-key",
            audit_path=audit_path,
        )
        return at, at.start_run("support-agent")

    async def test_scope_discovery_from_real_tool_meta(self):
        """Tool.meta (_meta JSON alias) is correctly read by the scope resolver."""
        from mcp.shared.memory import create_connected_server_and_client_session
        from agenttrust.mcp import wrap_mcp_client

        with tempfile.TemporaryDirectory() as tmp:
            _, run = self._make_run(os.path.join(tmp, "audit.jsonl"))
            async with create_connected_server_and_client_session(self._make_server()) as session:
                mcp = wrap_mcp_client(run, session, default_to_tool_name=False)
                scopes = await mcp.load_tool_scopes()

        self.assertEqual(scopes["get_customer"], "crm.read")
        self.assertEqual(scopes["refund_payment"], "payment.refund")

    async def test_allowed_call_runs_and_audits(self):
        """Allowed MCP tool call executes and produces an allow audit event."""
        from mcp.shared.memory import create_connected_server_and_client_session
        from agenttrust.mcp import wrap_mcp_client

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self._make_run(audit_path)
            async with create_connected_server_and_client_session(self._make_server()) as session:
                mcp = wrap_mcp_client(run, session, default_to_tool_name=False)
                await mcp.load_tool_scopes()
                result = await mcp.call_tool("get_customer", {"customer_id": 42})

            self.assertFalse(result.isError)
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "allow")
            self.assertEqual(events[0]["required_scope"], "crm.read")
            self.assertEqual(events[0]["result_status"], "ok")

    async def test_denied_call_blocked_before_server_and_audited(self):
        """Out-of-scope MCP tool is blocked before the server receives it; secret is redacted."""
        from mcp.shared.memory import create_connected_server_and_client_session
        from agenttrust import ToolDenied
        from agenttrust.mcp import wrap_mcp_client

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self._make_run(audit_path)
            async with create_connected_server_and_client_session(self._make_server()) as session:
                mcp = wrap_mcp_client(run, session, default_to_tool_name=False)
                await mcp.load_tool_scopes()
                with self.assertRaises(ToolDenied):
                    await mcp.call_tool("refund_payment", {"amount": 999, "api_key": "sk-secret"})

            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "deny")
            self.assertEqual(events[0]["required_scope"], "payment.refund")
            self.assertIsNone(events[0]["result_status"])
            self.assertEqual(
                events[0]["args_redacted"]["arguments"]["api_key"], "***redacted***"
            )


if __name__ == "__main__":
    unittest.main()
