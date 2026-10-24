"""Real slow-drip socket tests; I/O continues within its individual timeout."""
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time

import pytest

from test_gateway import credential, INVOCATION
from agenttrust.gateway import GatewayClient, GatewayCredentials, GatewayTool, GatewayTimeout, ExecutionOutcome


@pytest.mark.parametrize("adapter", ["sync", "async", "langchain_sync", "langchain_async", "mcp"])
def test_total_deadline_stops_slow_drip_and_preserves_invocation(adapter):
    calls = []
    class Drip(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            calls.append(1)
            self.rfile.read(int(self.headers["Content-Length"]))
            body = b'{"content":[],"value":"' + b"x" * 100 + b'"}'
            self.send_response(200)
            for key, value in {
                "Content-Type": "application/json", "Content-Length": str(len(body)),
                "X-Request-ID": self.headers["X-Request-ID"], "X-Invocation-ID": INVOCATION,
                "X-AgentTrust-Version": "1", "X-AgentTrust-Response-Kind": "mcp_result",
                "X-AgentTrust-Authorization": "ALLOW", "X-AgentTrust-Execution": "SUCCEEDED",
            }.items():
                self.send_header(key, value)
            self.end_headers()
            for value in body:
                try:
                    self.wfile.write(bytes([value])); self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
                time.sleep(0.02)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Drip)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        gateway = GatewayClient(f"http://127.0.0.1:{server.server_port}", GatewayCredentials(credential()),
                                allow_local_http=True, timeout=0.15)
        run = gateway.bind({"drip": GatewayTool("drip", "mcp")})
        def schema() -> dict:
            """A remote schema only."""
            pytest.fail("local fallback")
        if adapter.startswith("langchain"):
            pytest.importorskip("langchain_core")
            from agenttrust.langchain import as_gateway_langchain_tool
            tool = as_gateway_langchain_tool(run, "drip", schema)
        start = time.monotonic()
        with pytest.raises(GatewayTimeout) as raised:
            if adapter == "sync":
                run.execute("drip", {})
            elif adapter == "async":
                asyncio.run(run.aexecute("drip", {}))
            elif adapter == "langchain_sync":
                tool.invoke({})
            elif adapter == "langchain_async":
                asyncio.run(tool.ainvoke({}))
            else:
                from agenttrust.mcp import GatewayMCPClient
                asyncio.run(GatewayMCPClient(run).call_tool("drip", {}))
        assert time.monotonic() - start < 0.65  # Complete body takes over two seconds.
        assert raised.value.outcome == ExecutionOutcome.UNKNOWN
        assert raised.value.invocation_id == INVOCATION
        assert calls == [1]
    finally:
        server.shutdown(); server.server_close(); worker.join(timeout=2)
