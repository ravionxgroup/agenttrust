# Auditability

## Evidence Type

Runtime demo evidence plus automated test coverage.

Primary demo:

```bash
python3 examples/mcp_authorization_evidence.py
```

Supporting tests include MCP, LangChain, ergonomics, and hardening tests that
assert allow, deny, error, redaction, and concurrent-write audit behavior.

## Verified Audit Trail

The MCP authorization evidence demo produces:

- one `ALLOW` audit record for `service.read`
- one `DENY` audit record for `service.restart`

The displayed audit fields include:

- agent ID
- run ID
- tool
- required scope
- decision
- result status where applicable

## Engineering Claim

Guarded AgentTrust execution paths produce local audit records for allowed and
denied tool-call attempts.

## Audit Model

The current audit sink writes JSON lines to a local file. Audit events include
agent/run/tool/scope correlation, decision, reason where applicable, redacted
arguments, timestamp, generated event ID, and result status for executed calls.

This is local audit logging with local JSONL persistence for normal cooperative
execution.

## Security Boundary

Audit logging is not tamper-evident audit storage and is not immutable audit
storage. A host process or user with filesystem access can alter, truncate, or
delete the local audit file.

Argument redaction is key-name based and truncates long strings. It helps avoid
obvious credential leakage but is not comprehensive PII or secret detection.

## Limitation

This evidence does not claim centralized audit storage, SIEM integration,
cryptographic audit integrity, non-repudiation, or audit durability against a
compromised host.
