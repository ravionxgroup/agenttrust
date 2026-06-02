"""Run: python examples/demo.py  — exercises allow, deny, and the audit trail."""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agenttrust import AgentTrust, ToolDenied
from agenttrust.policy import Policy

POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "kb.search", "ticket.*"]},
        "billing-agent": {"scopes": ["invoice.read", "payment.read"]},
    },
}

# --- fake tools ---
def get_customer(customer_id): return {"id": customer_id, "name": "Asha"}
def close_ticket(ticket_id): return {"ticket": ticket_id, "status": "closed"}
def refund(amount, api_key=None): return {"refunded": amount}

def main():
    audit_path = "demo_audit.jsonl"
    if os.path.exists(audit_path): os.remove(audit_path)

    at = AgentTrust(policy=Policy.from_dict(POLICY), secret="dev-secret-change-me-32-byte-key", audit_path=audit_path)

    run = at.start_run("support-agent")
    print(f"started run {run.run_id} for support-agent; scopes={run.identity.scopes}")

    print("ALLOWED crm.read ->", run.call("crm.read", get_customer, customer_id=42))
    print("ALLOWED ticket.close ->", run.call("ticket.close", close_ticket, ticket_id=7))

    try:
        run.call("payment.refund", refund, amount=999, api_key="sk-secret")
    except ToolDenied as e:
        print("DENIED payment.refund ->", e)

    # deny-by-default for an unknown agent
    try:
        at.start_run("rogue-agent")
    except Exception as e:
        print("DENIED unknown agent ->", type(e).__name__, str(e))

    print("\n--- audit log ---")
    for ev in at.audit.read_all():
        print(json.dumps({k: ev[k] for k in ("agent_id","tool","required_scope","decision","reason","args_redacted","result_status")}))

if __name__ == "__main__":
    main()
