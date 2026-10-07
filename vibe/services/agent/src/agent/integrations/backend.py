"""StudyVerse EMS backend client via Connect-RPC HTTP/JSON."""

import structlog
import httpx

from agent.config.settings import settings

logger = structlog.get_logger(__name__)

_HEADERS = {
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
}

_client: httpx.Client | None = None


def _get_client() -> httpx.Client:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.Client(
            base_url=settings.ems_backend_url,
            headers=_HEADERS,
            timeout=15.0,
        )
    return _client


def _rpc(service_path: str, method: str, body: dict) -> dict:
    client = _get_client()
    url = f"/{service_path}/{method}"
    try:
        resp = client.post(url, json=body)
        if resp.status_code == 401:
            return {
                "error": "Authentication required. This action needs a logged-in user."
            }
        if resp.status_code >= 400:
            try:
                err = resp.json()
                return {
                    "error": err.get("message", f"Backend error {resp.status_code}")
                }
            except Exception:
                return {"error": f"Backend error {resp.status_code}: {resp.text[:200]}"}
        return resp.json()
    except httpx.ConnectError:
        return {"error": "Backend unavailable. Is the EMS server running?"}
    except httpx.TimeoutException:
        return {"error": "Backend request timed out."}
    except Exception as e:
        logger.exception("backend_rpc_error", path=url, error=str(e))
        return {"error": f"Backend call failed: {e}"}


def global_search(query: str) -> dict:
    return _rpc("search.v1.SearchService", "GlobalSearch", {"query": query})


def list_events(
    page: int = 1,
    limit: int = 10,
    organization_id: int | None = None,
    category_id: int | None = None,
    status: str | None = None,
) -> dict:
    body: dict = {"page": page, "limit": limit}
    if organization_id is not None:
        body["organizationId"] = organization_id
    if category_id is not None:
        body["categoryId"] = category_id
    if status is not None:
        body["status"] = status
    return _rpc("events.v1.EventsService", "ListEvents", body)


def list_organizations(page: int = 1, limit: int = 20) -> dict:
    return _rpc(
        "events.v1.OrganizationsService",
        "ListOrganizations",
        {"page": page, "limit": limit},
    )


def list_rooms(
    floor: int | None = None,
    block: str | None = None,
    bookable_only: bool | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    body: dict = {"page": page, "limit": limit}
    if floor is not None:
        body["floor"] = floor
    if block is not None:
        body["block"] = block
    if bookable_only is not None:
        body["bookableOnly"] = bookable_only
    if search is not None:
        body["search"] = search
    return _rpc("rooms.v1.RoomsService", "ListRooms", body)


def get_room_availability(room_id: str, date: str) -> dict:
    return _rpc(
        "rooms.v1.RoomsService",
        "GetRoomAvailability",
        {"roomId": room_id, "date": date},
    )


def create_booking_request(
    room_id: str,
    title: str,
    start_time: str,
    end_time: str,
    organization_id: int | None = None,
    description: str | None = None,
    event_id: int | None = None,
) -> dict:
    body: dict = {
        "roomId": room_id,
        "title": title,
        "startTime": start_time,
        "endTime": end_time,
    }
    if organization_id is not None:
        body["organizationId"] = organization_id
    if description is not None:
        body["description"] = description
    if event_id is not None:
        body["eventId"] = event_id
    return _rpc("rooms.v1.RoomsService", "CreateBookingRequest", body)
