"""
AgentTrust — identity issuance & verification.

A per-run identity is a short-lived signed token (JWT) that names the agent,
the specific run, and the scopes (tools) it is allowed to call. The SDK
requests one at the start of a run and attaches it to every tool call; the
verifier (in-SDK for the MVP, in the gateway later) checks signature, expiry,
and scope before a call is allowed.

MVP signing: HMAC (HS256) with a shared secret for self-host simplicity.
Production: swap to asymmetric (RS256/EdDSA) so verifiers never hold the
signing key — see `Issuer` docstring. The token *schema* does not change.
"""
from __future__ import annotations

import time
import uuid
import fnmatch
import re
from dataclasses import dataclass
from typing import Optional

import jwt  # PyJWT


DEFAULT_TTL_SECONDS = 300  # 5 minutes — short-lived by design


_IDENTIFIER = re.compile(r"[!-~]{1,256}\Z")
_SCOPE = re.compile(r"[A-Za-z0-9_.:/?*\[\]!-]{1,256}\Z")


def _identifier(value, claim):
    if type(value) is not str or not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"{claim} must be a non-empty printable ASCII identifier (max 256)")


def _scopes(value):
    if type(value) is not list:
        raise ValueError("scp claim must be a list of scope strings")
    for scope in value:
        if type(scope) is not str or not _SCOPE.fullmatch(scope):
            raise ValueError("scp claim contains an invalid scope")
        # Preserve fnmatch glob semantics, but reject incomplete character classes.
        remaining = scope
        while "[" in remaining:
            _, remaining = remaining.split("[", 1)
            if remaining.startswith("!"):
                remaining = remaining[1:]
            if remaining.startswith("]"):
                remaining = remaining[1:]
            if "]" not in remaining:
                raise ValueError("scp claim contains an invalid glob")
            _, remaining = remaining.split("]", 1)


def _validate_claims(claims):
    for name in ("sub", "run", "jti"):
        _identifier(claims[name], name)
    if "iss" in claims:
        _identifier(claims["iss"], "iss")
    for name in ("exp", "iat", "nbf"):
        if name in claims and (type(claims[name]) is not int or claims[name] < 0):
            raise ValueError(f"{name} must be a non-negative integer timestamp")
    if claims["exp"] <= claims["iat"]:
        raise ValueError("exp must be later than iat")
    _scopes(claims["scp"])


@dataclass
class AgentIdentity:
    """Decoded claims of a per-run agent identity token.

    Token schema (JWT claims):
      sub   : agent id              (stable, e.g. "support-agent")
      run   : run id                (unique per agent invocation)
      scp   : list of tool scopes   (glob patterns, e.g. ["crm.read", "email.*"])
      iss   : issuer id             (who minted it)
      iat   : issued-at (epoch s)
      exp   : expiry (epoch s)
      jti   : unique token id       (for audit correlation / revocation later)
    """
    agent_id: str
    run_id: str
    scopes: list[str]
    issuer: str
    issued_at: int
    expires_at: int
    token_id: str

    def allows(self, required_scope: str) -> bool:
        """True if any granted scope matches the required scope (glob)."""
        return any(fnmatch.fnmatch(required_scope, granted) for granted in self.scopes)

    def to_claims(self) -> dict:
        return {
            "sub": self.agent_id,
            "run": self.run_id,
            "scp": self.scopes,
            "iss": self.issuer,
            "iat": self.issued_at,
            "exp": self.expires_at,
            "jti": self.token_id,
        }


class Issuer:
    """Mints short-lived, scoped per-run tokens.

    MVP: symmetric HS256 with `secret`. To move to production asymmetric
    signing, give the Issuer a private key and `algorithm="RS256"/"EdDSA"`,
    and hand verifiers only the public key — no other code changes.
    """

    def __init__(self, secret: str, issuer_id: str = "agenttrust-local", algorithm: str = "HS256"):
        if not secret or len(secret) < 32:
            raise ValueError("Issuer secret must be at least 32 chars.")
        self._secret = secret
        self.issuer_id = issuer_id
        self.algorithm = algorithm

    def issue(self, agent_id: str, scopes: list[str], ttl_seconds: int = DEFAULT_TTL_SECONDS,
              run_id: Optional[str] = None) -> tuple[str, AgentIdentity]:
        """Return (encoded_jwt, AgentIdentity) for one agent run."""
        if type(ttl_seconds) is not int or ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be a positive integer")
        if type(scopes) not in (list, tuple):
            raise ValueError("scopes must be a list or tuple of scope strings")
        now = int(time.time())
        ident = AgentIdentity(
            agent_id=agent_id,
            run_id=f"run_{uuid.uuid4().hex[:12]}" if run_id is None else run_id,
            scopes=list(scopes),
            issuer=self.issuer_id,
            issued_at=now,
            expires_at=now + ttl_seconds,
            token_id=f"tok_{uuid.uuid4().hex}",
        )
        _validate_claims(ident.to_claims())
        token = jwt.encode(ident.to_claims(), self._secret, algorithm=self.algorithm)
        return token, ident


class TokenError(Exception):
    """Raised when a token is missing, malformed, expired, or wrong issuer."""


def verify(token: str, secret: str, expected_issuer: Optional[str] = None,
           algorithms: Optional[list[str]] = None,
           leeway: int = 0) -> AgentIdentity:
    """Verify signature + expiry and return the decoded AgentIdentity.

    Fail-closed: any problem raises TokenError; callers must treat that as DENY.
    leeway (seconds) adds clock-skew tolerance on the exp/iat checks.
    """
    try:
        if algorithms is not None and (
            type(algorithms) is not list or not algorithms
            or any(type(a) is not str or a.lower() == "none" for a in algorithms)
        ):
            raise TokenError("invalid algorithm configuration")
        claims = jwt.decode(
            token,
            secret,
            algorithms=algorithms or ["HS256"],
            options={"require": ["exp", "iat", "sub", "run", "scp", "jti"]},
            leeway=leeway,
        )
    except jwt.ExpiredSignatureError as e:
        raise TokenError("token expired") from e
    except jwt.InvalidTokenError:
        raise TokenError("invalid token") from None
    except (TypeError, ValueError, OverflowError):
        raise TokenError("invalid token claims") from None

    try:
        _validate_claims(claims)
        if expected_issuer is not None:
            _identifier(expected_issuer, "expected_issuer")
            if claims.get("iss") != expected_issuer:
                raise TokenError("unexpected issuer")
    except ValueError as e:
        raise TokenError(str(e)) from None

    return AgentIdentity(
        agent_id=claims["sub"],
        run_id=claims["run"],
        scopes=list(claims["scp"]),
        issuer=claims.get("iss", ""),
        issued_at=claims["iat"],
        expires_at=claims["exp"],
        token_id=claims["jti"],
    )
