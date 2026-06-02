"""
Week 5 hardening tests — edge cases, security-correctness, and failure modes
across the critical paths: token scoping, fail-closed, redaction, clock-skew,
and policy validation.
"""
import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import jwt as pyjwt

from agenttrust import AgentTrust, ToolDenied
from agenttrust.audit import redact_args, AuditSink, AuditEvent
from agenttrust.identity import Issuer, verify, TokenError
from agenttrust.policy import Policy, PolicyError


SECRET = "dev-secret-change-me-32-byte-key"

POLICY = {
    "issuer": "agenttrust-local",
    "default_ttl_seconds": 300,
    "agents": {
        "support-agent": {"scopes": ["crm.read", "ticket.*"]},
    },
}


def make_at(audit_path):
    return AgentTrust(
        policy=Policy.from_dict(POLICY),
        secret=SECRET,
        audit_path=audit_path,
    )


# ---------------------------------------------------------------------------
# Identity / token edge cases
# ---------------------------------------------------------------------------

class TokenExpiryTest(unittest.TestCase):
    def test_expired_identity_mid_run_raises_tool_denied_and_audits(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at = make_at(audit_path)
            run = at.start_run("support-agent")

            # Simulate time advancing past token expiry
            with patch("agenttrust.time.time", return_value=run.identity.expires_at + 1):
                with self.assertRaises(ToolDenied) as ctx:
                    run.call("crm.read", lambda: None)

            self.assertIn("expired", str(ctx.exception))
            events = at.audit.read_all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["decision"], "deny")
            self.assertEqual(events[0]["reason"], "identity expired")

    def test_call_succeeds_just_before_expiry(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at = make_at(audit_path)
            run = at.start_run("support-agent")

            with patch("agenttrust.time.time", return_value=run.identity.expires_at - 1):
                result = run.call("crm.read", lambda: "ok")

            self.assertEqual(result, "ok")

    def test_zero_ttl_raises_on_issue(self):
        issuer = Issuer(secret=SECRET)
        with self.assertRaises(ValueError):
            issuer.issue(agent_id="x", scopes=["crm.read"], ttl_seconds=0)

    def test_negative_ttl_raises_on_issue(self):
        issuer = Issuer(secret=SECRET)
        with self.assertRaises(ValueError):
            issuer.issue(agent_id="x", scopes=["crm.read"], ttl_seconds=-1)


class ClockSkewTest(unittest.TestCase):
    def _expired_token(self):
        issuer = Issuer(secret=SECRET)
        token, _ = issuer.issue(agent_id="x", scopes=["crm.read"], ttl_seconds=1)
        # Advance time so the token looks expired
        with patch("agenttrust.identity.time.time", return_value=time.time() + 10):
            pass  # token already encoded; we verify with real time
        return token

    def test_expired_token_fails_without_leeway(self):
        issuer = Issuer(secret=SECRET)
        token, _ = issuer.issue(agent_id="x", scopes=["crm.read"], ttl_seconds=1)
        # Pretend we're 5 seconds in the future during verify
        future = int(time.time()) + 10
        with patch("agenttrust.identity.time.time", return_value=float(future)):
            # PyJWT uses real wall-clock for expiry check, not our patched time.
            # So we must create a token that is genuinely expired by encoding past exp.
            pass

        # Create a token with exp already in the past by encoding manually
        payload = {
            "sub": "x", "run": "r1", "scp": ["crm.read"],
            "iss": "agenttrust-local",
            "iat": int(time.time()) - 20,
            "exp": int(time.time()) - 10,   # already expired
            "jti": "tok_test",
        }
        expired_token = pyjwt.encode(payload, SECRET, algorithm="HS256")

        with self.assertRaises(TokenError) as ctx:
            verify(expired_token, SECRET)
        self.assertIn("expired", str(ctx.exception))

    def test_expired_token_passes_with_sufficient_leeway(self):
        payload = {
            "sub": "x", "run": "r1", "scp": ["crm.read"],
            "iss": "agenttrust-local",
            "iat": int(time.time()) - 20,
            "exp": int(time.time()) - 5,   # expired 5s ago
            "jti": "tok_test",
        }
        token = pyjwt.encode(payload, SECRET, algorithm="HS256")

        # leeway=10 should absorb the 5-second gap
        identity = verify(token, SECRET, leeway=10)
        self.assertEqual(identity.agent_id, "x")

    def test_tampered_token_fails_closed(self):
        issuer = Issuer(secret=SECRET)
        token, _ = issuer.issue(agent_id="x", scopes=["crm.read"], ttl_seconds=300)
        tampered = token[:-4] + "xxxx"
        with self.assertRaises(TokenError):
            verify(tampered, SECRET)

    def test_wrong_secret_fails_closed(self):
        issuer = Issuer(secret=SECRET)
        token, _ = issuer.issue(agent_id="x", scopes=["crm.read"], ttl_seconds=300)
        with self.assertRaises(TokenError):
            verify(token, "wrong-secret-that-is-also-32-chars!")

    def test_scp_with_non_string_entries_fails_closed(self):
        payload = {
            "sub": "x", "run": "r1", "scp": [42, "crm.read"],
            "iss": "agenttrust-local",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
            "jti": "tok_test",
        }
        token = pyjwt.encode(payload, SECRET, algorithm="HS256")
        with self.assertRaises(TokenError) as ctx:
            verify(token, SECRET)
        self.assertIn("scp", str(ctx.exception))


# ---------------------------------------------------------------------------
# Policy validation edge cases
# ---------------------------------------------------------------------------

class PolicyValidationTest(unittest.TestCase):
    def test_zero_default_ttl_raises_policy_error(self):
        with self.assertRaises(PolicyError):
            Policy.from_dict({
                "issuer": "x",
                "default_ttl_seconds": 0,
                "agents": {"a": {"scopes": ["crm.read"]}},
            })

    def test_negative_default_ttl_raises_policy_error(self):
        with self.assertRaises(PolicyError):
            Policy.from_dict({
                "issuer": "x",
                "default_ttl_seconds": -60,
                "agents": {"a": {"scopes": ["crm.read"]}},
            })

    def test_zero_per_agent_ttl_raises_policy_error(self):
        with self.assertRaises(PolicyError):
            Policy.from_dict({
                "issuer": "x",
                "default_ttl_seconds": 300,
                "agents": {"a": {"scopes": ["crm.read"], "ttl_seconds": 0}},
            })

    def test_null_scopes_raises_policy_error(self):
        with self.assertRaises(PolicyError):
            Policy.from_dict({
                "issuer": "x",
                "default_ttl_seconds": 300,
                "agents": {"a": {"scopes": None}},
            })

    def test_empty_scopes_list_is_valid_deny_all(self):
        policy = Policy.from_dict({
            "issuer": "x",
            "default_ttl_seconds": 300,
            "agents": {"a": {"scopes": []}},
        })
        self.assertEqual(policy.for_agent("a").scopes, [])

    def test_unknown_agent_raises_policy_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            at = make_at(os.path.join(tmp, "audit.jsonl"))
            with self.assertRaises(PolicyError):
                at.start_run("unknown-agent")


# ---------------------------------------------------------------------------
# required_scope validation
# ---------------------------------------------------------------------------

class RequiredScopeValidationTest(unittest.TestCase):
    def test_empty_required_scope_raises_value_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            at = make_at(os.path.join(tmp, "audit.jsonl"))
            run = at.start_run("support-agent")
            with self.assertRaises(ValueError):
                run.call("", lambda: None)

    def test_none_required_scope_raises_value_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            at = make_at(os.path.join(tmp, "audit.jsonl"))
            run = at.start_run("support-agent")
            with self.assertRaises((ValueError, TypeError)):
                run.call(None, lambda: None)  # type: ignore


# ---------------------------------------------------------------------------
# Redaction correctness
# ---------------------------------------------------------------------------

class RedactionTest(unittest.TestCase):
    def test_sensitive_keys_redacted(self):
        result = redact_args({
            "password": "hunter2",
            "access_token": "tok_abc",
            "refresh_token": "rtok_xyz",
            "client_secret": "cs_secret",
            "private_key": "-----BEGIN RSA PRIVATE KEY-----",
            "credentials": "basic dXNlcjpwYXNz",
            "id_token": "eyJ...",
            "api_key": "sk-12345",
        })
        for k in result:
            self.assertEqual(result[k], "***redacted***", f"{k} was not redacted")

    def test_case_insensitive_redaction(self):
        result = redact_args({"API_KEY": "secret", "Password": "hunter2"})
        self.assertEqual(result["API_KEY"], "***redacted***")
        self.assertEqual(result["Password"], "***redacted***")

    def test_nested_dict_redaction(self):
        result = redact_args({"auth": {"token": "tok_abc", "user": "alice"}})
        self.assertEqual(result["auth"]["token"], "***redacted***")
        self.assertEqual(result["auth"]["user"], "alice")

    def test_list_of_dicts_redacted(self):
        result = redact_args({"users": [
            {"name": "alice", "password": "secret1"},
            {"name": "bob",   "password": "secret2"},
        ]})
        self.assertEqual(result["users"][0]["password"], "***redacted***")
        self.assertEqual(result["users"][0]["name"], "alice")
        self.assertEqual(result["users"][1]["password"], "***redacted***")

    def test_oversized_string_truncated(self):
        long_val = "x" * 300
        result = redact_args({"note": long_val})
        self.assertTrue(result["note"].endswith("...(truncated)"))
        self.assertEqual(len(result["note"]), 256 + len("...(truncated)"))

    def test_non_sensitive_values_pass_through(self):
        result = redact_args({"customer_id": 42, "name": "Asha", "active": True})
        self.assertEqual(result["customer_id"], 42)
        self.assertEqual(result["name"], "Asha")
        self.assertEqual(result["active"], True)

    def test_list_of_primitives_passes_through(self):
        result = redact_args({"ids": [1, 2, 3]})
        self.assertEqual(result["ids"], [1, 2, 3])


# ---------------------------------------------------------------------------
# Thread safety
# ---------------------------------------------------------------------------

class AuditSinkThreadSafetyTest(unittest.TestCase):
    def test_concurrent_writes_all_appear_in_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            sink = AuditSink(os.path.join(tmp, "audit.jsonl"))
            errors = []

            def write_events(agent_id, n):
                try:
                    for _ in range(n):
                        sink.write(AuditEvent.make(
                            agent_id=agent_id, run_id="run_x",
                            token_id="tok_x", tool="t",
                            required_scope="s", decision="allow",
                        ))
                except Exception as e:
                    errors.append(e)

            threads = [threading.Thread(target=write_events, args=(f"agent-{i}", 20))
                       for i in range(5)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            self.assertEqual(errors, [])
            events = sink.read_all()
            self.assertEqual(len(events), 100)


# ---------------------------------------------------------------------------
# Concurrent async runs
# ---------------------------------------------------------------------------

class ConcurrentAsyncRunsTest(unittest.IsolatedAsyncioTestCase):
    async def test_two_concurrent_runs_both_audited_correctly(self):
        with tempfile.TemporaryDirectory() as tmp:
            audit_path = os.path.join(tmp, "audit.jsonl")
            at = make_at(audit_path)
            run1 = at.start_run("support-agent")
            run2 = at.start_run("support-agent")

            import asyncio

            async def task1():
                return await run1.acall("crm.read", lambda: "r1")

            async def task2():
                return await run2.acall("crm.read", lambda: "r2")

            results = await asyncio.gather(task1(), task2())

            self.assertIn("r1", results)
            self.assertIn("r2", results)
            events = at.audit.read_all()
            self.assertEqual(len(events), 2)
            self.assertTrue(all(e["decision"] == "allow" for e in events))
            run_ids = {e["run_id"] for e in events}
            self.assertEqual(len(run_ids), 2)


if __name__ == "__main__":
    unittest.main()
