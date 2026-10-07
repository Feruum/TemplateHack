"""Live backend API tools for the StudyVerse EMS.

These tools query the Go backend via Connect-RPC for real-time
data that changes frequently: events, organizations, rooms, bookings.
"""

from typing import Optional

import structlog
from langchain_core.tools import tool

from agent.integrations import backend

logger = structlog.get_logger(__name__)


def _format_event(e: dict) -> str:
    title = e.get("title", "Untitled")
    start = e.get("startTime", "?")
    end = e.get("endTime", "?")
    status = e.get("status", "?")
    fmt = e.get("format", "?")
    org = e.get("organization", {}).get("title", "")
    cat = e.get("category", {}).get("name") or e.get("category", {}).get("title", "")
    image_url = e.get("imageUrl", "")
    event_id = e.get("id")
    regs = e.get("totalRegistrations", 0)
    loc = e.get("structuredLocation", {})
    location = loc.get("roomName") or loc.get("address") or ""

    parts = [f"**{title}**"]
    if org:
        parts.append(f"  Org: {org}")
    if cat:
        parts.append(f"  Category: {cat}")
    parts.append(f"  When: {start} → {end}")
    parts.append(f"  Format: {fmt} | Status: {status} | Registrations: {regs}")
    if location:
        parts.append(f"  Location: {location}")
    if image_url:
        parts.append(f"  Image URL: {image_url}")
    if event_id:
        parts.append(f"  Event ID: {event_id}")
    return "\n".join(parts)


def _format_org(o: dict) -> str:
    title = o.get("title", "Untitled")
    desc = o.get("description") or ""
    status = o.get("status", "?")
    slug = o.get("slug", "")
    socials = []
    for key in (
        "instagram",
        "telegramChannel",
        "telegramChat",
        "website",
        "youtube",
        "tiktok",
        "linkedin",
    ):
        val = o.get(key)
        if val:
            socials.append(f"  {key}: {val}")

    parts = [f"**{title}** (slug: {slug}, status: {status})"]
    if desc:
        parts.append(f"  {desc[:200]}")
    if socials:
        parts.extend(socials)
    return "\n".join(parts)


def _format_room(r: dict) -> str:
    name = r.get("name", "?")
    number = r.get("roomNumber", "")
    block = r.get("block", "")
    floor = r.get("floor", "?")
    cap = r.get("capacity")
    bookable = r.get("isBookable", False)
    features = r.get("features", [])
    desc = r.get("description") or ""

    parts = [f"**{name}** (#{number}, Block {block}, Floor {floor})"]
    if cap:
        parts.append(f"  Capacity: {cap}")
    parts.append(f"  Bookable: {'Yes' if bookable else 'No'}")
    if features:
        parts.append(f"  Features: {', '.join(features)}")
    if desc:
        parts.append(f"  {desc[:150]}")
    return "\n".join(parts)


@tool
def search_campus(query: str) -> str:
    """Search across all campus entities (events, organizations, rooms) in real time.

    Use this for broad searches like 'hackathon', 'IT club', or '3rd floor lab'.
    Returns unified results from the StudyVerse backend.

    Args:
        query: The search query string.

    Returns:
        Search results from events, organizations, and rooms.
    """
    result = backend.global_search(query)

    if "error" in result:
        return f"Search failed: {result['error']}"

    events = result.get("events", [])
    orgs = result.get("organizations", [])
    rooms = result.get("rooms", [])

    if not events and not orgs and not rooms:
        return f"No results found for '{query}'."

    parts = []
    if events:
        parts.append(f"**Events ({len(events)}):**")
        parts.extend(f"  - {_format_event(e)}" for e in events[:5])
    if orgs:
        parts.append(f"**Organizations ({len(orgs)}):**")
        parts.extend(f"  - {_format_org(o)}" for o in orgs[:5])
    if rooms:
        parts.append(f"**Rooms ({len(rooms)}):**")
        parts.extend(f"  - {_format_room(r)}" for r in rooms[:5])

    return "\n\n".join(parts)


@tool
def fetch_events(
    page: int = 1,
    limit: int = 5,
    organization_id: Optional[int] = None,
    category_id: Optional[int] = None,
    status: Optional[str] = None,
) -> str:
    """List upcoming and current campus events from the live backend.

    Use this to find events by status, organization, or category.
    Status values: EVENT_STATUS_DRAFT, EVENT_STATUS_PUBLISHED, EVENT_STATUS_ACTIVE,
    EVENT_STATUS_COMPLETED, EVENT_STATUS_CANCELLED.

    Args:
        page: Page number (1-indexed).
        limit: Results per page (max 20).
        organization_id: Filter by organization ID.
        category_id: Filter by category ID.
        status: Filter by event status.

    Returns:
        List of events with details.
    """
    limit = min(limit, 20)
    result = backend.list_events(
        page=page,
        limit=limit,
        organization_id=organization_id,
        category_id=category_id,
        status=status,
    )

    if "error" in result:
        return f"Failed to fetch events: {result['error']}"

    events = result.get("events", [])
    total = result.get("total", 0)

    if not events:
        return "No events found matching the criteria."

    header = f"Found {total} event(s)"
    if total > limit:
        header += f" (showing page {page}, {limit} per page)"
    header += ":"

    entries = []
    for i, e in enumerate(events, 1):
        entries.append(f"{i}. {_format_event(e)}")

    return header + "\n\n" + "\n\n".join(entries)


@tool
def fetch_organizations(page: int = 1, limit: int = 10) -> str:
    """List campus organizations (clubs, departments, committees) from the live backend.

    Use this when the user asks about clubs, student organizations, or departments.

    Args:
        page: Page number (1-indexed).
        limit: Results per page (max 30).

    Returns:
        List of organizations with details.
    """
    limit = min(limit, 30)
    result = backend.list_organizations(page=page, limit=limit)

    if "error" in result:
        return f"Failed to fetch organizations: {result['error']}"

    orgs = result.get("organizations", [])
    total = result.get("total", 0)

    if not orgs:
        return "No organizations found."

    header = f"Found {total} organization(s)"
    if total > limit:
        header += f" (showing page {page}, {limit} per page)"
    header += ":"

    entries = []
    for i, o in enumerate(orgs, 1):
        entries.append(f"{i}. {_format_org(o)}")

    return header + "\n\n" + "\n\n".join(entries)


@tool
def fetch_rooms(
    floor: Optional[int] = None,
    block: Optional[str] = None,
    bookable_only: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> str:
    """Search campus rooms from the live backend.

    Use this to find rooms by floor, block, or name. Set bookable_only=True
    to only show rooms that accept booking requests.

    Args:
        floor: Floor number filter (1-3).
        block: Building block filter (e.g. 'A', 'B').
        bookable_only: Only show bookable rooms.
        search: Room name or number search.
        page: Page number (1-indexed).
        limit: Results per page (max 30).

    Returns:
        List of rooms with details.
    """
    limit = min(limit, 30)
    result = backend.list_rooms(
        floor=floor,
        block=block,
        bookable_only=bookable_only,
        search=search,
        page=page,
        limit=limit,
    )

    if "error" in result:
        return f"Failed to fetch rooms: {result['error']}"

    rooms = result.get("rooms", [])
    total = result.get("total", 0)

    if not rooms:
        return "No rooms found matching the criteria."

    header = f"Found {total} room(s)"
    if total > limit:
        header += f" (showing page {page}, {limit} per page)"
    header += ":"

    entries = []
    for i, r in enumerate(rooms, 1):
        entries.append(f"{i}. {_format_room(r)}")

    return header + "\n\n" + "\n\n".join(entries)


@tool
def fetch_room_availability(room_id: str, date: str) -> str:
    """Check real-time availability for a specific room on a given date.

    Use this when a user wants to know if a room is free or booked at certain times.
    Requires the room ID and date in YYYY-MM-DD format.

    Args:
        room_id: The room ID (from fetch_rooms results).
        date: The date to check in YYYY-MM-DD format.

    Returns:
        Time slot availability for the room.
    """
    result = backend.get_room_availability(room_id=room_id, date=date)

    if "error" in result:
        return f"Failed to check availability: {result['error']}"

    slots = result.get("slots", [])
    if not slots:
        return f"No schedule data available for room {room_id} on {date}."

    available = []
    booked = []
    for slot in slots:
        start = slot.get("startTime", "?")
        end = slot.get("endTime", "?")
        is_avail = slot.get("isAvailable", True)
        booking = slot.get("booking", {})
        line = f"  {start} – {end}"
        if is_avail:
            available.append(f"✓ {line}")
        else:
            title = booking.get("title", "Booked")
            booked.append(f"✗ {line} ({title})")

    parts = [f"**Room {room_id} — {date}**"]
    if available:
        parts.append(f"\nAvailable ({len(available)}):")
        parts.extend(available)
    if booked:
        parts.append(f"\nBooked ({len(booked)}):")
        parts.extend(booked)

    return "\n".join(parts)


@tool
def create_booking_request(
    room_id: str,
    title: str,
    start_time: str,
    end_time: str,
    organization_id: Optional[int] = None,
    description: Optional[str] = None,
    event_id: Optional[int] = None,
) -> str:
    """Submit a room booking request to the StudyVerse backend.

    Use this when a user wants to book a room. Times must be ISO 8601 format.
    The request may be auto-approved or require staff review depending on room policy.

    Args:
        room_id: The room ID to book.
        title: Title/purpose for the booking.
        start_time: Start time in ISO 8601 (e.g. '2025-05-12T09:00:00Z').
        end_time: End time in ISO 8601 (e.g. '2025-05-12T11:00:00Z').
        organization_id: Organization ID on behalf of which the booking is made.
        description: Optional description of the booking purpose.
        event_id: Optional event ID if booking for a specific event.

    Returns:
        Booking request confirmation with status.
    """
    result = backend.create_booking_request(
        room_id=room_id,
        title=title,
        start_time=start_time,
        end_time=end_time,
        organization_id=organization_id,
        description=description,
        event_id=event_id,
    )

    if "error" in result:
        return f"Booking request failed: {result['error']}"

    br = result.get("bookingRequest", {})
    auto = result.get("autoApproved", False)
    conflicts = result.get("existingConflicts", [])
    booking = result.get("booking")

    status = br.get("status", "UNKNOWN")
    br_id = br.get("id", "?")

    parts = [f"**Booking Request #{br_id}**"]
    parts.append(f"  Room: {room_id}")
    parts.append(f"  Title: {title}")
    parts.append(f"  Time: {start_time} → {end_time}")
    parts.append(f"  Status: {status}")

    if auto:
        parts.append("  ✅ Auto-approved!")
    else:
        parts.append("  ⏳ Pending staff review.")

    if booking:
        parts.append(f"  Booking confirmed: #{booking.get('id', '?')}")

    if conflicts:
        parts.append(f"  ⚠ Conflicts with {len(conflicts)} existing booking(s)")

    return "\n".join(parts)
