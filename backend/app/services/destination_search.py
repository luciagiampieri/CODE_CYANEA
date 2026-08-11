from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

import httpx

from app.core.config import settings

GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"


@dataclass
class DestinationSearchResult:
    name: str
    country: str
    province_state: str | None
    lat: float | None
    lng: float | None
    place_id: str | None = None


def build_destination_image_url(place_id: str | None) -> str | None:
    if not place_id:
        return None
    encoded_place_id = quote(place_id, safe="")
    return f"{settings.api_base_url}/trips/destination-photo?placeId={encoded_place_id}"


async def search_destinations(query: str, limit: int = 5) -> list[DestinationSearchResult]:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no está configurada")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": (
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.location,"
            "places.types,"
            "places.primaryType,"
            "places.primaryTypeDisplayName,"
            "places.addressComponents"
        ),
    }
    payload = {
        "textQuery": query.strip(),
        "languageCode": "es",
        "maxResultCount": limit,
        "includedType": "locality",
        "rankPreference": "RELEVANCE",
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.post(
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    return _parse_google_results(data.get("places", []), limit=limit)


def _parse_google_results(results: list[dict], limit: int) -> list[DestinationSearchResult]:
    parsed: list[DestinationSearchResult] = []
    seen: set[tuple[str, str]] = set()

    for item in results:
        name = item.get("displayName", {}).get("text") or "Destino desconocido"

        types = item.get("types", [])
        if "locality" not in types:
            continue

        address = item.get("formattedAddress") or name
        parts = [segment.strip() for segment in address.split(",") if segment.strip()]
        country = parts[-1] if parts else name
        province_state = None

        for component in item.get("addressComponents", []):
            types = component.get("types", [])

            if "administrative_area_level_1" in types:

                province_state = (
                    component.get("longText")
                    or component.get("shortText")
                )
                break

        location = item.get("location", {})

        key = (name, country)
        if key in seen:
            continue
        seen.add(key)

        parsed.append(
            DestinationSearchResult(
                name=name,
                country=country,
                province_state=province_state,
                lat=location.get("latitude"),
                lng=location.get("longitude"),
                place_id=f"google:{item.get('id')}" if item.get("id") else None,
            )
        )

    return parsed[:limit]
