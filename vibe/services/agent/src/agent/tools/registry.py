"""Compatibility helper exposing tools from the enabled module registry."""

from agent.modules.registry import get_modules, select_module


def get_tools(module_id: str | None = None) -> list:
    """Return only the tools registered for one enabled module."""
    if module_id:
        return list(select_module("", module_id).tools)
    modules = get_modules()
    if not modules:
        return []
    module = next((item for item in modules if item.default_for_auto), modules[0])
    return list(module.tools)
