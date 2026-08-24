# Security Policy

AgentTrust is currently an SDK-first MVP with soft in-process enforcement and local JSONL audit.

Please do not report security issues through public issues. Email the maintainer listed in the GitHub organization profile or use GitHub's private vulnerability reporting if enabled for this repository.

## Current Boundary

- Cooperative first-party code can use the SDK to authorize and audit tool calls.
- Non-cooperative or adversarial code can bypass in-process SDK guards.
- Hard enforcement requires the future gateway.
- HS256 shared-secret signing is the MVP strategy; asymmetric signing is future work.
- Local JSONL audit is append-only by convention, not tamper-proof storage.
- Key-name based redaction is not comprehensive PII detection.
