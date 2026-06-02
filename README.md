# AgentTrust SDK (MVP skeleton)

Least-privilege identity + audit for AI agents. Give every agent its own
short-lived, scoped identity, enforce what tools it may call, and get a
complete audit trail of what each agent did.

> **MVP scope.** This is the *SDK-first* milestone: soft enforcement in-process,
> local audit. Hard enforcement (a gateway that agent code can't bypass) and the
> managed/paid control plane come later. The SDK is a **visibility + least-privilege**
> layer today — position it that way, not as a hard security boundary.

## Install
```
pip install -r requirements.txt   # PyJWT (+ PyYAML if loading policy from file)
```

## Quickstart
```python
from agenttrust import AgentTrust, ToolDenied
from agenttrust.policy import Policy

at = AgentTrust(policy=Policy.from_yaml("policy.example.yaml"),
                secret="dev-secret-change-me-32-byte-key")

run = at.start_run("support-agent")          # mints a short-lived, scoped per-run identity

run.call("crm.read", get_customer, customer_id=42)    # allowed -> runs + audited
run.call("payment.refund", do_refund, amount=999)     # not in scope -> raises ToolDenied + audited
```
Run the demo: `python3 examples/demo.py`

## MCP adapter
Week 3 adds a small adapter for MCP clients/sessions that expose
`call_tool(name, arguments=...)`. It keeps MCP-specific churn out of the core
SDK while routing tool calls through `AgentRun.acall()` for authorization and
audit.

```python
from agenttrust.mcp import wrap_mcp_client

run = at.start_run("support-agent")

# If the MCP tool name is already a scope like "crm.read", no mapping is needed.
# For other names, map MCP tool name -> AgentTrust domain.action scope.
mcp = wrap_mcp_client(run, session,
                      tool_scopes={"get_customer": "crm.read"},
                      default_to_tool_name=False)

result = await mcp.call_tool("get_customer", {"customer_id": 42})
```

MCP tools can also declare a scope in metadata:

```python
{"name": "get_customer", "_meta": {"agenttrust/scope": "crm.read"}}
```

Run the MCP adapter demo: `python3 examples/mcp_demo.py`

## What's here
| File | Purpose |
|------|---------|
| `agenttrust/identity.py` | Token schema, `Issuer` (mint), `verify()` (check sig/expiry/scope) |
| `agenttrust/policy.py`   | Declarative per-agent allow-list policy, deny-by-default |
| `agenttrust/audit.py`    | Audit event schema, append-only JSONL sink, arg redaction |
| `agenttrust/__init__.py` | `AgentTrust` + `AgentRun.call()` — the developer-facing wedge |
| `agenttrust/mcp.py`      | MCP client/session adapter: scope mapping + guarded `call_tool()` |
| `examples/demo.py`       | End-to-end: allow, deny, deny-by-default, audit |
| `examples/mcp_demo.py`   | MCP-style allow/deny/audit flow using a fake async MCP client |

## Design choices (and where to invest next)
- **Per-run identity**, not just per-agent: each invocation gets its own token + run_id so the audit trail and blast-radius are run-scoped.
- **Deny-by-default**: unknown agents get *no* scopes; bad tokens fail closed.
- **MVP signing is HMAC (HS256)**. Move to asymmetric (RS256/EdDSA) so verifiers (the gateway) never hold the signing key — the token *schema* is unchanged.
- **Redaction is the known soft spot.** `redact_args` is a conservative floor (key-name based). Real redaction of free-text/PII args is genuinely hard and a deliberate place to invest later.
- **Next step is the gateway**: move `verify()` + policy enforcement out-of-process so non-cooperative code can't bypass it, and centralize audit in Postgres.
