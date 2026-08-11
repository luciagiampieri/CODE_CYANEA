from __future__ import annotations

from dataclasses import dataclass
import math

import httpx

from app.core.config import settings

GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
GOOGLE_PLACE_PHOTO_MEDIA_URL = "https://places.googleapis.com/v1/{photo_name}/media"


@dataclass
class PlaceSearchResult:
    place_id: str
    name: str
    address: str
    country: str
    admin_area: str | None
    lat: float | None
    lng: float | None
    category: str | None = None
    provider: str | None = None
    metadata: dict | None = None
    rating: float | None = None
    user_ratings_total: int | None = None
    popularity_score: float | None = None


@dataclass
class PopularPlacesResponse:
    context_label: str | None
    items: list[PlaceSearchResult]


@dataclass
class PlaceReviewResult:
    author_name: str
    author_url: str | None
    profile_photo_url: str | None
    rating: float | None
    publish_time: str | None
    text: str | None
    relative_publish_time_description: str | None


@dataclass
class PlaceDetailsResult:
    place_id: str
    name: str
    address: str
    category: str | None
    rating: float | None
    user_ratings_total: int | None
    google_maps_uri: str | None
    reviews: list[PlaceReviewResult]


async def search_trip_places(query: str, allowed_regions: list[dict[str, str | None]], limit: int = 8) -> list[PlaceSearchResult]:
    data = await _google_places_text_search(
        {
            "textQuery": query,
            "languageCode": "es",
            "maxResultCount": limit,
        },
        field_mask=(
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.location,"
            "places.types,"
            "places.googleMapsUri"
        ),
    )

    results = _parse_google_places_results(data)

    enriched_results = []

    for result in results:
        enriched_result = await _enrich_place_location(result)

        if is_place_allowed(enriched_result, allowed_regions):
            enriched_results.append(enriched_result)

    return enriched_results[:limit]


def is_place_allowed(
    place: PlaceSearchResult,
    allowed_regions: list[dict[str, str | None]],
) -> bool:
    if not place.country:
        return False

    place_country = place.country.strip().lower()
    place_admin_area = (
        place.admin_area.strip().lower()
        if place.admin_area
        else None
    )

    for region in allowed_regions:
        allowed_country = region["country"]
        allowed_admin_area = region["admin_area"]

        if not allowed_country:
            continue

        if place_country != allowed_country.strip().lower():
            continue

        # Si el destino tiene provincia/estado/región,
        # el lugar debe pertenecer a esa misma región.
        if allowed_admin_area:
            if not place_admin_area:
                continue

            if place_admin_area == allowed_admin_area.strip().lower():
                return True

        # Si no pudimos determinar una región para el destino,
        # por ahora permitimos por país.
        else:
            return True

    return False


async def search_popular_places(lat: float, lng: float, limit: int = 6) -> PopularPlacesResponse:
    context_label = await _reverse_geocode_context(lat, lng)
    query = f"atracciones turisticas en {context_label}" if context_label else "atracciones turisticas"
    data = await _google_places_text_search(
        {
            "textQuery": query,
            "languageCode": "es",
            "maxResultCount": limit,
            "locationBias": {
                "circle": {
                    "center": {
                        "latitude": lat,
                        "longitude": lng,
                    },
                    "radius": 7000.0,
                }
            },
        },
        field_mask=(
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.location,"
            "places.types,"
            "places.googleMapsUri,"
            "places.rating,"
            "places.userRatingCount,"
            "places.primaryType,"
            "places.primaryTypeDisplayName"
        ),
    )
    items = _parse_google_places_results(data)
    ranked = sorted(
        items,
        key=lambda item: item.popularity_score or 0,
        reverse=True,
    )[:limit]
    return PopularPlacesResponse(context_label=context_label, items=ranked)


async def get_place_details(place_id: str) -> PlaceDetailsResult:
    raw_place_id = place_id.replace("google:", "", 1)
    data = await _google_place_details(raw_place_id)
    return _parse_place_details(data)


async def get_place_photo_uri(place_id: str, max_width_px: int = 1600) -> str | None:
    raw_place_id = place_id.replace("google:", "", 1)
    photo_name = await _get_first_photo_name(raw_place_id)
    if not photo_name:
        return None
    return await _get_photo_uri(photo_name, max_width_px=max_width_px)


async def _google_places_text_search(payload: dict, field_mask: str) -> dict:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": field_mask,
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.post(
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        return response.json()


async def _google_place_details(place_id: str) -> dict:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": (
            "id,"
            "displayName,"
            "formattedAddress,"
            "primaryType,"
            "primaryTypeDisplayName,"
            "rating,"
            "userRatingCount,"
            "googleMapsUri,"
            "reviews"
        ),
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.get(
            GOOGLE_PLACE_DETAILS_URL.format(place_id=place_id),
            headers=headers,
        )
        response.raise_for_status()
        return response.json()


async def _get_first_photo_name(place_id: str) -> str | None:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "photos",
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.get(
            GOOGLE_PLACE_DETAILS_URL.format(place_id=place_id),
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()

    photos = data.get("photos") or []
    if not photos:
        return None
    return photos[0].get("name")


async def _get_photo_uri(photo_name: str, max_width_px: int = 1600) -> str | None:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
    }
    params = {
        "maxWidthPx": max_width_px,
        "skipHttpRedirect": "true",
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.get(
            GOOGLE_PLACE_PHOTO_MEDIA_URL.format(photo_name=photo_name),
            headers=headers,
            params=params,
        )
        response.raise_for_status()
        data = response.json()

    return data.get("photoUri")


async def _reverse_geocode_context(lat: float, lng: float) -> str | None:
    params = {
        "latlng": f"{lat},{lng}",
        "language": "es",
        "key": settings.google_maps_api_key,
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.get(GOOGLE_GEOCODE_URL, params=params)
        response.raise_for_status()
        data = response.json()

    for result in data.get("results", []):
        city = _extract_address_component(
            result.get("address_components", []),
            {"locality", "administrative_area_level_2", "postal_town"},
        )
        if city:
            return city

    return None


async def _reverse_geocode_location(
    lat: float,
    lng: float,
) -> dict[str, str | None]:
    params = {
        "latlng": f"{lat},{lng}",
        "language": "es",
        "key": settings.google_maps_api_key,
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.get(
            GOOGLE_GEOCODE_URL,
            params=params,
        )
        response.raise_for_status()
        data = response.json()

    country = None
    admin_area = None

    for result in data.get("results", []):
        for component in result.get("address_components", []):
            component_types = set(component.get("types") or [])

            if "country" in component_types:
                country = component.get("long_name")

            if "administrative_area_level_1" in component_types:
                admin_area = component.get("long_name")

        if country and admin_area:
            break

    return {
        "country": country,
        "admin_area": admin_area,
    }


def get_trip_allowed_regions(viaje) -> list[dict[str, str | None]]:
    allowed_regions: list[dict[str, str | None]] = []

    for relacion in viaje.Destinos:
        destino = relacion.Destino

        if not destino.Pais:
            continue

        region = {
            "country": destino.Pais,
            "admin_area": destino.ProvinciaEstado,
        }

        if region not in allowed_regions:
            allowed_regions.append(region)

    return allowed_regions


def _extract_address_component(components: list[dict], accepted_types: set[str]) -> str | None:
    for component in components:
        component_types = set(component.get("types") or [])
        if component_types & accepted_types:
            return component.get("long_name")
    return None


def _parse_google_places_results(data: dict) -> list[PlaceSearchResult]:
    seen: set[tuple[str, str]] = set()
    results: list[PlaceSearchResult] = []

    for item in data.get("places", []):
        name = item.get("displayName", {}).get("text") or "Lugar desconocido"
        address = item.get("formattedAddress") or name
        parts = [segment.strip() for segment in address.split(",") if segment.strip()]
        country = parts[-1] if parts else "Pais desconocido"
        location = item.get("location", {})
        key = (name, address)
        if key in seen:
            continue
        seen.add(key)

        types = item.get("types") or []
        primary_type = item.get("primaryTypeDisplayName", {}).get("text") or item.get("primaryType")
        rating = item.get("rating")
        user_ratings_total = item.get("userRatingCount")

        results.append(
            PlaceSearchResult(
                place_id=f"google:{item.get('id')}",
                name=name,
                address=address,
                country=country,
                admin_area=None,
                lat=location.get("latitude"),
                lng=location.get("longitude"),
                category=primary_type or (types[0] if types else None),
                provider="google_places",
                metadata={
                    "types": types,
                    "googleMapsUri": item.get("googleMapsUri"),
                },
                rating=rating,
                user_ratings_total=user_ratings_total,
                popularity_score=_calculate_popularity_score(rating, user_ratings_total),
            )
        )

    return results


async def _enrich_place_location(
    result: PlaceSearchResult,
) -> PlaceSearchResult:
    if result.lat is None or result.lng is None:
        return result

    location = await _reverse_geocode_location(
        result.lat,
        result.lng,
    )

    result.country = location.get("country") or result.country
    result.admin_area = location.get("admin_area")

    return result


def _parse_place_details(data: dict) -> PlaceDetailsResult:
    reviews: list[PlaceReviewResult] = []
    for review in data.get("reviews", [])[:3]:
        author = review.get("authorAttribution") or {}
        text_payload = review.get("text")
        review_text = None
        if isinstance(text_payload, dict):
            review_text = text_payload.get("text")
        elif isinstance(text_payload, str):
            review_text = text_payload

        relative_description = review.get("relativePublishTimeDescription")
        if not relative_description and review.get("relativePublishTimeDescriptionText"):
          relative_description = review.get("relativePublishTimeDescriptionText")

        reviews.append(
            PlaceReviewResult(
                author_name=author.get("displayName") or "Usuario Google",
                author_url=author.get("uri"),
                profile_photo_url=author.get("photoUri"),
                rating=review.get("rating"),
                publish_time=review.get("publishTime"),
                text=review_text,
                relative_publish_time_description=relative_description,
            )
        )

    category = data.get("primaryTypeDisplayName", {}).get("text") or data.get("primaryType")
    return PlaceDetailsResult(
        place_id=f"google:{data.get('id')}",
        name=data.get("displayName", {}).get("text") or "Lugar desconocido",
        address=data.get("formattedAddress") or "",
        category=category,
        rating=data.get("rating"),
        user_ratings_total=data.get("userRatingCount"),
        google_maps_uri=data.get("googleMapsUri"),
        reviews=reviews,
    )


def _calculate_popularity_score(rating: float | None, user_ratings_total: int | None) -> float:
    safe_rating = rating or 0.0
    safe_total = max(user_ratings_total or 0, 0)
    if safe_rating <= 0 and safe_total <= 0:
        return 0.0

    return round((safe_rating * 25) + (math.log10(safe_total + 1) * 22), 2)
