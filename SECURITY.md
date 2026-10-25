# Security Policy

AgentTrust is a local MVP with cooperative SDK guards, explicit Gateway-backed
execution, and local JSONL audit. See [MVP boundaries](docs/mvp-overview.md).

Please do not report security issues through public issues. Email the maintainer listed in the GitHub organization profile or use GitHub's private vulnerability reporting if enabled for this repository.

## Current Boundary

- Cooperative first-party code can use the SDK to authorize and audit tool calls.
- Non-cooperative or adversarial code can bypass in-process SDK guards.
- Gateway mode authenticates and authorizes independently; protection from direct tool bypass depends on verified deployment isolation.
- Local SDK tokens use HS256; Gateway mode accepts externally issued Ed25519 JWTs without an SDK signing key.
- The demonstrated Docker boundary trusts the host and Docker administrator; the Console must stay loopback-bound or otherwise access-controlled.
- Managed issuance, rotation, JWKS and revocation are not implemented.
- Local JSONL audit is append-only by convention, not tamper-proof storage.
- Key-name based redaction is not comprehensive PII detection.
