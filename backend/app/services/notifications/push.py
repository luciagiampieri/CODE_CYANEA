import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)

EXPO_PUSH_CHUNK_SIZE = 100


@dataclass(slots=True)
class ExpoPushTicket:
    token: str
    status: str | None
    ticket_id: str | None = None
    message: str | None = None
    error: str | None = None


class ExpoPushClient:
    """Cliente HTTP minimo para enviar push notifications via Expo."""

    def __init__(self, push_url: str | None = None, access_token: str | None = None) -> None:
        self.push_url = push_url or settings.expo_push_url
        self.access_token = access_token or settings.expo_push_access_token

    async def send_messages(self, messages: list[dict[str, Any]]) -> list[ExpoPushTicket]:
        if not settings.push_enabled or not messages:
            return []

        tickets: list[ExpoPushTicket] = []
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        async with httpx.AsyncClient(timeout=10) as client:
            for chunk in _chunk_messages(messages):
                try:
                    response = await client.post(self.push_url, json=chunk, headers=headers)
                    response.raise_for_status()
                    payload = response.json()
                except Exception as error:
                    logger.warning("No se pudo enviar push a Expo: %s", error)
                    tickets.extend(
                        ExpoPushTicket(
                            token=str(message.get("to", "")),
                            status="error",
                            message=str(error),
                        )
                        for message in chunk
                    )
                    continue

                tickets.extend(_parse_tickets(chunk, payload))

        return tickets


def _chunk_messages(messages: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    return [
        messages[index : index + EXPO_PUSH_CHUNK_SIZE]
        for index in range(0, len(messages), EXPO_PUSH_CHUNK_SIZE)
    ]


def _parse_tickets(messages: list[dict[str, Any]], payload: Any) -> list[ExpoPushTicket]:
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        data_items = [data]
    elif isinstance(data, list):
        data_items = data
    else:
        data_items = []

    tickets: list[ExpoPushTicket] = []
    for index, message in enumerate(messages):
        item = data_items[index] if index < len(data_items) and isinstance(data_items[index], dict) else {}
        details = item.get("details") if isinstance(item.get("details"), dict) else {}
        tickets.append(
            ExpoPushTicket(
                token=str(message.get("to", "")),
                status=item.get("status"),
                ticket_id=item.get("id"),
                message=item.get("message"),
                error=details.get("error"),
            )
        )

    return tickets
