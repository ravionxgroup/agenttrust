# Local SDK security contract (T04)

These rules apply to the existing Python SDK. They do not introduce Gateway
credentials, remote execution, a new issuer, or a Gateway audit schema.

## JWT identity

`Issuer.issue()` still issues HS256 tokens by default, with a five-minute
default lifetime. `verify()` still verifies the signature and PyJWT's expiration,
issued-at, not-before (when supplied), and audience behavior. Existing leeway
remains available. Algorithms are supplied by trusted verifier configuration,
defaulting to HS256; the token cannot select an algorithm outside that list.
An empty algorithm list or any list containing `none` is rejected.

Required claims remain `sub`, `run`, `scp`, `iat`, `exp`, and `jti`.

- `sub`, `run`, and `jti` must be strings of 1–256 printable ASCII characters,
  without whitespace or control characters. No coercion or trimming occurs.
- `iss` remains optional when no expected issuer is configured. If present it
  follows the identifier rule. Supplying `expected_issuer` requires an exact
  match and a non-empty valid expected issuer; missing issuer is then rejected.
- `exp` and `iat` must be non-negative JSON integers, excluding booleans,
  numeric strings, floats, null, and containers. `exp` must be later than `iat`.
  Optional `nbf` follows the same integer rule. Time verification remains active.
- `scp` must be a JSON array of strings. An empty array explicitly grants
  nothing. Each entry must contain 1–256 characters drawn from ASCII letters,
  digits, `_ . : / -`, and the glob characters `* ? [ ] !`. Incomplete bracket
  classes, whitespace, control characters, objects, null, numbers and nested
  arrays are rejected. Supported `fnmatch` glob semantics remain unchanged,
  including `ticket.*`, `tool.?`, and `tool.[a-z]`. Scopes are never trimmed,
  split, case-folded, or otherwise normalized into broader permissions.

Issuance applies the same claim validation before signing. Lists and tuples of
scope strings are accepted by issuance and encoded as JSON arrays. A supplied
empty run ID is invalid; only `None` generates a run ID. TTL must be a positive
integer, excluding booleans. Malformed inputs previously accepted through
coercion are deliberately no longer supported.

Verification failures use `TokenError` with fixed messages or claim-name-only
validation messages, without embedding the credential or rejected claim value.
Public function signatures, identity fields, and supported glob grants remain.
No EdDSA, audience alignment, or external-credential integration is added.

## Audit redaction and serialization

`redact_args()` recursively sanitizes exact built-in dictionaries, lists, and
tuples; tuples serialize as arrays. Sensitive dictionary keys are matched after
trimming surrounding whitespace, lowercasing, and replacing hyphens with
underscores. The existing `***redacted***` marker and sensitive-key policy are
preserved:

`password`, `passwd`, `pass`, `token`, `access_token`, `refresh_token`, `id_token`,
`auth_token`, `api_key`, `apikey`, `x_api_key`, `client_secret`, `private_key`,
`private`, `secret`, `credentials`, `credential`, `authorization`, `bearer`,
`ssn`, `card`, `cvv`, `pan`.

A sensitive key replaces its entire value without traversing it. Redaction
applies at every dictionary depth, including dictionaries inside arbitrarily
mixed supported sequence types. Inputs are not mutated.

Explicit limits per sanitization pass:

| Limit | Value and overflow behavior |
|---|---|
| Container nesting | 16 levels, counting the root at depth zero; deeper containers become `[UNSAFE]` |
| Collection entries | 128 per dictionary/list/tuple; larger containers become `[UNSAFE]` without traversal |
| Visited values | 2,048, including root and redaction markers; exhaustion replaces the entire pass result |
| String values | First 256 characters plus existing `...(truncated)` suffix |
| Dictionary keys | Exact strings up to 256 characters; invalid keys replace their containing dictionary |
| Integers | At most 256 bits; larger values become `[UNSAFE]` |
| Floats | Finite only; NaN and infinity become `[UNSAFE]` |

Cycles replace the cyclic branch with `[UNSAFE]`. Repeated non-cyclic references
are processed normally within the shared work budget. Unsupported types,
including subclasses of built-ins, sets, bytes, and custom objects, become
`[UNSAFE]`. No arbitrary `repr()`, `str()`, iterator, truthiness, or deepcopy
hooks are called. Traversal exceptions fail closed. An unsafe root is represented
as `{"_sanitization":"[UNSAFE]"}` so `redact_args()` still returns a dictionary.

`AuditSink.write()` accepts `AuditEvent` instances of the exact built-in SDK
class and sanitizes every field immediately before JSON serialization. Argument
sanitization has its own budget so oversized arguments do not remove event
identity/decision fields. Metadata has a separate bounded pass. Direct sink
writes cannot bypass sanitization. Serialization uses no custom object fallback,
disallows non-finite JSON numbers, and no longer uses recursive `asdict()` or
`deepcopy()`. Normal event keys and positional argument index mappings remain
compatible. Excessive positional argument counts are replaced before building
an unbounded index mapping.

Redaction is key-based, not free-text secret/PII detection. Sensitive values in
unknown fields, free text, or dictionary keys may remain; callers must not put
credentials there or in event identity/tool/reason metadata. Long-string
truncation is a size control, not secret detection. The SDK remains cooperative,
in-process enforcement; mutable identities and host code are trusted. Local
JSONL storage is not tamper-evident, distributed, or size-rotated by this task.

## Verification

Run `python3 -m pytest -q -rs` (or `python -m pytest -q -rs` in a virtual
environment). Existing CI supports Python 3.9–3.12. Real MCP tests require the
optional `mcp` dependency and Python 3.10 or newer; LangChain tests require
`langchain-core`. No Python formatter, linter, or type checker is configured.

`tests/test_t04_security.py` covers malformed claims, signature/time/algorithm
checks, recursive redaction, hostile objects, cycles, all processing limits,
direct serialization safety, and local authorization compatibility. Existing
hardening, LangChain, MCP, and ergonomics tests remain unchanged.

T04 local verification: Python 3.9.6 / PyJWT 2.13.0 passes 177 tests, with
three real-MCP tests skipped because MCP is not installed in that interpreter.
A temporary Python 3.14.6 environment with PyJWT 2.15.1, LangChain Core 1.7.0,
and MCP 1.30.0 passes all 180 tests. Python syntax compilation and
`git diff --check` also pass. Python 3.10–3.12 were not available locally.

The unconstrained optional dependency declaration also admits MCP 2.3.0,
which removed `create_connected_server_and_client_session`, imported by the
existing real-MCP tests. Those three tests fail identically on unchanged HEAD
and the T04 working tree with MCP 2.3.0. T04 leaves dependency declarations and
MCP integration code unchanged; the complete passing integration run uses 1.x.
