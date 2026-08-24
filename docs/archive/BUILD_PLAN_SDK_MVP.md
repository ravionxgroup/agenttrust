# AgentTrust — SDK-First Milestone: Week-by-Week Build Plan

**Goal:** Ship a design-partner-ready Python SDK that gives each agent a short-lived, scoped identity, enforces tool scopes (soft, in-process), and produces a complete local audit trail — integrated with MCP and one agent framework. No gateway yet; that follows once design partners pull for hard enforcement.

**Assumptions:** one experienced engineer, full-time. Part-time → multiply by ~2–3×. Target: ~6 weeks to a usable, documented SDK design partners can run.

**Definition of done:** a developer can `pip install`, point at a policy file, wrap their agent's tool calls, and within an afternoon answer "what did each agent do, and what is it allowed to do?" — with denied calls blocked and everything audited.

---

## Week 1 — Identity & policy core
- Token schema + `Issuer` (short-lived scoped JWTs, per-run ids) and `verify()` (sig, expiry, scope), fail-closed. *(skeleton already provided)*
- Declarative policy schema + loader; deny-by-default for unknown agents.
- Unit tests: issue/verify, expiry, tampered token, scope glob matching, unknown-agent deny.
- **Exit:** tokens mint and verify correctly; policy denies by default. *(The provided skeleton already passes these.)*

## Week 2 — SDK call-guard + audit
- `AgentTrust` + `AgentRun.call()`: authorize → audit → execute, fail-closed on deny.
- Audit event schema + append-only JSONL sink; argument redaction (conservative floor).
- Tests: allowed call runs + audits "ok"; denied call raises + audits "deny"; error path audits "error"; secrets redacted.
- **Exit:** end-to-end allow/deny/audit works (the `examples/demo.py` flow).

## Week 3 — MCP integration
- Wrap an MCP tool/client so calls route through `run.call()` with the right required-scope mapping.
- Decide the scope-naming convention (e.g. `domain.action`) and how tools declare the scope they need.
- Handle MCP's evolving surface defensively (isolate the integration behind an adapter so spec churn doesn't ripple into core).
- **Exit:** an MCP-based agent runs end-to-end through AgentTrust with scoping + audit.
- **Current status:** implemented as `agenttrust.mcp.GuardedMCPClient`, with explicit tool-name -> scope maps, optional `agenttrust/scope` tool metadata discovery, `examples/mcp_demo.py`, and focused unit tests.
- **Remaining validation:** run a smoke test against the official MCP Python SDK on a compatible Python/MCP environment.

## Week 4 — One agent-framework integration + ergonomics
- Integrate with one popular framework (e.g. a LangChain/CrewAI-style tool wrapper) so adoption is a few lines.
- Developer ergonomics: decorator or context-manager form (`@guarded("crm.read")` / `with run:`), sensible errors, minimal config.
- Tests against the framework's tool-calling path.
- **Exit:** "wrap your agent in <10 lines" is real for one framework.

## Week 5 — Hardening + correctness pass
- Security-correctness review of the critical paths: token scoping, fail-closed everywhere, redaction coverage, clock-skew handling, secret handling.
- Edge cases: expired token mid-run, missing/oversized args, concurrent runs, malformed policy.
- Optional: switch signing to asymmetric (RS256/EdDSA) to prep for the gateway.
- **Exit:** no happy-path-only gaps on security-critical code; tests cover failure modes.

## Week 6 — Docs, packaging, design-partner kit
- `pip` packaging, versioning, README, quickstart, and a 5-minute integration guide (the adoption deliverable — not optional).
- A tiny local audit viewer is *optional* here (CLI `tail`/pretty-print is enough for the MVP).
- Design-partner onboarding doc + a short feedback script tied to the riskiest assumption (will they adopt vs. just rotate keys?).
- **Exit:** a design partner can self-serve install, integrate in an afternoon, and you can collect structured feedback.

---

## Explicitly deferred (do NOT build in this milestone)
Gateway / hard out-of-process enforcement · sidecar · blast-radius graph · managed/HA hosting · long/tamper-evident audit + search · SSO/RBAC · threat detection · anything PKI/cert-lifecycle (integrate, don't rebuild). These are post-validation and/or paid-plane.

## Sequencing logic
Identity+policy (the trust core) → SDK guard+audit (the value loop) → MCP (the standard surface) → framework (adoption) → hardening (because you're in the trust path) → docs (because it's a developer-adoption product). Validation of the *real* question — do teams adopt a new identity layer at all — happens in week 6 with design partners, before you invest in the heavier gateway.

## Honest risk notes
- **Redaction** and **MCP churn** are the two areas most likely to overrun — budget slack there.
- **Solo + trust path**: get a second pair of eyes on the security-critical code (token scoping, fail-closed) even if the rest is solo.
- **Part-time reality**: this is ~6 full-time weeks; on nights/weekends plan for ~3–4 months.
