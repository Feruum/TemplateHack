"""Tool registry for the agent."""

from agent.tools.retrieval import search_knowledge, search_user_memory, save_to_memory
from agent.tools.api import (
    search_campus,
    fetch_events,
    fetch_organizations,
    fetch_rooms,
    fetch_room_availability,
    create_booking_request,
)


def get_tools() -> list:
    """Get all available tools.

    Returns:
        List of LangChain tools.
    """
    return [
        search_knowledge,
        search_user_memory,
        save_to_memory,
        search_campus,
        fetch_events,
        fetch_organizations,
        fetch_rooms,
        fetch_room_availability,
        create_booking_request,
    ]
