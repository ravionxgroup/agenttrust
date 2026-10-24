"""Small deployment probes. No token contents, payloads or TLS bypasses."""
import json
import os
from pathlib import Path
import socket
import ssl
import sys
import urllib.request

import certifi
from agenttrust.gateway import GatewayClient, GatewayCredentials, GatewayError
from container_demo import client


def main():
    mode = sys.argv[1]
    if mode == "health":
        context = ssl.create_default_context(cafile=certifi.where())
        with urllib.request.urlopen(os.environ["AGENTTRUST_GATEWAY_URL"] + "/readyz", context=context, timeout=2) as response:
            assert response.status == 200
    elif mode == "connect":
        host, port = sys.argv[2], int(sys.argv[3])
        try:
            with socket.create_connection((host, port), timeout=2):
                pass
            print(json.dumps(dict(host=host, port=port, connected=True)))
        except OSError:
            print(json.dumps(dict(host=host, port=port, connected=False)))
    elif mode in ("invalid", "execute"):
        gateway = client()
        if mode == "invalid":
            token = Path("/run/secrets/gateway_token").read_text().strip()
            header, payload, signature = token.split(".")
            signature = ("A" if signature[0] != "A" else "B") + signature[1:]
            gateway = GatewayClient(os.environ["AGENTTRUST_GATEWAY_URL"],
                                    GatewayCredentials(header + "." + payload + "." + signature), timeout=3)
        try:
            tool = sys.argv[2] if mode == "execute" and len(sys.argv) > 2 else "http_status"
            kind = sys.argv[3] if mode == "execute" and len(sys.argv) > 3 else "http"
            result = gateway.execute(tool, {}, kind=kind)
            print(json.dumps(dict(code="OK", outcome=result.outcome.value, invocation_id=result.invocation_id)))
        except GatewayError as error:
            print(json.dumps(dict(code=error.code, outcome=error.outcome.value, invocation_id=error.invocation_id)))
    else:
        raise SystemExit("unsupported probe")


if __name__ == "__main__":
    main()
