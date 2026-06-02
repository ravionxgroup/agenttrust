"""
Week 4 demo — LangChain integration + ergonomics.

Shows all three usage patterns:
  1. context-manager run lifecycle  (with at.start_run(...) as run:)
  2. @run.guarded("scope") decorator
  3. as_langchain_tool / as_langchain_tools

Run: .venv/bin/python examples/langchain_demo.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agenttrust import AgentTrust, ToolDenied
from agenttrust.langchain import as_langchain_tool, as_langchain_tools
from agenttrust.policy import Policy


POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "ticket.*"]},
    },
}

# ---------------------------------------------------------------------------
# Pretend business functions (what the agent would actually call)
# ---------------------------------------------------------------------------

def get_customer(customer_id: int) -> dict:
    """Return a customer record by ID."""
    return {"id": customer_id, "name": "Asha", "plan": "pro"}


def create_ticket(subject: str, priority: str = "normal") -> dict:
    """Open a new support ticket."""
    return {"ticket_id": 1001, "subject": subject, "priority": priority}


def do_refund(amount: float, api_key: str = "") -> dict:
    """Issue a payment refund."""
    return {"refunded": amount}


def main():
    audit_path = "demo_langchain_audit.jsonl"
    if os.path.exists(audit_path):
        os.remove(audit_path)

    at = AgentTrust(
        policy=Policy.from_dict(POLICY),
        secret="dev-secret-change-me-32-byte-key",
        audit_path=audit_path,
    )

    # ------------------------------------------------------------------
    # Pattern 1: context-manager run lifecycle
    # ------------------------------------------------------------------
    print("=== Pattern 1: context-manager ===")
    with at.start_run("support-agent") as run:
        result = run.call("crm.read", get_customer, customer_id=42)
        print("run.call crm.read ->", result)

        try:
            run.call("payment.refund", do_refund, amount=500)
        except ToolDenied as e:
            print("run.call payment.refund DENIED ->", e)

    # ------------------------------------------------------------------
    # Pattern 2: @run.guarded() decorator
    # ------------------------------------------------------------------
    print("\n=== Pattern 2: @run.guarded() decorator ===")
    run = at.start_run("support-agent")

    @run.guarded("crm.read")
    def fetch_customer(customer_id: int) -> dict:
        return get_customer(customer_id)

    @run.guarded("ticket.create")
    def open_ticket(subject: str, priority: str = "normal") -> dict:
        return create_ticket(subject, priority)

    print("fetch_customer ->", fetch_customer(customer_id=7))
    print("open_ticket ->", open_ticket(subject="Login broken", priority="high"))

    # ------------------------------------------------------------------
    # Pattern 3: LangChain StructuredTools (simulating agent tool calls)
    # ------------------------------------------------------------------
    print("\n=== Pattern 3: LangChain tools ===")
    with at.start_run("support-agent") as run:
        tools = as_langchain_tools(run, [
            ("crm.read",     get_customer),
            ("ticket.create", create_ticket),
            ("payment.refund", do_refund),
        ])

        # Simulate what a LangChain agent would do when the LLM picks a tool
        print("tool names:", [t.name for t in tools])
        print("tool schemas:", {t.name: list(t.args) for t in tools})

        print("invoke get_customer ->", tools[0].invoke({"customer_id": 99}))
        print("invoke create_ticket ->", tools[1].invoke({"subject": "API down"}))

        try:
            tools[2].invoke({"amount": 999, "api_key": "sk-secret"})
        except ToolDenied as e:
            print("invoke do_refund DENIED ->", e)

    # ------------------------------------------------------------------
    # Audit log
    # ------------------------------------------------------------------
    print("\n=== audit log ===")
    for ev in at.audit.read_all():
        print(json.dumps({
            k: ev[k]
            for k in ("agent_id", "tool", "required_scope", "decision",
                      "reason", "args_redacted", "result_status")
        }))


if __name__ == "__main__":
    main()
