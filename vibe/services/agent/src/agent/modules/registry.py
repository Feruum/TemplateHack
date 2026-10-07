"""Central registry and automatic router for pluggable agent modules."""

from agent.modules.base import AgentModule
from agent.modules.rag import RAG_MODULE


class UnknownModuleError(ValueError):
    """Raised when a client requests a module that is not enabled."""


def get_modules() -> tuple[AgentModule, ...]:
    """Return enabled module definitions. Register new modules in this list."""
    return (RAG_MODULE,)


def module_catalog() -> list[dict[str, str]]:
    return [
        {"id": module.id, "name": module.name, "description": module.description}
        for module in get_modules()
    ]


def select_module(message: str, requested_id: str | None = None) -> AgentModule:
    """Select an explicit module or route by module keywords and default."""
    modules = get_modules()
    if requested_id:
        for module in modules:
            if module.id == requested_id:
                return module
        raise UnknownModuleError(requested_id)
    if not modules:
        raise UnknownModuleError("No agent modules are enabled")

    normalized = message.casefold()
    scores = [
        (sum(1 for keyword in module.routing_keywords if keyword.casefold() in normalized), module)
        for module in modules
    ]
    best_score = max(score for score, _ in scores)
    if best_score:
        return next(module for score, module in scores if score == best_score)
    return next((module for module in modules if module.default_for_auto), modules[0])


def get_module(module_id: str) -> AgentModule:
    return select_module("", requested_id=module_id)


__all__ = ["UnknownModuleError", "get_module", "get_modules", "module_catalog", "select_module"]
