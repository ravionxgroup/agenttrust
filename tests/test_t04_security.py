"""Security regressions for the local SDK contract (no Gateway credentials)."""
import json
import time
from dataclasses import fields

import jwt
import pytest

from agenttrust import AgentTrust, ToolDenied
from agenttrust.audit import (
    AuditEvent, AuditSink, redact_args, REDACTED, UNSAFE,
    MAX_AUDIT_COLLECTION, MAX_AUDIT_DEPTH, MAX_AUDIT_VALUES,
)
from agenttrust.identity import Issuer, TokenError, verify
from agenttrust.policy import Policy

SECRET = "t04-test-signing-key-not-production-0123456789-abcdefghijklmnopqrstuvwxyz"
SENTINEL = "T04_SENTINEL_SECRET_NEVER_SERIALIZED_7349"


def claims():
    now = int(time.time())
    return dict(sub="support-agent", run="run_test", jti="tok_test",
                iss="agenttrust-local", scp=["crm.read", "ticket.*"],
                iat=now - 10, exp=now + 300)


def signed(payload, algorithm="HS256", secret=SECRET):
    return jwt.PyJWS().encode(json.dumps(payload).encode("utf-8"), secret, algorithm=algorithm)


def test_issued_and_supported_tokens_remain_valid():
    token, identity = Issuer(SECRET).issue("support-agent", ("crm.read", "ticket.*"))
    assert verify(token, SECRET, expected_issuer="agenttrust-local") == identity
    for scopes in ([], ["crm.read"], ["ticket.*", "tool.?", "tool.[a-z]", "tool.[!0-9]"]):
        payload = claims()
        payload["scp"] = scopes
        result = verify(signed(payload), SECRET)
        assert result.scopes == scopes
        assert not result.allows("payment.refund")
    assert verify(token, SECRET).allows("ticket.create")


@pytest.mark.parametrize("claim", ["sub", "run", "jti", "scp", "iat", "exp"])
def test_missing_required_claims(claim):
    payload = claims()
    del payload[claim]
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET)


@pytest.mark.parametrize("value", ["*", "crm.read", None, 4, True, {}, {"*": 1},
    [["crm.read"]], [42], [None], [True], [""], [" "], ["crm read"],
    ["crm.\nread"], ["crm.["], ["crm.[]"], ["crm.💥"], ["a" * 257]])
def test_malformed_scope_claims(value):
    payload = claims()
    payload["scp"] = value
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET)


@pytest.mark.parametrize("claim", ["sub", "run", "jti", "iss"])
@pytest.mark.parametrize("value", [None, "", " ", "has space", "line\nbreak", 1, True, {}, [], "a" * 257])
def test_malformed_identity_claims(claim, value):
    payload = claims()
    payload[claim] = value
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET)


@pytest.mark.parametrize("claim", ["exp", "iat", "nbf"])
@pytest.mark.parametrize("value", [None, True, False, "2000000000", 2000000000.5, {}, [], -1, float("nan"), float("inf")])
def test_strict_timestamp_types(claim, value):
    payload = claims()
    payload[claim] = value
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET)


def test_time_signature_issuer_and_algorithm_enforcement():
    payload = claims()
    payload.update(iat=int(time.time()) - 20, exp=int(time.time()) - 10)
    with pytest.raises(TokenError, match="expired"):
        verify(signed(payload), SECRET)
    assert verify(signed(payload), SECRET, leeway=30)
    payload = claims()
    payload["iat"] = int(time.time()) + 100
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET)
    payload = claims()
    payload["exp"] = payload["iat"]
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET, leeway=100)
    with pytest.raises(TokenError):
        verify(signed(claims(), secret=SECRET + "other"), SECRET)
    with pytest.raises(TokenError):
        verify(signed(claims(), "HS512"), SECRET)
    unsigned = signed(claims(), "none", secret="")
    for algorithms in (None, ["none"], ["HS256", "none"], []):
        with pytest.raises(TokenError):
            verify(unsigned, SECRET, algorithms=algorithms)
    with pytest.raises(TokenError, match="issuer"):
        verify(signed(claims()), SECRET, expected_issuer="other")
    payload = claims()
    del payload["iss"]
    assert verify(signed(payload), SECRET).issuer == ""
    with pytest.raises(TokenError):
        verify(signed(payload), SECRET, expected_issuer="agenttrust-local")


@pytest.mark.parametrize("overrides", [dict(agent_id=""), dict(run_id=""), dict(scopes="*"),
    dict(scopes=[""]), dict(ttl_seconds=True), dict(ttl_seconds=1.5)])
def test_issuance_does_not_coerce_malformed_input(overrides):
    options = dict(agent_id="agent", scopes=["crm.read"])
    options.update(overrides)
    with pytest.raises(ValueError):
        Issuer(SECRET).issue(**options)


class Hostile:
    def __repr__(self):
        raise AssertionError(SENTINEL)

    __str__ = __repr__
    __bool__ = __repr__
    __iter__ = __repr__
    __deepcopy__ = __repr__


class HostileDict(dict):
    def items(self):
        raise AssertionError(SENTINEL)


class HostileList(list):
    def __iter__(self):
        raise AssertionError(SENTINEL)


class HostileString(str):
    def lower(self):
        raise AssertionError(SENTINEL)


def audit_output(tmp_path, value):
    path = tmp_path / "audit.jsonl"
    sink = AuditSink(str(path))
    event = AuditEvent.make("agent", "run", "tok", "tool", "crm.read", "allow",
                            args_redacted=value, result_status="ok")
    sink.write(event)  # Deliberately bypass caller-side redaction.
    raw = path.read_text()
    assert SENTINEL not in raw
    payload = json.loads(raw.splitlines()[-1])
    assert set(payload) == {field.name for field in fields(AuditEvent)}
    assert payload["agent_id"] == "agent"
    return payload["args_redacted"]


@pytest.mark.parametrize("key", ["password", "secret", "token", "access_token", "refresh_token",
    "api_key", "authorization", "client_secret", "private_key", "API_KEY", "Password", "X-API-Key", " Authorization "])
def test_recursive_sensitive_keys_and_serialization(tmp_path, key):
    value = {key: SENTINEL, "dict": {key: SENTINEL},
             "list": [[{key: SENTINEL}]], "tuple": (({key: SENTINEL},),),
             "mixed": [{"items": ([{key: SENTINEL}],)}]}
    result = redact_args(value)
    assert SENTINEL not in json.dumps(result)
    assert result[key] == REDACTED
    assert result["list"][0][0][key] == REDACTED
    assert result["tuple"][0][0][key] == REDACTED
    assert audit_output(tmp_path, value) == result
    assert value[key] == SENTINEL  # Input is not mutated.


def test_cycles_and_repeated_references(tmp_path):
    value = {"password": SENTINEL}
    value["self"] = value
    sequence = [value]
    sequence.append(sequence)
    result = audit_output(tmp_path, {"items": sequence, "again": value})
    assert result["items"][1] == UNSAFE
    assert result["again"]["password"] == REDACTED


def test_depth_collection_and_total_work_limits(tmp_path):
    deep = {"password": SENTINEL}
    for _ in range(MAX_AUDIT_DEPTH + 10):
        deep = {"nested": [deep]}
    result = audit_output(tmp_path, deep)
    assert UNSAFE in json.dumps(result)
    for collection in ([SENTINEL] * (MAX_AUDIT_COLLECTION + 1),
                       tuple([SENTINEL] * (MAX_AUDIT_COLLECTION + 1)),
                       {str(i): SENTINEL for i in range(MAX_AUDIT_COLLECTION + 1)}):
        assert audit_output(tmp_path, {"oversized": collection})["oversized"] == UNSAFE
    assert redact_args({"items": list(range(MAX_AUDIT_COLLECTION))})["items"] == list(range(MAX_AUDIT_COLLECTION))
    # Every collection is within its individual limit; total work exceeds budget.
    wide = [[{ "password": SENTINEL } for _ in range(64)] for _ in range(64)]
    assert 64 * 64 > MAX_AUDIT_VALUES
    assert audit_output(tmp_path, {"wide": wide}) == {"_sanitization": UNSAFE}


@pytest.mark.parametrize("value", [Hostile(), HostileDict(password=SENTINEL),
    HostileList([SENTINEL]), HostileString(SENTINEL), {SENTINEL}, b"secret",
    float("nan"), float("inf"), 1 << 1000])
def test_unsupported_values_fail_closed(tmp_path, value):
    assert audit_output(tmp_path, {"value": value})["value"] == UNSAFE


def test_invalid_dictionary_keys_and_roots_fail_closed(tmp_path):
    assert audit_output(tmp_path, {Hostile(): SENTINEL}) == {"_sanitization": UNSAFE}
    assert audit_output(tmp_path, {"x" * 257: SENTINEL}) == {"_sanitization": UNSAFE}
    assert audit_output(tmp_path, Hostile()) == {"_sanitization": UNSAFE}
    assert audit_output(tmp_path, {"long": "x" * 1000})["long"] == "x" * 256 + "...(truncated)"


def test_local_authorization_and_positional_audit_compatibility(tmp_path):
    path = tmp_path / "sdk.jsonl"
    sdk = AgentTrust(Policy.from_dict({"agents": {"agent": {"scopes": ["crm.read"]}}}),
                     SECRET, str(path))
    run = sdk.start_run("agent")
    payload = [[{"API_KEY": SENTINEL}]]
    assert run.call("crm.read", lambda arg: "ok", payload) == "ok"
    with pytest.raises(ToolDenied):
        run.call("payment.refund", lambda **kwargs: None, items=payload)
    assert SENTINEL not in path.read_text()
    events = sdk.audit.read_all()
    assert events[0]["args_redacted"]["_args"]["0"][0][0]["API_KEY"] == REDACTED
    assert events[1]["decision"] == "deny"
