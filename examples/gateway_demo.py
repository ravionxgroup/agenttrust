"""Run against the platform demo; provision the bearer token externally first.

Install: python -m pip install -e '.[gateway]'
Set AGENTTRUST_GATEWAY_TOKEN from the trusted demo issuer's output.
"""
import asyncio
import os

from agenttrust.gateway import (
    GatewayAuthorizationDenied, GatewayClient, GatewayCredentials, GatewayTool,
)


def main():
    client = GatewayClient(
        "http://127.0.0.1:8080",
        GatewayCredentials(provider=lambda: os.environ["AGENTTRUST_GATEWAY_TOKEN"]),
        allow_local_http=True,
    )
    run = client.bind({
        "status": GatewayTool("service_status", "mcp"),
        "restart": GatewayTool("restart_service", "mcp"),
    })
    result = run.execute("status", {})
    print("sync:", result.outcome.value, "invocation:", result.invocation_id)
    result = asyncio.run(run.aexecute("status", {}))
    print("async:", result.outcome.value, "invocation:", result.invocation_id)
    try:
        run.execute("restart", {})
    except GatewayAuthorizationDenied as error:
        print("denied:", error.code, "invocation:", error.invocation_id)


if __name__ == "__main__":
    main()
