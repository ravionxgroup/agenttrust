# Authorization Before Execution

## Evidence Type

Runtime demo evidence plus automated test coverage.

Primary demo:

```bash
python3 examples/mcp_authorization_evidence.py
```

Supporting test:

- `tests/test_mcp.py::GuardedMCPClientTest::test_allowed_then_denied_mcp_call_preserves_deny_before_execute_evidence`

## Verified Scenario

The demo creates a synthetic `ops-reader` agent run with a policy that grants
only `service.read`.

Allowed path:

```text
ops-reader run
  -> service.read
  -> ALLOW
  -> underlying fake MCP client invocation count for service.read is 1
```

Denied path:

```text
same ops-reader run
  -> service.restart
  -> DENY
  -> ToolDenied
  -> underlying fake MCP client invocation count for service.restart remains 0
```

## Engineering Claim

Authorization occurs before execution for calls routed through the guarded
AgentTrust MCP wrapper.

## What The Demo Shows

The runtime output is intentionally concise and capture-friendly. It shows:

- synthetic agent ID: `ops-reader`
- synthetic run ID
- allowed tool: `service.read`
- denied tool: `service.restart`
- required scopes for both tools
- `ToolDenied` observed for the denied tool
- allowed invocation count: `1`
- denied invocation count: `0`
- one `ALLOW` audit record
- one `DENY` audit record

## Why Deny-Before-Execute Is Verified

The fake MCP client increments an invocation count only inside its underlying
`call_tool` method. The denied `service.restart` call reports invocation count
`0`, and the focused test asserts the underlying client call list contains only
the allowed `service.read` call.

## Limitation

This is SDK-level guarded-client enforcement. It can be bypassed by code that
holds direct access to the raw MCP client, raw MCP session, or underlying tool
function. It is not gateway enforcement and does not imply process isolation.
