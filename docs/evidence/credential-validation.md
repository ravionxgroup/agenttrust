# Credential Validation

## Evidence Type

Automated test evidence only. No separate runtime demo is claimed for this
scenario.

Relevant tests:

- `tests/test_hardening.py::TokenExpiryTest::test_expired_identity_mid_run_raises_tool_denied_and_audits`
- `tests/test_hardening.py::ClockSkewTest::test_expired_token_fails_without_leeway`
- `tests/test_hardening.py::ClockSkewTest::test_tampered_token_fails_closed`
- `tests/test_hardening.py::ClockSkewTest::test_wrong_secret_fails_closed`
- `tests/test_hardening.py::ClockSkewTest::test_scp_with_non_string_entries_fails_closed`

## Verified Behavior

Automated tests verify:

- an expired in-process run identity is denied before guarded tool execution
- an expired serialized JWT fails verification
- a tampered serialized JWT fails verification
- a token verified with the wrong signing secret fails verification
- a token with a malformed `scp` claim fails verification

## Engineering Claim

Credential validation fails closed for the covered expired, tampered,
wrong-secret, and malformed-scope cases.

## Boundary

JWT verification exists through `agenttrust.identity.verify()`. Current
`AgentRun` tool execution uses the already-established in-process
`AgentIdentity` created during `AgentTrust.start_run()` and checks expiration
before guarded tool execution. It does not re-verify a serialized JWT on every
tool call and does not imply a remote enforcement service.

## Limitation

This evidence does not claim token revocation, key rotation, asymmetric signing,
remote introspection, or protection if the signing secret is leaked.
