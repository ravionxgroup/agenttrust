# AgentTrust — Design Partner Onboarding

You should be up and running in under an afternoon. This guide walks through the integration from zero to a working audit trail in four steps.

---

## What you're getting

- **Per-run identity**: each agent invocation gets a short-lived, scoped JWT — so the audit trail is run-scoped, not just agent-scoped
- **Deny-by-default policy**: unknown agents and out-of-scope tool calls are blocked before the tool runs
- **Append-only audit log**: every call attempt — allowed or denied — is written to a local JSONL file with redacted arguments
- **Soft enforcement**: the SDK guards cooperative code in-process; hard enforcement (a gateway) is the next milestone

---

## Step 1 — Install

```bash
git clone https://github.com/ravionxgroup/agenttrust.git
cd agenttrust
python -m pip install --upgrade pip
python -m pip install -e .

# If you load policy from YAML:
python -m pip install -e ".[yaml]"

# If you use LangChain:
python -m pip install -e ".[langchain]"

# If you use MCP (requires Python >= 3.10):
python -m pip install -e ".[mcp]"
```

---

## Step 2 — Write a policy file

Create `policy.yaml` at your project root. List each agent and the tool scopes it is allowed to call. Unknown agents are denied by default — you don't need an explicit deny rule.

```yaml
issuer: your-org-name
default_ttl_seconds: 300      # token lifetime per run (5 min default)

agents:
  support-agent:
    scopes:
      - crm.read
      - kb.search
      - ticket.*              # glob: ticket.create, ticket.close, etc.

  billing-agent:
    scopes:
      - invoice.read
      - payment.read          # read-only: no payment.write or payment.refund
    ttl_seconds: 180          # shorter window for finance-adjacent agent
```

**Scope naming convention:** `domain.action` — keep it consistent across your codebase. The audit log and policy both use these names.

---

## Step 3 — Wrap your agent

Pick whichever pattern fits your code style.

### Option A — context manager (recommended for new code)

```python
from agenttrust import AgentTrust, ToolDenied
from agenttrust.policy import Policy

at = AgentTrust(
    policy=Policy.from_yaml("policy.yaml"),
    secret="your-32-char-secret-change-in-prod",
)

with at.start_run("support-agent") as run:
    customer = run.call("crm.read", get_customer, customer_id=42)
    ticket   = run.call("ticket.create", create_ticket, subject="Login issue")

    try:
        run.call("payment.refund", do_refund, amount=500)
    except ToolDenied as e:
        print("blocked:", e)   # logged + audited automatically
```

### Option B — `@run.guarded()` decorator (good for existing codebases)

```python
run = at.start_run("support-agent")

@run.guarded("crm.read")
def get_customer(customer_id: int) -> dict:
    ...   # your existing implementation, unchanged

# Now every call is authorized + audited automatically
customer = get_customer(customer_id=42)
```

### Option C — LangChain

```python
from agenttrust.langchain import as_langchain_tools

with at.start_run("support-agent") as run:
    tools = as_langchain_tools(run, [
        ("crm.read",      get_customer),
        ("ticket.create", create_ticket),
    ])
    agent = create_react_agent(llm, tools, prompt)
    agent.invoke({"input": "Help the user with their login issue"})
```

### Option D — MCP

```python
from agenttrust.mcp import wrap_mcp_client

with at.start_run("support-agent") as run:
    mcp = wrap_mcp_client(run, session, default_to_tool_name=False)
    await mcp.load_tool_scopes()    # discovers scopes from tool metadata
    result = await mcp.call_tool("get_customer", {"customer_id": 42})
```

Declare scopes on the server side:

```python
@server.tool(meta={"agenttrust/scope": "crm.read"})
def get_customer(customer_id: int) -> dict: ...
```

---

## Step 4 — Check the audit log

```bash
agenttrust audit                         # all events
agenttrust audit --decision deny         # see what's being blocked
agenttrust audit --agent support-agent   # one agent's activity
agenttrust audit --last 50               # recent events
```

Example output:

```
[2025-01-15 14:23:01]  ALLOW  agent=support-agent  run=run_abc123  tool=get_customer  scope=crm.read  status=ok
[2025-01-15 14:23:02]  ALLOW  agent=support-agent  run=run_abc123  tool=create_ticket  scope=ticket.create  status=ok
[2025-01-15 14:23:03]  DENY   agent=support-agent  run=run_abc123  tool=do_refund  scope=payment.refund
  reason: scope not granted
```

The audit file is `agenttrust_audit.jsonl` in your working directory by default. Specify a custom path:

```python
at = AgentTrust(policy=..., secret=..., audit_path="/var/log/agenttrust.jsonl")
```

---

## Configuration reference

| Policy field | Type | Default | Description |
|---|---|---|---|
| `issuer` | string | `agenttrust-local` | Identifies who minted the tokens |
| `default_ttl_seconds` | int (> 0) | `300` | Token lifetime for all agents |
| `agents.<id>.scopes` | list of strings | required | Tool scopes the agent may call (glob patterns) |
| `agents.<id>.ttl_seconds` | int (> 0) | (uses default) | Per-agent TTL override |

| `AgentTrust` constructor arg | Default | Description |
|---|---|---|
| `policy` | required | `Policy` object |
| `secret` | required | HMAC signing secret (min 32 chars) |
| `audit_path` | `agenttrust_audit.jsonl` | Where to write audit events |

---

## What to watch for

**In the first session:**
- Run `agenttrust audit --decision deny` after a few minutes — denials tell you which tool calls are happening outside declared scopes
- If you see unexpected denials on calls that should be allowed, check the scope name in your policy matches exactly what's passed to `run.call()`

**Common mistakes:**
- `secret` shorter than 32 chars → `ValueError` at startup (intentional)
- `ttl_seconds: 0` in policy → `PolicyError` at load time (intentional)
- Calling `run.call("", fn)` → `ValueError` (catch this at the call site)
- Using `run.call()` with an async function → `TypeError` (use `run.acall()` instead)

---

## Getting help

Open an issue: https://github.com/ravionxgroup/agenttrust/issues

We'd love to hear what you find. See [feedback.md](feedback.md) for the structured feedback questions that help us most.
