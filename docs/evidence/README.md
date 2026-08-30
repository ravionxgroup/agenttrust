# Verified Runtime Evidence

This directory records a compact set of verified AgentTrust behaviors. Evidence
is limited to implemented SDK behavior, local demo output, and automated tests.

AgentTrust provides SDK-level enforcement for cooperative code paths routed
through its guarded execution APIs. It does not provide process isolation or
prevent bypass through raw client or tool references. See
[Threat Model & Trust Boundary](../threat-model.md) for the complete boundary.

## Evidence Index

| Scenario | Security property | Evidence type | Verified result | Evidence page |
| --- | --- | --- | --- | --- |
| MCP authorization before execution | Guarded-client authorization | Runtime demo and automated test | `service.read` is allowed and invokes the fake MCP client once; `service.restart` is denied and the fake client invocation count remains zero | [Authorization before execution](authorization-before-execution.md) |
| Credential validation | Fail-closed token validation | Automated tests | Expired, tampered, wrong-secret, and malformed-scope credentials fail closed through `TokenError` or `ToolDenied` paths | [Credential validation](credential-validation.md) |
| Auditability | Allow/deny accountability | Runtime demo and automated tests | Guarded calls emit allow and deny audit records with agent, run, tool, required scope, decision, and result status where applicable | [Auditability](auditability.md) |

## Primary Demo

Run the public-safe MCP evidence demo:

```bash
python3 examples/mcp_authorization_evidence.py
```

The demo uses synthetic agent, tool, and service identifiers. It does not print
JWT values, signing secrets, bearer tokens, raw credentials, or sensitive tool
arguments.

## Screenshot Candidates

Do not create screenshots for this package automatically. If public portfolio
assets are captured later, keep the set small:

- terminal output from `examples/mcp_authorization_evidence.py`
- concise audit output showing one `ALLOW` and one `DENY`
- optional credential-validation test output if it improves the story

Screenshots should not include JWTs, signing secrets, bearer tokens, raw
credentials, shell history, or private local paths.

## Not Claimed

- hard isolation
- gateway or control-plane enforcement
- protection from compromised host processes
- protection from code that bypasses the guarded wrapper
- tamper-evident or immutable audit storage
- token revocation or signing-key rotation
- production-scale authorization service
