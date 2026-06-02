"""
AgentTrust LangChain adapter.

Creates guarded LangChain StructuredTools that route every invocation through
AgentRun.call() / acall(), so each tool call is authorized against the agent's
scoped identity and written to the audit log.

Scope convention: same domain.action names as the core SDK ("crm.read", "ticket.*").

Usage:
    from agenttrust.langchain import as_langchain_tool, as_langchain_tools

    with at.start_run("support-agent") as run:
        tools = as_langchain_tools(run, [
            ("crm.read",     get_customer),
            ("ticket.create", create_ticket),
        ])
        # Pass tools to any LangChain agent or chain
        agent = create_react_agent(llm, tools, prompt)
"""
from __future__ import annotations

import functools
import inspect
from typing import Any, Callable, Optional

from . import AgentRun


def as_langchain_tool(
    run: AgentRun,
    scope: str,
    fn: Callable,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Any:
    """Wrap fn as a guarded LangChain StructuredTool.

    The tool's JSON schema is inferred from fn's type annotations (same as
    LangChain's @tool decorator). Every call is routed through run.call() so
    it is authorized and audited before fn executes.
    """
    try:
        from langchain_core.tools import StructuredTool
    except ImportError as exc:
        raise ImportError(
            "langchain-core is required for LangChain integration: "
            "pip install langchain-core"
        ) from exc

    tool_name = name or fn.__name__
    tool_description = (description or (fn.__doc__ or "").strip() or tool_name)

    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def _async_fn(*args: Any, **kwargs: Any) -> Any:
            return await run.acall(scope, fn, *args, **kwargs)

        return StructuredTool.from_function(
            coroutine=_async_fn,
            name=tool_name,
            description=tool_description,
        )

    @functools.wraps(fn)
    def _sync_fn(*args: Any, **kwargs: Any) -> Any:
        return run.call(scope, fn, *args, **kwargs)

    return StructuredTool.from_function(
        func=_sync_fn,
        name=tool_name,
        description=tool_description,
    )


def as_langchain_tools(run: AgentRun, tool_specs: list) -> list:
    """Convert a list of (scope, fn) or (scope, fn, name) or (scope, fn, name, desc) tuples.

    Example:
        tools = as_langchain_tools(run, [
            ("crm.read",      get_customer),
            ("ticket.create", create_ticket, "create_ticket", "Open a support ticket"),
        ])
    """
    result = []
    for spec in tool_specs:
        if len(spec) == 2:
            scope, fn = spec
            result.append(as_langchain_tool(run, scope, fn))
        elif len(spec) == 3:
            scope, fn, tool_name = spec
            result.append(as_langchain_tool(run, scope, fn, name=tool_name))
        elif len(spec) == 4:
            scope, fn, tool_name, desc = spec
            result.append(as_langchain_tool(run, scope, fn, name=tool_name, description=desc))
        else:
            raise ValueError(
                f"Each tool_spec must be a 2–4 element tuple, got {len(spec)} elements"
            )
    return result
