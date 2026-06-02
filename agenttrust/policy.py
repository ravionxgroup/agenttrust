"""
AgentTrust — policy schema & evaluation.

Policy is declarative: per-agent allow-lists of tool scopes. The MVP keeps it
deliberately simple (glob allow-lists). Conditional rules, approvals, and
anomaly detection are intentionally OUT of the OSS MVP (they're the paid plane).

Example policy (YAML):

    issuer: agenttrust-local
    default_ttl_seconds: 300
    agents:
      support-agent:
        scopes: ["crm.read", "kb.search", "ticket.*"]
        ttl_seconds: 180
      billing-agent:
        scopes: ["invoice.read", "payment.read"]   # note: no write scopes

Scopes are glob patterns matched against the scope a tool call requires
(e.g. a call requiring "ticket.close" is allowed by granted "ticket.*").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentPolicy:
    agent_id: str
    scopes: list[str]
    ttl_seconds: Optional[int] = None


@dataclass
class Policy:
    issuer: str = "agenttrust-local"
    default_ttl_seconds: int = 300
    agents: dict[str, AgentPolicy] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "Policy":
        agents = {}
        for agent_id, spec in (data.get("agents") or {}).items():
            scopes = spec.get("scopes")
            if not isinstance(scopes, list) or not all(isinstance(s, str) for s in scopes):
                raise PolicyError(f"agent '{agent_id}': 'scopes' must be a list of strings")
            per_agent_ttl = spec.get("ttl_seconds")
            if per_agent_ttl is not None and int(per_agent_ttl) <= 0:
                raise PolicyError(
                    f"agent '{agent_id}': ttl_seconds must be a positive integer, "
                    f"got {per_agent_ttl!r}"
                )
            agents[agent_id] = AgentPolicy(
                agent_id=agent_id,
                scopes=scopes,
                ttl_seconds=per_agent_ttl,
            )
        default_ttl = int(data.get("default_ttl_seconds", 300))
        if default_ttl <= 0:
            raise PolicyError(f"default_ttl_seconds must be a positive integer, got {default_ttl!r}")
        return cls(
            issuer=data.get("issuer", "agenttrust-local"),
            default_ttl_seconds=default_ttl,
            agents=agents,
        )

    @classmethod
    def from_yaml(cls, path: str) -> "Policy":
        import yaml  # optional dep; only needed if loading from file
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_dict(yaml.safe_load(f) or {})

    def for_agent(self, agent_id: str) -> AgentPolicy:
        if agent_id not in self.agents:
            # Fail-closed: an unknown agent has NO scopes, not all scopes.
            raise PolicyError(f"no policy defined for agent '{agent_id}' (deny-by-default)")
        return self.agents[agent_id]

    def ttl_for(self, agent_id: str) -> int:
        ap = self.agents.get(agent_id)
        if ap and ap.ttl_seconds:
            return ap.ttl_seconds
        return self.default_ttl_seconds


class PolicyError(Exception):
    """Raised on malformed policy or deny-by-default for unknown agents."""
