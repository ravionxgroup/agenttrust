import os
import tempfile
import unittest

from agenttrust import AgentTrust, AgentRun, ToolDenied
from agenttrust.policy import Policy


POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "ticket.*"]},
    },
}


def make_at_and_run(audit_path):
    at = AgentTrust(
        policy=Policy.from_dict(POLICY),
        secret="dev-secret-change-me-32-byte-key",
        audit_path=audit_path,
    )
    return at, at.start_run("support-agent")


class ContextManagerTest(unittest.TestCase):
    def test_start_run_usable_as_context_manager(self):
        with tempfile.TemporaryDirectory() as tmp:
            at, _ = make_at_and_run(os.path.join(tmp, "audit.jsonl"))
            with at.start_run("support-agent") as run:
                self.assertIsInstance(run, AgentRun)

    def test_context_manager_returns_functional_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, _ = make_at_and_run(audit_path)

            with at.start_run("support-agent") as run:
                result = run.call("crm.read", lambda: "ok")

            self.assertEqual(result, "ok")
            events = at.audit.read_all()
            self.assertEqual(events[0]["decision"], "allow")

    def test_context_manager_does_not_suppress_exceptions(self):
        with tempfile.TemporaryDirectory() as tmp:
            at, _ = make_at_and_run(os.path.join(tmp, "audit.jsonl"))
            with self.assertRaises(ToolDenied):
                with at.start_run("support-agent") as run:
                    run.call("payment.refund", lambda: None)


class GuardedDecoratorTest(unittest.TestCase):
    def test_decorator_allows_in_scope_call_and_audits(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_at_and_run(audit_path)

            @run.guarded("crm.read")
            def get_customer(customer_id: int) -> dict:
                return {"id": customer_id}

            result = get_customer(customer_id=42)

            self.assertEqual(result, {"id": 42})
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "allow")
            self.assertEqual(events[0]["tool"], "get_customer")
            self.assertEqual(events[0]["required_scope"], "crm.read")

    def test_decorator_denies_out_of_scope_call_and_audits(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_at_and_run(audit_path)

            @run.guarded("payment.refund")
            def do_refund(amount: float) -> dict:
                return {"refunded": amount}

            with self.assertRaises(ToolDenied):
                do_refund(amount=999)

            events = at.audit.read_all()
            self.assertEqual(events[0]["decision"], "deny")
            self.assertEqual(events[0]["tool"], "do_refund")

    def test_decorator_preserves_function_name_and_annotations(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, run = make_at_and_run(os.path.join(tmp, "audit.jsonl"))

            @run.guarded("crm.read")
            def get_customer(customer_id: int) -> dict:
                """Fetch a customer by ID."""
                return {}

            self.assertEqual(get_customer.__name__, "get_customer")
            self.assertEqual(get_customer.__doc__, "Fetch a customer by ID.")
            self.assertEqual(get_customer.__annotations__, {"customer_id": int, "return": dict})

    def test_decorator_works_on_async_function(self):
        import asyncio

        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_at_and_run(audit_path)

            @run.guarded("crm.read")
            async def async_get_customer(customer_id: int) -> dict:
                return {"id": customer_id}

            result = asyncio.run(async_get_customer(customer_id=7))

            self.assertEqual(result, {"id": 7})
            self.assertEqual(at.audit.read_all()[0]["decision"], "allow")

    def test_decorator_glob_scope_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at, run = make_at_and_run(audit_path)

            @run.guarded("ticket.close")
            def close_ticket(ticket_id: int) -> bool:
                return True

            result = close_ticket(ticket_id=1)
            self.assertTrue(result)
            self.assertEqual(at.audit.read_all()[0]["decision"], "allow")


if __name__ == "__main__":
    unittest.main()
