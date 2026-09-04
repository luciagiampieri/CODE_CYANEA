from __future__ import annotations
from dataclasses import dataclass
from urllib.parse import quote
import httpx
from app.core.config import settings

GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places"
GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

SUGGESTION_TYPES = [
    "locality",
    "administrative_area_level_1",
    "country",
    "colloquial_area",
    "natural_feature",
]

@dataclass
class DestinationSuggestion:
    """Resultado liviano que se muestra mientras el usuario tipea."""
    name: str
    country: str | None
    place_id: str


@dataclass
class DestinationSearchResult:
    name: str
    country: str
    province_state: str | None
    lat: float | None
    lng: float | None
    place_id: str | None = None

_client: httpx.AsyncClient | None = None

def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=5.0)
    return _client

def build_destination_image_url(place_id: str | None) -> str | None:
    if not place_id:
        return None
    encoded_place_id = quote(place_id, safe="")
    return f"{settings.api_base_url}/trips/destination-photo?placeId={encoded_place_id}"


async def autocomplete_destinations(
    query: str,
    session_token: str | None = None,
    limit: int = 6,
) -> list[DestinationSuggestion]:
    """Sugerencias rápidas mientras el usuario tipea (prefix matching real)."""
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    payload: dict = {
        "input": query.strip(),
        "languageCode": "es",
        "includedPrimaryTypes": SUGGESTION_TYPES,
    }
    if session_token:
        payload["sessionToken"] = session_token

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
    }

    client = _get_client()
    response = await client.post(
        GOOGLE_PLACES_AUTOCOMPLETE_URL, headers=headers, json=payload
    )
    response.raise_for_status()
    data = response.json()
    suggestions: list[DestinationSuggestion] = []
    for prediction in data.get("suggestions", []):
        place_prediction = prediction.get("placePrediction")
        if not place_prediction or not place_prediction.get("placeId"):
            continue
        structured = place_prediction.get("structuredFormat", {})
        main_text = structured.get("mainText", {}).get("text")
        secondary_text = structured.get("secondaryText", {}).get("text")
        suggestions.append(
            DestinationSuggestion(
                name=main_text or place_prediction.get("text", {}).get("text", ""),
                country=secondary_text,
                place_id=f"google:{place_prediction['placeId']}",
            )
        )
        if len(suggestions) >= limit:
            break
    return suggestions

async def resolve_destination(
    place_id: str,
    session_token: str | None = None,
) -> DestinationSearchResult:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")
    raw_place_id = place_id.split(":", 1)[1] if place_id.startswith("google:") else place_id
    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,addressComponents",
    }
    params: dict = {"languageCode": "es"}
    if session_token:
        params["sessionToken"] = session_token
    client = _get_client()
    response = await client.get(
        f"{GOOGLE_PLACES_DETAILS_URL}/{raw_place_id}", headers=headers, params=params
    )
    response.raise_for_status()
    item = response.json()

    name = item.get("displayName", {}).get("text") or "Destino desconocido"
    address = item.get("formattedAddress") or name

    country = None
    province_state = None
    for component in item.get("addressComponents", []):
        types = component.get("types", [])
        if "country" in types and country is None:
            country = component.get("longText") or component.get("shortText")
        if "administrative_area_level_1" in types and province_state is None:
            province_state = component.get("longText") or component.get("shortText")

    if country is None:
        parts = [segment.strip() for segment in address.split(",") if segment.strip()]
        country = parts[-1] if parts else name

    location = item.get("location", {})
    return DestinationSearchResult(
        name=name,
        country=country,
        province_state=province_state,
        lat=location.get("latitude"),
        lng=location.get("longitude"),
        place_id=f"google:{item.get('id')}" if item.get("id") else None,
    )

async def search_destinations(query: str, limit: int = 1) -> list[DestinationSearchResult]:
   

    """Se mantiene SOLO como fallback interno (ej: resolver la portada de un
        viaje si por algún motivo no vino placeId). No usar para autocompletado."""
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents",
    }
    payload = {"textQuery": query.strip(), "languageCode": "es", "maxResultCount": limit}
    
    client = _get_client()
    response = await client.post(GOOGLE_PLACES_TEXT_SEARCH_URL, headers=headers, json=payload)
    response.raise_for_status()
    data = response.json()
    results: list[DestinationSearchResult] = []
    
    for item in data.get("places", [])[:limit]:
        name = item.get("displayName", {}).get("text") or "Destino desconocido"
        address = item.get("formattedAddress") or name

        country = None
        province_state = None
        for component in item.get("addressComponents", []):
            types = component.get("types", [])
            if "country" in types and country is None:
                country = component.get("longText") or component.get("shortText")
            if "administrative_area_level_1" in types and province_state is None:
                province_state = component.get("longText") or component.get("shortText")

        if country is None:
            parts = [s.strip() for s in address.split(",") if s.strip()]
            country = parts[-1] if parts else name

        location = item.get("location", {})
        results.append(
            DestinationSearchResult(
                name=name,
                country=country,
                province_state=province_state,
                lat=location.get("latitude"),
                lng=location.get("longitude"),
                place_id=f"google:{item.get('id')}" if item.get("id") else None,
            )
        )
    return results