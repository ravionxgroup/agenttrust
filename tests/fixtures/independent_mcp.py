"""Independent official MCP 2.x server, plus explicit negative-wire fault injection.

Normal requests go through the installed MCPServer and HTTP transport unchanged.
No AgentTrust modules are imported by this process.
"""
import asyncio
from collections import Counter
import json
import sys

from mcp.server.mcpserver import MCPServer
from mcp import types
import uvicorn
from pydantic import BaseModel

server = MCPServer("agenttrust-independent-interop")
counts = Counter()
observed = []


class Customer(BaseModel):
    customer_id: int
    source: str


@server.tool(structured_output=True)
def structured(customer_id: int = 7) -> Customer:
    return Customer(customer_id=customer_id, source="independent-mcp")


@server.tool()
def application_error() -> types.CallToolResult:
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="input rejected")],
        structured_content={"reason": "validation"}, is_error=True,
    )


@server.tool()
async def slow() -> dict:
    await asyncio.sleep(0.25)
    return {"done": True}


app = server.streamable_http_app(json_response=True, stateless_http=True)


async def fixture(scope, receive, send):
    if scope["type"] != "http":
        return await app(scope, receive, send)
    if scope["path"] == "/counts":
        payload = json.dumps({"calls": dict(counts), "observed": observed}).encode()
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": payload})
        return
    messages, body = [], bytearray()
    while True:
        message = await receive()
        messages.append(message)
        body.extend(message.get("body", b""))
        if not message.get("more_body", False):
            break
    payload = json.loads(body)
    name = payload.get("params", {}).get("name", "<discovery>")
    counts[name] += 1
    headers = dict(scope["headers"])
    observed.append({"method": payload["method"], "version": headers.get(b"mcp-protocol-version", b"").decode(),
                     "session": b"mcp-session-id" in headers, "authorization": b"authorization" in headers})
    # Negative cases are explicitly fixture faults, not claimed as server behavior.
    faults = {
        "malformed": b'{"jsonrpc":',
        "wrong_id": json.dumps({"jsonrpc": "2.0", "id": "wrong-id", "result": {}}).encode(),
        "rpc_error": json.dumps({"jsonrpc": "2.0", "id": payload["id"], "error": {"code": -32602, "message": "T06_PRIVATE_RPC_SENTINEL"}}).encode(),
        "too_large": json.dumps({"jsonrpc": "2.0", "id": payload["id"], "result": {"content": [{"type": "text", "text": "x" * 8192}]}}).encode(),
    }
    if name in faults:
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": faults[name]})
        return
    if name == "rpc_from_server":
        # Have the independent server itself generate a JSON-RPC method error.
        payload["method"] = "unsupported/fixture-method"
        replacement = json.dumps(payload).encode()
        messages = [{"type": "http.request", "body": replacement, "more_body": False}]
        scope = dict(scope)
        scope["headers"] = [(k, b"unsupported/fixture-method" if k == b"mcp-method" else
                              str(len(replacement)).encode() if k == b"content-length" else v)
                             for k, v in scope["headers"]]
    async def replay():
        return messages.pop(0) if messages else await receive()
    await app(scope, replay, send)


if __name__ == "__main__":
    uvicorn.run(fixture, host="127.0.0.1", port=int(sys.argv[1]), log_level="error")
