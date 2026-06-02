"""
LangChain adapter tests.
Skipped automatically when langchain-core is not installed.
Run with: .venv/bin/python -m pytest tests/test_langchain.py -v
"""
import importlib
import os
import tempfile
import unittest

from agenttrust import AgentTrust, ToolDenied
from agenttrust.policy import Policy

langchain_available = importlib.util.find_spec("langchain_core") is not None

POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "ticket.*"]},
    },
}


def make_run(audit_path):
    at = AgentTrust(
        policy=Policy.from_dict(POLICY),
        secret="dev-secret-change-me-32-byte-key",
        audit_path=audit_path,
    )
    return at, at.start_run("support-agent")


@unittest.skipUnless(langchain_available, "langchain-core not installed")
class AsLangchainToolTest(unittest.TestCase):
    def test_tool_name_and_description_from_function(self):
        from agenttrust.langchain import as_langchain_tool

        with tempfile.TemporaryDirectory() as tmp:
            _, run = make_run(os.path.join(tmp, "audit.jsonl"))

            def get_customer(customer_id: int) -> dict:
                """Fetch a customer by ID."""
                return {}

            tool = as_langchain_tool(run, "crm.read", get_customer)

        self.assertEqual(tool.name, "get_customer")
        self.assertEqual(tool.description, "Fetch a customer by ID.")

    def test_tool_name_and_description_can_be_overridden(self):
        from agenttrust.langchain import as_langchain_tool

        with tempfile.TemporaryDirectory() as tmp:
            _, run = make_run(os.path.join(tmp, "audit.jsonl"))

            tool = as_langchain_tool(
                run, "crm.read", lambda: None,
                name="lookup_customer",
                description="Look up a customer record.",
            )

        self.assertEqual(tool.name, "lookup_customer")
        self.assertEqual(tool.description, "Look up a customer record.")

    def test_allowed_tool_invoke_runs_and_audits(self):
        from agenttrust.langchain import as_langchain_tool

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_run(audit_path)

            def get_customer(customer_id: int) -> dict:
                return {"id": customer_id, "name": "Asha"}

            tool = as_langchain_tool(run, "crm.read", get_customer)
            result = tool.invoke({"customer_id": 42})

            self.assertEqual(result, {"id": 42, "name": "Asha"})
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "allow")
            self.assertEqual(events[0]["tool"], "get_customer")
            self.assertEqual(events[0]["required_scope"], "crm.read")
            self.assertEqual(events[0]["result_status"], "ok")

    def test_denied_tool_invoke_raises_and_audits(self):
        from agenttrust.langchain import as_langchain_tool

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_run(audit_path)

            def do_refund(amount: float) -> dict:
                return {"refunded": amount}

            tool = as_langchain_tool(run, "payment.refund", do_refund)

            with self.assertRaises(ToolDenied):
                tool.invoke({"amount": 999})

            events = at.audit.read_all()
            self.assertEqual(events[0]["decision"], "deny")
            self.assertEqual(events[0]["required_scope"], "payment.refund")

    def test_schema_inferred_from_type_annotations(self):
        from agenttrust.langchain import as_langchain_tool

        with tempfile.TemporaryDirectory() as tmp:
            _, run = make_run(os.path.join(tmp, "audit.jsonl"))

            def get_customer(customer_id: int, include_orders: bool = False) -> dict:
                return {}

            tool = as_langchain_tool(run, "crm.read", get_customer)

        schema = tool.args_schema.model_json_schema()
        self.assertIn("customer_id", schema["properties"])
        self.assertIn("include_orders", schema["properties"])


@unittest.skipUnless(langchain_available, "langchain-core not installed")
class AsLangchainToolsTest(unittest.TestCase):
    def test_builds_multiple_tools_from_spec_list(self):
        from agenttrust.langchain import as_langchain_tools

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_run(audit_path)

            def get_customer(customer_id: int) -> dict:
                return {"id": customer_id}

            def create_ticket(subject: str) -> dict:
                return {"ticket": subject}

            tools = as_langchain_tools(run, [
                ("crm.read", get_customer),
                ("ticket.create", create_ticket, "open_ticket", "Open a support ticket"),
            ])

        self.assertEqual(len(tools), 2)
        self.assertEqual(tools[0].name, "get_customer")
        self.assertEqual(tools[1].name, "open_ticket")
        self.assertEqual(tools[1].description, "Open a support ticket")

    def test_all_tools_route_through_agenttrust(self):
        from agenttrust.langchain import as_langchain_tools

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_run(audit_path)

            def get_customer(customer_id: int) -> dict:
                return {"id": customer_id}

            def create_ticket(subject: str) -> dict:
                return {"ticket": subject}

            tools = as_langchain_tools(run, [
                ("crm.read", get_customer),
                ("ticket.create", create_ticket),
            ])
            tools[0].invoke({"customer_id": 1})
            tools[1].invoke({"subject": "broken login"})

            events = at.audit.read_all()
            self.assertEqual(len(events), 2)
            self.assertTrue(all(e["decision"] == "allow" for e in events))


if __name__ == "__main__":
    unittest.main()
