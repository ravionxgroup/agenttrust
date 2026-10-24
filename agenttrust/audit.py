"""
AgentTrust — audit events.

Every tool call attempt produces one append-only audit event: who (agent/run),
what (tool + scope), the decision (allow/deny), redacted args, and result
status. The MVP sink is local JSONL (append-only file). Long retention,
tamper-evidence, search, and SIEM export are the paid plane.
"""
from __future__ import annotations

import json
import math
import threading
import time
import uuid
from dataclasses import dataclass, fields
from typing import Optional, Any


@dataclass
class AuditEvent:
    event_id: str
    ts: float
    agent_id: str
    run_id: str
    token_id: str
    tool: str
    required_scope: str
    decision: str               # "allow" | "deny"
    reason: Optional[str]       # why denied (or None)
    args_redacted: dict         # tool arguments after redaction
    result_status: Optional[str] = None   # "ok" | "error" | None (if denied)

    @staticmethod
    def make(agent_id, run_id, token_id, tool, required_scope, decision,
             reason=None, args_redacted=None, result_status=None) -> "AuditEvent":
        return AuditEvent(
            event_id=f"evt_{uuid.uuid4().hex}",
            ts=time.time(),
            agent_id=agent_id,
            run_id=run_id,
            token_id=token_id,
            tool=tool,
            required_scope=required_scope,
            decision=decision,
            reason=reason,
            args_redacted={} if args_redacted is None else args_redacted,
            result_status=result_status,
        )


class AuditSink:
    """Append-only JSONL audit sink (MVP). Swap for Postgres in the gateway."""

    def __init__(self, path: str = "agenttrust_audit.jsonl"):
        self.path = path
        self._lock = threading.Lock()

    def write(self, event: AuditEvent) -> None:
        if type(event) is not AuditEvent:
            raise TypeError("audit event must be an AuditEvent")
        # Do not use asdict/deepcopy: they can recurse or execute object hooks.
        payload = {
            field.name: object.__getattribute__(event, field.name)
            for field in fields(AuditEvent)
        }
        arguments = redact_args(payload.pop("args_redacted"))
        payload = redact_args(payload)
        payload["args_redacted"] = arguments
        encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n"
        with self._lock:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(encoded)

    def read_all(self) -> list[dict]:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return [json.loads(line) for line in f if line.strip()]
        except FileNotFoundError:
            return []


# --- redaction -------------------------------------------------------------
# Deliberately conservative: redact by key name. Real redaction of free-text
# PII is genuinely hard and a deliberate later investment.
_SENSITIVE_KEYS = {
    # passwords
    "password", "passwd", "pass",
    # tokens & keys
    "token", "access_token", "refresh_token", "id_token", "auth_token",
    "api_key", "apikey", "x_api_key", "client_secret", "private_key", "private",
    # credentials & auth headers
    "secret", "credentials", "credential", "authorization", "bearer",
    # financial / PII identifiers
    "ssn", "card", "cvv", "pan",
}


MAX_AUDIT_DEPTH = 16
MAX_AUDIT_COLLECTION = 128
MAX_AUDIT_VALUES = 2048
MAX_AUDIT_STRING = 256
REDACTED = "***redacted***"
UNSAFE = "[UNSAFE]"


class _BudgetExceeded(Exception):
    pass


def _sanitize(value: Any, depth: int, active: set, budget: list) -> Any:
    budget[0] -= 1
    if budget[0] < 0:
        raise _BudgetExceeded
    kind = type(value)
    if kind is str:
        if len(value) > MAX_AUDIT_STRING:
            return value[:MAX_AUDIT_STRING] + "...(truncated)"
        return value
    if value is None or kind is bool:
        return value
    if kind is int:
        return value if value.bit_length() <= 256 else UNSAFE
    if kind is float:
        return value if math.isfinite(value) else UNSAFE
    # Exact built-in types only: never invoke custom iterators, repr, str,
    # deepcopy, truthiness, comparison or serialization hooks.
    if kind not in (dict, list, tuple):
        return UNSAFE
    if depth >= MAX_AUDIT_DEPTH or len(value) > MAX_AUDIT_COLLECTION or id(value) in active:
        return UNSAFE
    active.add(id(value))
    try:
        if kind is dict:
            out = {}
            for key, item in value.items():
                if type(key) is not str or len(key) > MAX_AUDIT_STRING:
                    return UNSAFE
                out[key] = _sanitize(
                    REDACTED if key.strip().lower().replace("-", "_") in _SENSITIVE_KEYS else item,
                    depth + 1, active, budget,
                )
            return out
        return [_sanitize(item, depth + 1, active, budget) for item in value]
    finally:
        active.remove(id(value))


def redact_args(args: dict[str, Any]) -> dict[str, Any]:
    """Bounded recursive redaction. Unsafe roots become a placeholder mapping."""
    if args is None:
        return {}
    try:
        result = _sanitize(args, 0, set(), [MAX_AUDIT_VALUES])
    except Exception:
        # Includes concurrent container mutation; never stringify the failure.
        result = UNSAFE
    return result if type(result) is dict else {"_sanitization": UNSAFE}
