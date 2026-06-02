"""
AgentTrust MCP adapter.

The MCP Python SDK exposes tool calls through an async ClientSession.call_tool()
shape. This module works against that small client surface instead of importing
MCP SDK types, keeping protocol churn isolated from the core AgentTrust SDK.

Scope convention:
  - Required scopes use AgentTrust's domain.action names, e.g. "crm.read".
  - If an MCP tool is already named with that convention, its name is the scope.
  - Otherwise, pass tool_scopes={"mcp_tool_name": "domain.action"} or declare
    the scope in tool metadata as {"agenttrust/scope": "domain.action"}.
"""
from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Optional

from . import AgentRun
from .audit import AuditEvent, redact_args


AGENTTRUST_SCOPE_META_KEY = "agenttrust/scope"


class MCPToolScopeError(Exception):
    """Raised when an MCP tool cannot be mapped to an AgentTrust scope."""


def _get_value(obj: Any, key: str) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key)
    return getattr(obj, key, None)


def _tool_name(tool: Any) -> Optional[str]:
    name = _get_value(tool, "name")
    if isinstance(name, str) and name:
        return name
    return None


def _metadata_containers(tool: Any) -> list[Any]:
    containers = [
        _get_value(tool, "_meta"),
        _get_value(tool, "meta"),
        _get_value(tool, "annotations"),
    ]
    model_extra = getattr(tool, "model_extra", None)
    if model_extra:
        containers.append(model_extra)
    return [c for c in containers if c]


def declared_scope_from_tool(tool: Any,
                             meta_key: str = AGENTTRUST_SCOPE_META_KEY) -> Optional[str]:
    """Extract an AgentTrust scope declaration from an MCP tool-like object."""
    for metadata in _metadata_containers(tool):
        value = _get_value(metadata, meta_key) or _get_value(metadata, "agenttrust_scope")
        if isinstance(value, str) and value:
            return value
    return None


@dataclass
class MCPToolScopeResolver:
    """Resolve MCP tool names into AgentTrust required scopes."""

    tool_scopes: Mapping[str, str] = field(default_factory=dict)
    default_to_tool_name: bool = True
    meta_key: str = AGENTTRUST_SCOPE_META_KEY

    def __post_init__(self) -> None:
        self.tool_scopes = dict(self.tool_scopes)

    def register_tools(self, tools: list[Any]) -> None:
        for tool in tools:
            name = _tool_name(tool)
            scope = declared_scope_from_tool(tool, self.meta_key)
            if name and scope:
                self.tool_scopes[name] = scope

    def resolve(self, tool_name: str) -> str:
        if tool_name in self.tool_scopes:
            return self.tool_scopes[tool_name]
        if self.default_to_tool_name:
            return tool_name
        raise MCPToolScopeError(
            f"no AgentTrust scope mapping found for MCP tool '{tool_name}'"
        )


class GuardedMCPClient:
    """Wrap an MCP client/session so call_tool() is authorized and audited."""

    def __init__(self, run: AgentRun, client: Any,
                 tool_scopes: Optional[Mapping[str, str]] = None,
                 scope_resolver: Optional[Callable[[str], str]] = None,
                 default_to_tool_name: bool = True):
        self._run = run
        self._client = client
        self._resolver = MCPToolScopeResolver(
            tool_scopes or {}, default_to_tool_name=default_to_tool_name
        )
        self._scope_resolver = scope_resolver

    def _scope_for(self, tool_name: str) -> str:
        if not isinstance(tool_name, str) or not tool_name:
            raise MCPToolScopeError("MCP tool name must be a non-empty string")
        if self._scope_resolver:
            scope = self._scope_resolver(tool_name)
        else:
            scope = self._resolver.resolve(tool_name)
        if not isinstance(scope, str) or not scope:
            raise MCPToolScopeError(f"MCP tool '{tool_name}' resolved to an invalid scope")
        return scope

    async def list_tools(self, *args, **kwargs) -> Any:
        result = self._client.list_tools(*args, **kwargs)
        if inspect.isawaitable(result):
            result = await result

        tools = _get_value(result, "tools")
        if tools is not None:
            self._resolver.register_tools(list(tools))
        return result

    async def load_tool_scopes(self) -> dict[str, str]:
        """Fetch tools from the MCP client and cache any declared scopes."""
        await self.list_tools()
        return dict(self._resolver.tool_scopes)

    async def call_tool(self, name: str, arguments: Optional[Mapping[str, Any]] = None,
                        **kwargs) -> Any:
        mcp_arguments = dict(arguments or {})

        try:
            required_scope = self._scope_for(name)
        except MCPToolScopeError:
            self._run._parent.audit.write(AuditEvent.make(
                agent_id=self._run.identity.agent_id,
                run_id=self._run.run_id,
                token_id=self._run.identity.token_id,
                tool=name,
                required_scope="<unresolved>",
                decision="deny",
                reason="no scope mapping for tool",
                args_redacted={"arguments": redact_args(mcp_arguments)},
            ))
            raise

        async def _invoke(arguments: dict[str, Any], **call_kwargs) -> Any:
            result = self._client.call_tool(name, arguments=arguments, **call_kwargs)
            if inspect.isawaitable(result):
                return await result
            return result

        _invoke.__name__ = name
        return await self._run.acall(required_scope, _invoke,
                                     arguments=mcp_arguments, **kwargs)


def wrap_mcp_client(run: AgentRun, client: Any,
                    tool_scopes: Optional[Mapping[str, str]] = None,
                    scope_resolver: Optional[Callable[[str], str]] = None,
                    default_to_tool_name: bool = True) -> GuardedMCPClient:
    """Return a guarded MCP client/session wrapper."""
    return GuardedMCPClient(
        run=run,
        client=client,
        tool_scopes=tool_scopes,
        scope_resolver=scope_resolver,
        default_to_tool_name=default_to_tool_name,
    )
