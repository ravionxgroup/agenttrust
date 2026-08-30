import os
import tempfile
import unittest

from agenttrust import AgentTrust, ToolDenied
from agenttrust.mcp import MCPToolScopeError, wrap_mcp_client
from agenttrust.policy import Policy


POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "ticket.*"]},
    },
}


class FakeMCPClient:
    def __init__(self):
        self.calls = []

    async def list_tools(self):
        return {
            "tools": [
                {"name": "get_customer", "_meta": {"agenttrust/scope": "crm.read"}},
                {"name": "refund_payment", "_meta": {"agenttrust/scope": "payment.refund"}},
            ]
        }

    async def call_tool(self, name, arguments=None, **kwargs):
        self.calls.append((name, arguments or {}, kwargs))
        return {"tool": name, "arguments": arguments or {}}


class GuardedMCPClientTest(unittest.IsolatedAsyncioTestCase):
    def make_run(self, audit_path):
        at = AgentTrust(
            policy=Policy.from_dict(POLICY),
            secret="dev-secret-change-me-32-byte-key",
            audit_path=audit_path,
        )
        return at, at.start_run("support-agent")

    async def test_allows_mapped_mcp_tool_and_audits_ok(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self.make_run(audit_path)
            client = FakeMCPClient()
            mcp = wrap_mcp_client(
                run,
                client,
                tool_scopes={"get_customer": "crm.read"},
                default_to_tool_name=False,
            )

            result = await mcp.call_tool("get_customer", {"customer_id": 42})

            self.assertEqual(result["tool"], "get_customer")
            self.assertEqual(client.calls, [("get_customer", {"customer_id": 42}, {})])
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "allow")
            self.assertEqual(events[0]["tool"], "get_customer")
            self.assertEqual(events[0]["required_scope"], "crm.read")
            self.assertEqual(events[0]["result_status"], "ok")

    async def test_loads_declared_tool_scopes_from_mcp_tool_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self.make_run(audit_path)
            client = FakeMCPClient()
            mcp = wrap_mcp_client(run, client, default_to_tool_name=False)

            scopes = await mcp.load_tool_scopes()
            result = await mcp.call_tool("get_customer", {"customer_id": 42})

            self.assertEqual(scopes["get_customer"], "crm.read")
            self.assertEqual(result["tool"], "get_customer")
            self.assertEqual(at.audit.read_all()[0]["required_scope"], "crm.read")

    async def test_denies_mcp_tool_before_client_call_and_redacts_args(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self.make_run(audit_path)
            client = FakeMCPClient()
            mcp = wrap_mcp_client(run, client, default_to_tool_name=False)
            await mcp.load_tool_scopes()

            with self.assertRaises(ToolDenied):
                await mcp.call_tool("refund_payment", {"amount": 999, "api_key": "sk-secret"})

            self.assertEqual(client.calls, [])
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "deny")
            self.assertEqual(events[0]["required_scope"], "payment.refund")
            self.assertEqual(
                events[0]["args_redacted"]["arguments"]["api_key"],
                "***redacted***",
            )

    async def test_missing_scope_mapping_fails_closed_when_default_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            _at, run = self.make_run(audit_path)
            client = FakeMCPClient()
            mcp = wrap_mcp_client(run, client, default_to_tool_name=False)

            with self.assertRaises(MCPToolScopeError):
                await mcp.call_tool("get_customer", {"customer_id": 42})

            self.assertEqual(client.calls, [])

    async def test_unresolved_scope_is_audited_as_deny(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self.make_run(audit_path)
            client = FakeMCPClient()
            mcp = wrap_mcp_client(run, client, default_to_tool_name=False)

            with self.assertRaises(MCPToolScopeError):
                await mcp.call_tool("get_customer", {"customer_id": 42, "api_key": "sk-secret"})

            self.assertEqual(client.calls, [])
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "deny")
            self.assertEqual(events[0]["tool"], "get_customer")
            self.assertEqual(events[0]["required_scope"], "<unresolved>")
            self.assertEqual(events[0]["reason"], "no scope mapping for tool")
            self.assertEqual(events[0]["args_redacted"]["arguments"]["api_key"], "***redacted***")

    async def test_custom_scope_resolver_is_called_and_audited(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = self.make_run(audit_path)
            client = FakeMCPClient()
            resolver_calls = []

            def my_resolver(tool_name: str) -> str:
                resolver_calls.append(tool_name)
                return "crm.read"

            mcp = wrap_mcp_client(run, client, scope_resolver=my_resolver)
            result = await mcp.call_tool("get_customer", {"customer_id": 1})

            self.assertEqual(result["tool"], "get_customer")
            self.assertEqual(resolver_calls, ["get_customer"])
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "allow")
            self.assertEqual(events[0]["required_scope"], "crm.read")

    async def test_allowed_then_denied_mcp_call_preserves_deny_before_execute_evidence(self):
        policy = Policy.from_dict({
            "issuer": "agenttrust-local",
            "default_ttl_seconds": 300,
            "agents": {
                "ops-reader": {"scopes": ["service.read"]},
            },
        })

        class EvidenceClient:
            def __init__(self):
                self.calls = []

            async def list_tools(self):
                return {
                    "tools": [
                        {"name": "service.read", "_meta": {"agenttrust/scope": "service.read"}},
                        {"name": "service.restart", "_meta": {"agenttrust/scope": "service.restart"}},
                    ]
                }

            async def call_tool(self, name, arguments=None, **kwargs):
                self.calls.append((name, arguments or {}, kwargs))
                return {"tool": name, "status": "ok"}

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at = AgentTrust(
                policy=policy,
                secret="dev-secret-change-me-32-byte-key",
                audit_path=audit_path,
            )
            run = at.start_run("ops-reader")
            client = EvidenceClient()
            mcp = wrap_mcp_client(run, client, default_to_tool_name=False)
            await mcp.load_tool_scopes()

            result = await mcp.call_tool("service.read", {"service_id": "svc-synthetic-001"})

            with self.assertRaises(ToolDenied):
                await mcp.call_tool("service.restart", {"service_id": "svc-synthetic-001"})

            self.assertEqual(result["tool"], "service.read")
            self.assertEqual(
                client.calls,
                [("service.read", {"service_id": "svc-synthetic-001"}, {})],
            )

            events = at.audit.read_all()
            self.assertEqual(len(events), 2)
            self.assertEqual(events[0]["decision"], "allow")
            self.assertEqual(events[0]["tool"], "service.read")
            self.assertEqual(events[0]["required_scope"], "service.read")
            self.assertEqual(events[0]["result_status"], "ok")
            self.assertEqual(events[1]["decision"], "deny")
            self.assertEqual(events[1]["tool"], "service.restart")
            self.assertEqual(events[1]["required_scope"], "service.restart")
            self.assertIsNone(events[1]["result_status"])


if __name__ == "__main__":
    unittest.main()
