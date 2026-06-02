"""
AgentTrust SDK — the developer-facing wedge.

Usage (MVP, soft enforcement at the SDK):

    from agenttrust import AgentTrust
    from agenttrust.policy import Policy

    at = AgentTrust(policy=Policy.from_yaml("policy.yaml"),
                    secret="dev-secret-change-me-32-byte-key")

    # Start a run -> mints a short-lived, scoped per-run identity
    run = at.start_run("support-agent")

    # Guard each tool call: checks scope, audits, then runs (or blocks)
    result = run.call("crm.read", get_customer, customer_id=42)         # allowed
    run.call("payment.refund", do_refund, amount=999)                   # blocked -> ToolDenied

The SDK is a *visibility + least-privilege* layer: cooperative first-party
agents call through `run.call(...)`. Hard enforcement (so code can't bypass)
comes with the gateway later. The audit + scoping value is real today.
"""
from __future__ import annotations

import functools
import inspect
import time
from typing import Callable, Any

from .identity import Issuer, AgentIdentity
from .policy import Policy, PolicyError
from .audit import AuditSink, AuditEvent, redact_args


class ToolDenied(Exception):
    """Raised when a tool call is not permitted by the agent's identity."""


def _redact_call_args(args: tuple, kwargs: dict) -> dict:
    redacted = redact_args(kwargs)
    if args:
        redacted["_args"] = redact_args({str(i): v for i, v in enumerate(args)})
    return redacted


class AgentRun:
    def __init__(self, parent: "AgentTrust", identity: AgentIdentity):
        self._parent = parent
        self.identity = identity

    @property
    def run_id(self) -> str:
        return self.identity.run_id

    def _authorize_or_raise(self, required_scope: str, tool_name: str, redacted: dict) -> None:
        if not isinstance(required_scope, str) or not required_scope:
            raise ValueError(
                f"required_scope must be a non-empty string, got {required_scope!r}"
            )
        if int(time.time()) >= self.identity.expires_at:
            self._parent.audit.write(AuditEvent.make(
                agent_id=self.identity.agent_id, run_id=self.run_id,
                token_id=self.identity.token_id, tool=tool_name,
                required_scope=required_scope, decision="deny",
                reason="identity expired", args_redacted=redacted,
            ))
            raise ToolDenied(
                f"agent '{self.identity.agent_id}' identity expired for run '{self.run_id}'"
            )

        if not self.identity.allows(required_scope):
            self._parent.audit.write(AuditEvent.make(
                agent_id=self.identity.agent_id, run_id=self.run_id,
                token_id=self.identity.token_id, tool=tool_name,
                required_scope=required_scope, decision="deny",
                reason="scope not granted", args_redacted=redacted,
            ))
            raise ToolDenied(
                f"agent '{self.identity.agent_id}' is not allowed scope "
                f"'{required_scope}' (granted: {self.identity.scopes})"
            )

    def _audit_allowed(self, tool_name: str, required_scope: str, redacted: dict,
                       status: str) -> None:
        self._parent.audit.write(AuditEvent.make(
            agent_id=self.identity.agent_id, run_id=self.run_id,
            token_id=self.identity.token_id, tool=tool_name,
            required_scope=required_scope, decision="allow",
            args_redacted=redacted, result_status=status,
        ))

    def call(self, required_scope: str, fn: Callable, *args, **kwargs) -> Any:
        """Authorize -> audit -> execute one tool call. Fail-closed on deny."""
        tool_name = getattr(fn, "__name__", "tool")
        redacted = _redact_call_args(args, kwargs)

        # 1. Authorize against the per-run identity (scope check)
        self._authorize_or_raise(required_scope, tool_name, redacted)

        # 2. Allowed -> execute, audit the result status
        status = "error"
        try:
            result = fn(*args, **kwargs)
            if inspect.isawaitable(result):
                close = getattr(result, "close", None)
                if close:
                    close()
                raise TypeError("AgentRun.call() received an awaitable; use AgentRun.acall()")
            status = "ok"
            return result
        except Exception:
            status = "error"
            raise
        finally:
            self._audit_allowed(tool_name, required_scope, redacted, status)

    def guarded(self, required_scope: str) -> Callable:
        """Return a decorator that routes any function through this run's auth + audit."""
        def decorator(fn: Callable) -> Callable:
            if inspect.iscoroutinefunction(fn):
                @functools.wraps(fn)
                async def async_wrapper(*args, **kwargs):
                    return await self.acall(required_scope, fn, *args, **kwargs)
                return async_wrapper
            @functools.wraps(fn)
            def sync_wrapper(*args, **kwargs):
                return self.call(required_scope, fn, *args, **kwargs)
            return sync_wrapper
        return decorator

    def __enter__(self) -> "AgentRun":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        return False

    async def acall(self, required_scope: str, fn: Callable, *args, **kwargs) -> Any:
        """Async authorize -> audit -> execute for async tool clients."""
        tool_name = getattr(fn, "__name__", "tool")
        redacted = _redact_call_args(args, kwargs)

        self._authorize_or_raise(required_scope, tool_name, redacted)

        status = "error"
        try:
            result = fn(*args, **kwargs)
            if inspect.isawaitable(result):
                result = await result
            status = "ok"
            return result
        except Exception:
            status = "error"
            raise
        finally:
            self._audit_allowed(tool_name, required_scope, redacted, status)


class AgentTrust:
    def __init__(self, policy: Policy, secret: str, audit_path: str = "agenttrust_audit.jsonl"):
        self.policy = policy
        self.issuer = Issuer(secret=secret, issuer_id=policy.issuer)
        self.audit = AuditSink(audit_path)

    def start_run(self, agent_id: str) -> AgentRun:
        """Mint a per-run identity scoped by policy (deny-by-default if unknown)."""
        agent_policy = self.policy.for_agent(agent_id)          # raises if undefined
        ttl = self.policy.ttl_for(agent_id)
        _token, identity = self.issuer.issue(
            agent_id=agent_id, scopes=agent_policy.scopes, ttl_seconds=ttl
        )
        return AgentRun(self, identity)
