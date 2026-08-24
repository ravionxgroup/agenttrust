# AgentTrust — Evaluation Feedback

Thank you for evaluating AgentTrust. Your feedback directly shapes what gets built next.

This takes about 15 minutes. Answer only the questions that apply — partial responses are still useful.

---

## About your setup

1. **Which integration pattern(s) did you use?**
   - [ ] `run.call()` directly
   - [ ] `@run.guarded()` decorator
   - [ ] LangChain (`as_langchain_tools`)
   - [ ] MCP (`wrap_mcp_client`)
   - [ ] Other: ___

2. **Which agent framework are you using?** (LangChain, CrewAI, LlamaIndex, custom, other)

3. **How many agents did you wrap?** (rough number is fine)

4. **How long did integration take?** (from source install to first audit event in the log)

---

## The core value question

5. **Did the audit log show you something you didn't already know about your agent's behavior?**
   - [ ] Yes — describe what: ___
   - [ ] No — we already had visibility
   - [ ] Haven't looked yet

6. **Did any calls get denied that you expected to be allowed?** If yes, what was confusing about the policy or scope naming?

7. **Did any calls get allowed that surprised you?** (i.e., you expected them to be denied)

---

## Adoption friction

8. **What was the hardest part of the integration?**

9. **What would have made the first 10 minutes faster?**

10. **Was the policy file format clear? What would you change?**

11. **Were there tool calls you couldn't wrap because of technical constraints?** (async, streaming, framework-specific, etc.)

---

## The key assumption we're testing

> "Teams will adopt a new identity layer at all."

12. **Would you keep AgentTrust running in production?**
    - [ ] Yes, as-is
    - [ ] Yes, but only if ___ (describe the blocker)
    - [ ] No — we have this covered with: ___
    - [ ] Not sure yet

13. **What would push you from "interesting" to "must-have"?**
    Common answers include hard enforcement, centralized audit search, SIEM export, team dashboards, and anomaly alerts. What's yours?

14. **Who else on your team needs to care about this?** (security, compliance, platform engineering, etc.)
    Would they have different requirements?

---

## Hard enforcement

The next major milestone is a gateway that enforces policies out-of-process, so agent code cannot bypass it.

15. **Is in-process SDK-level enforcement enough for your use case today?**
    - [ ] Yes, cooperative agents are fine for now
    - [ ] No, we need hard enforcement — here's why: ___

16. **Would you run a sidecar or proxy alongside your agents?**
    - [ ] Yes
    - [ ] Only if it's zero-config / minimal ops
    - [ ] No — describe the constraint: ___

---

## Anything else

17. **What's the one thing we should build next?**

18. **Any other feedback, bugs, or suggestions?**

---

Open an issue: https://github.com/ravionxgroup/agenttrust/issues
