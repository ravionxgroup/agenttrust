"""
AgentTrust — audit events.

Every tool call attempt produces one append-only audit event: who (agent/run),
what (tool + scope), the decision (allow/deny), redacted args, and result
status. The MVP sink is local JSONL (append-only file). Long retention,
tamper-evidence, search, and SIEM export are the paid plane.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, asdict
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
            args_redacted=args_redacted or {},
            result_status=result_status,
        )


class AuditSink:
    """Append-only JSONL audit sink (MVP). Swap for Postgres in the gateway."""

    def __init__(self, path: str = "agenttrust_audit.jsonl"):
        self.path = path
        self._lock = threading.Lock()

    def write(self, event: AuditEvent) -> None:
        with self._lock:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(event), separators=(",", ":")) + "\n")

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


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)


def redact_args(args: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in (args or {}).items():
        if k.lower() in _SENSITIVE_KEYS:
            out[k] = "***redacted***"
        elif isinstance(v, str) and len(v) > 256:
            out[k] = v[:256] + "...(truncated)"
        elif isinstance(v, dict):
            out[k] = redact_args(v)
        elif isinstance(v, (list, tuple)):
            out[k] = [redact_args(item) if isinstance(item, dict) else _json_safe(item)
                      for item in v]
        else:
            out[k] = _json_safe(v)
    return out
