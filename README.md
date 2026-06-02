# AgentTrust

Least-privilege identity + audit for AI agents.

Every agent run gets a short-lived, scoped JWT identity. Every tool call is authorized against that identity and written to an append-only audit log — before the tool executes. Unknown agents and out-of-scope calls are denied by default.

> **MVP scope.** This is the *SDK-first* milestone: soft in-process enforcement + local audit. Hard enforcement (a gateway that agent code cannot bypass) and the managed control plane come later. The SDK is a **visibility + least-privilege** layer today — position it that way, not as a hard security boundary.

---

## Install

```bash
pip install agenttrust
```

Optional extras:

```bash
pip install "agenttrust[yaml]"      # Policy.from_yaml()
pip install "agenttrust[langchain]" # LangChain adapter
pip install "agenttrust[mcp]"       # MCP adapter (Python >= 3.10)
pip install "agenttrust[all]"       # Everything except mcp
```

---

## Quickstart (5 minutes)

### 1. Define a policy

```yaml
# policy.yaml
issuer: my-org
default_ttl_seconds: 300
agents:
  support-agent:
    scopes: ["crm.read", "kb.search", "ticket.*"]
  billing-agent:
    scopes: ["invoice.read", "payment.read"]
```

### 2. Wrap your agent's tool calls

```python
from agenttrust import AgentTrust, ToolDenied
from agenttrust.policy import Policy

at = AgentTrust(
    policy=Policy.from_yaml("policy.yaml"),
    secret="your-32-char-secret-key-here!!!",
)

with at.start_run("support-agent") as run:
    result = run.call("crm.read", get_customer, customer_id=42)  # allowed + audited
    run.call("payment.refund", do_refund, amount=500)            # denied + audited
```

That's it. Every call is authorized, every decision is audited.

---

## Usage patterns

### Pattern 1 — direct `run.call()`

```python
with at.start_run("support-agent") as run:
    result = run.call("crm.read", get_customer, customer_id=42)
```

### Pattern 2 — `@run.guarded()` decorator

```python
run = at.start_run("support-agent")

@run.guarded("crm.read")
def get_customer(customer_id: int) -> dict:
    ...

result = get_customer(customer_id=42)   # goes through AgentTrust automatically
```

### Pattern 3 — LangChain tools

```python
from agenttrust.langchain import as_langchain_tools

with at.start_run("support-agent") as run:
    tools = as_langchain_tools(run, [
        ("crm.read",      get_customer),
        ("ticket.create", create_ticket),
    ])
    # pass tools to any LangChain agent or chain
    agent = create_react_agent(llm, tools, prompt)
```

### Pattern 4 — MCP client

```python
from agenttrust.mcp import wrap_mcp_client

with at.start_run("support-agent") as run:
    mcp = wrap_mcp_client(run, session,
                          tool_scopes={"get_customer": "crm.read"})
    result = await mcp.call_tool("get_customer", {"customer_id": 42})
```

MCP tools can also declare their required scope in metadata:

```python
# Tool registered on the MCP server
@server.tool(meta={"agenttrust/scope": "crm.read"})
def get_customer(customer_id: int) -> dict: ...
```

---

## Audit log

Every tool call attempt writes one JSON line to `agenttrust_audit.jsonl`:

```json
{"event_id":"evt_...","ts":1234567890.1,"agent_id":"support-agent","run_id":"run_abc","token_id":"tok_xyz","tool":"get_customer","required_scope":"crm.read","decision":"allow","reason":null,"args_redacted":{"customer_id":42},"result_status":"ok"}
{"event_id":"evt_...","ts":1234567890.2,"agent_id":"support-agent","run_id":"run_abc","token_id":"tok_xyz","tool":"do_refund","required_scope":"payment.refund","decision":"deny","reason":"scope not granted","args_redacted":{"amount":500},"result_status":null}
```

Sensitive argument keys (`password`, `token`, `api_key`, `access_token`, `client_secret`, etc.) are redacted before logging.

### View the audit log

```bash
agenttrust audit                        # all events
agenttrust audit --last 20              # last 20
agenttrust audit --decision deny        # only denials
agenttrust audit --agent support-agent  # filter by agent
agenttrust audit --raw                  # raw JSON
```

---

## File reference

| File | Purpose |
|------|---------|
| `agenttrust/__init__.py` | `AgentTrust`, `AgentRun.call()`, `AgentRun.guarded()` |
| `agenttrust/identity.py` | Token issuance (`Issuer`) and verification (`verify()`) |
| `agenttrust/policy.py`   | Declarative per-agent scope allow-lists, deny-by-default |
| `agenttrust/audit.py`    | Audit event schema, JSONL sink, argument redaction |
| `agenttrust/mcp.py`      | MCP client/session adapter |
| `agenttrust/langchain.py`| LangChain `StructuredTool` adapter |
| `agenttrust/cli.py`      | `agenttrust audit` CLI viewer |
| `examples/demo.py`       | End-to-end allow/deny/audit walkthrough |
| `examples/mcp_demo.py`   | MCP adapter with fake client |
| `examples/mcp_real_smoke.py` | MCP adapter with real `mcp` SDK |
| `examples/langchain_demo.py` | All three usage patterns with LangChain |
| `policy.example.yaml`    | Example policy file |

---

## Design notes

- **Per-run identity, not per-agent.** Each invocation gets its own token + `run_id`, so the audit trail and blast radius are scoped to a single run.
- **Deny-by-default.** Unknown agents get no scopes. Bad tokens fail closed. Missing scope mappings raise before the tool runs.
- **Soft enforcement today.** The SDK guards cooperative first-party code. Hard enforcement (so non-cooperative code cannot bypass) requires the gateway (post-validation roadmap).
- **MVP signing is HMAC (HS256).** Production path: swap to asymmetric RS256/EdDSA so verifiers never hold the signing key — the token schema is unchanged.
- **Redaction is a known floor.** Key-name-based redaction covers common secrets (`password`, `token`, `api_key`, `access_token`, `client_secret`, `private_key`, `credentials`, and more). Free-text PII redaction is hard and a deliberate later investment.

---

## Security notes

- Use a secret of at least 32 random characters in production. Rotate it like any signing key.
- Short TTLs (the default is 5 minutes) limit blast radius if a token is leaked mid-run.
- The local JSONL audit file is append-only by convention, not by enforcement. Tamper-evident storage (Postgres + write-only credentials, or an immutable log service) is on the gateway roadmap.
