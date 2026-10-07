"""Contracts for independently implemented agent modules."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentModule:
    id: str
    name: str
    description: str
    instructions: str
    tools: tuple[Any, ...] = ()
    routing_keywords: tuple[str, ...] = ()
    default_for_auto: bool = False
    trusted_tool_arguments: dict[str, str] | None = None
    source_tools: tuple[str, ...] = ()


__all__ = ["AgentModule"]
