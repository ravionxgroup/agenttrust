"""Container deployment demo; uses the existing SDK, no direct-tool fallback."""
import json
import os
from pathlib import Path

from agenttrust.gateway import GatewayAuthorizationDenied, GatewayClient, GatewayCredentials


def client():
    return GatewayClient(os.environ["AGENTTRUST_GATEWAY_URL"],
                         GatewayCredentials(provider=lambda: Path("/run/secrets/gateway_token").read_text().strip()),
                         timeout=5)


def main():
    gateway = client()
    results = []
    for tool, kind, denied in [("http_status", "http", False), ("http_restart", "http", True),
                               ("service_status", "mcp", False), ("restart_service", "mcp", True)]:
        try:
            result = gateway.execute(tool, {}, kind=kind)
            if denied:
                raise AssertionError("missing permission unexpectedly authorized")
            results.append(dict(tool=tool, authorization="ALLOW", outcome=result.outcome.value,
                                invocation_id=result.invocation_id, request_id=result.request_id))
        except GatewayAuthorizationDenied as error:
            if not denied:
                raise
            results.append(dict(tool=tool, authorization="DENY", outcome=error.outcome.value,
                                invocation_id=error.invocation_id, request_id=error.request_id))
    print(json.dumps(results))


if __name__ == "__main__":
    main()
