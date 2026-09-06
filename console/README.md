# AgentTrust Console

Read-only visibility for local AgentTrust audit data and declared policy configuration.

## Run

```bash
npm install
npm run dev
```

By default, the Console uses demo audit and policy fixtures so it can run immediately.

To use a real local AgentTrust audit file:

```bash
AGENTTRUST_AUDIT_PATH=../agenttrust_audit.jsonl npm run dev
```

To use a real local AgentTrust policy file:

```bash
AGENTTRUST_POLICY_PATH=../policy.example.yaml npm run dev
```

To use both:

```bash
AGENTTRUST_AUDIT_PATH=../agenttrust_audit.jsonl \
AGENTTRUST_POLICY_PATH=../policy.example.yaml \
npm run dev
```

## Scope

The Console is a frontend/read-only visibility layer. It does not change AgentTrust SDK authorization, identity, policy, audit, MCP, or LangChain behavior.

Agents, runs, tools, and audit views are derived from observed audit activity. Policy is declared configuration loaded separately.

Run timing uses first observed and last observed audit events. The current SDK does not emit explicit run lifecycle records.

AgentTrust SDK enforcement remains in-process. The Console does not create a stronger security boundary, gateway, control plane, authentication layer, or policy editing surface.

Audit data may contain sensitive operational context even after SDK redaction. Redaction is key-based, not full sensitive-data detection. Do not expose a local Console instance publicly without appropriate protections.
