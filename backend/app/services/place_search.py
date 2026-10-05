from __future__ import annotations

from dataclasses import dataclass
import math

import httpx

from app.core.config import settings

import unicodedata

from typing import Any, Dict, Optional

GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
GOOGLE_PLACE_PHOTO_MEDIA_URL = "https://places.googleapis.com/v1/{photo_name}/media"
GOOGLE_PLACES_NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client

    if _client is None:
        _client = httpx.AsyncClient(timeout=12.0, verify=False)

    return _client


CATEGORY_TYPE_MAP: dict[str, list[str]] = {
    "restaurantes": ["restaurant"],
    "cafeterias": ["cafe"],
    "atracciones": ["tourist_attraction"],
    "servicios": ["atm", "bank", "hospital", "pharmacy", "gas_station"],
}


@dataclass
class PlaceSuggestion:
    name: str
    address: str | None
    place_id: str

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


@dataclass
class NearbyPlaceResult:
    place_id: str
    name: str
    address: str
    lat: float | None
    lng: float | None
    category: str | None
    provider: str | None
    rating: float | None
    user_ratings_total: int | None
    distance_meters: float | None


"""async def search_trip_places(query: str, allowed_regions: list[dict[str, str | None]], limit: int = 8) -> list[PlaceSearchResult]:
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
            "places.googleMapsUri",
            
        ),
    )

    results = _parse_google_places_results(data)

    enriched_results = []

    for result in results:
        enriched_result = await _enrich_place_location(result)

        if is_place_allowed(enriched_result, allowed_regions):
            enriched_results.append(enriched_result)

    return enriched_results[:limit]"""

async def autocomplete_trip_places(
    query: str,
    allowed_regions: list[dict[str, str | float | None]],
    session_token: str | None = None,
    limit: int = 6,
) -> list[PlaceSuggestion]:

    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_maps_api_key,
        }

    client = _get_client()
    all_predictions = []

    regions = allowed_regions or [{}]

    for region in regions:
        payload: dict = {
            "input": query.strip(),
            "languageCode": "es",
        }

        if session_token:
            payload["sessionToken"] = session_token

        centro = await resolve_region_center(region) if region else None
        lat, lng = centro if centro else (None, None)

        if lat is not None and lng is not None:
            payload["locationBias"] = {
                "circle": {
                    "center": {
                        "latitude": lat,
                        "longitude": lng,
                    },
                    "radius": 50000.0,
                }
            }

        response = await client.post(
            GOOGLE_PLACES_AUTOCOMPLETE_URL,
            headers=headers,
            json=payload,
        )
        response.raise_for_status()

        data = response.json()

        all_predictions.extend(
            data.get("suggestions", [])
        )

    suggestions: list[PlaceSuggestion] = []
    seen_place_ids: set[str] = set()

    for prediction in all_predictions:
        place_prediction = prediction.get("placePrediction")

        if not place_prediction:
            continue

        place_id = place_prediction.get("placeId")

        if not place_id or place_id in seen_place_ids:
            continue

        seen_place_ids.add(place_id)

        structured = place_prediction.get("structuredFormat", {})

        main_text = structured.get("mainText", {}).get("text")
        secondary_text = structured.get("secondaryText", {}).get("text")

        suggestions.append(
            PlaceSuggestion(
                name=(
                    main_text
                    or place_prediction.get("text", {}).get("text", "")
                ),
                address=secondary_text,
                place_id=f"google:{place_id}",
            )
        )

        if len(suggestions) >= limit:
            break

    return suggestions

async def resolve_trip_place(
    place_id: str,
    allowed_regions: list[dict[str, str | float | None]],
    session_token: str | None = None,
) -> PlaceSearchResult:
    """Resuelve un lugar elegido por el usuario.

    `allowed_regions` se conserva para mantener el contrato con las rutas y el
    autocomplete, pero no se usa como bloqueo: un viaje puede incluir escapadas
    fuera del destino base.
    """

    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

    raw_place_id = (
        place_id.split(":", 1)[1]
        if place_id.startswith("google:")
        else place_id
    )

    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": (
            "id,"
            "displayName,"
            "formattedAddress,"
            "location,"
            "types,"
            "primaryType,"
            "primaryTypeDisplayName,"
            "rating,"
            "userRatingCount,"
            "googleMapsUri,"
            "addressComponents"
        ),
    }

    params: dict = {
        "languageCode": "es",
    }

    if session_token:
        params["sessionToken"] = session_token

    client = _get_client()

    response = await client.get(
        GOOGLE_PLACE_DETAILS_URL.format(place_id=raw_place_id),
        headers=headers,
        params=params,
    )

    response.raise_for_status()

    item = response.json()

    name = item.get("displayName", {}).get("text") or "Lugar desconocido"

    address = item.get("formattedAddress") or name

    country = None
    admin_area = None

    for component in item.get("addressComponents", []):
        types = component.get("types", [])

        if "country" in types and country is None:
            country = (
                component.get("longText")
                or component.get("shortText")
            )

        if (
            "administrative_area_level_1" in types
            and admin_area is None
        ):
            admin_area = (
                component.get("longText")
                or component.get("shortText")
            )

    location = item.get("location", {})

    types = item.get("types") or []

    primary_type = (
        item.get("primaryTypeDisplayName", {}).get("text")
        or item.get("primaryType")
    )

    result = PlaceSearchResult(
        place_id=f"google:{item.get('id')}",
        name=name,
        address=address,
        country=country or "",
        admin_area=admin_area,
        lat=location.get("latitude"),
        lng=location.get("longitude"),
        category=primary_type or (types[0] if types else None),
        provider="google_places",
        metadata={
            "types": types,
            "googleMapsUri": item.get("googleMapsUri"),
        },
        rating=item.get("rating"),
        user_ratings_total=item.get("userRatingCount"),
    )

    return result

"""async def search_trip_places(
    query: str,
    allowed_regions: list[dict[str, str | None]],
    limit: int = 8,
) -> list[PlaceSearchResult]:
    print("QUERY:", query)
    print("ALLOWED REGIONS:", allowed_regions)
    if not allowed_regions:
        print("SIN ALLOWED REGIONS -> devuelvo vacío")
        return []

    seen_ids: set[str] = set()
    all_results: list[PlaceSearchResult] = []

    for region in allowed_regions:
        payload = {
            "textQuery": query,
            "languageCode": "es",
            "maxResultCount": limit,
        }
        lat = region.get("lat")
        lng = region.get("lng")
        if lat is not None and lng is not None:
            payload["locationBias"] = {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": 30000.0,
                }
            }

        data = await _google_places_text_search(
            payload,
            field_mask=(
                "places.id,"
                "places.displayName,"
                "places.formattedAddress,"
                "places.location,"
                "places.types,"
                "places.googleMapsUri"
            ),
        )
        raw = _parse_google_places_results(data)
        print(f"REGION {region} -> {len(raw)} resultados crudos de Google")

        for result in raw:
            if result.place_id in seen_ids:
                continue
            enriched = await _enrich_place_location(result)
            allowed = is_place_allowed(enriched, allowed_regions)
            print(
                f"  '{enriched.name}' | country={enriched.country} admin_area={enriched.admin_area} "
                f"-> allowed={allowed}"
            )
            if allowed:
                seen_ids.add(enriched.place_id)
                all_results.append(enriched)
            if len(all_results) >= limit:
                break

    print("TOTAL FINAL:", len(all_results))
    return all_results[:limit]"""

def _normalize(text: str) -> str:
    text = text.strip().lower()
    return "".join(
        c for c in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(c)
    )

def is_place_allowed(
    place: PlaceSearchResult,
    allowed_regions: list[dict[str, str | None]],
) -> bool:
    if not place.country:
        return False

    """place_country = place.country.strip().lower()
    place_admin_area = (
        place.admin_area.strip().lower()
        if place.admin_area
        else None
    )"""

    place_country = _normalize(place.country)
    place_admin_area = (
        _normalize(place.admin_area)
        if place.admin_area
        else None
    )

    for region in allowed_regions:
        allowed_country = region["country"]
        allowed_admin_area = region["admin_area"]

        if not allowed_country:
            continue

        #if place_country != allowed_country.strip().lower():
            #continue
        
        if place_country != _normalize(allowed_country):
            continue

        # Si el destino tiene provincia/estado/región,
        # el lugar debe pertenecer a esa misma región.
        if allowed_admin_area:
            if not place_admin_area:
                continue

            if place_admin_area == _normalize(allowed_admin_area):
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


async def search_nearby_places(
    lat: float,
    lng: float,
    category: str | None = None,
    radius: float = 2000.0,
    limit: int = 20,
) -> list[NearbyPlaceResult]:
    included_types = CATEGORY_TYPE_MAP.get(category) if category else None

    payload: dict = {
        "maxResultCount": limit,
        "languageCode": "es",
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": radius,
            }
        },
    }
    if included_types:
        payload["includedTypes"] = included_types

    data = await _google_places_nearby_search(payload)
    return _parse_nearby_results(data, origin_lat=lat, origin_lng=lng)


async def _google_places_nearby_search(payload: dict) -> dict:
    if not settings.google_maps_api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY no esta configurada")

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
            "places.rating,"
            "places.userRatingCount"
        ),
    }

    async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
        response = await client.post(
            GOOGLE_PLACES_NEARBY_SEARCH_URL,
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        return response.json()


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_m = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(a))


def _parse_nearby_results(data: dict, origin_lat: float, origin_lng: float) -> list[NearbyPlaceResult]:
    results: list[NearbyPlaceResult] = []

    for item in data.get("places", []):
        name = item.get("displayName", {}).get("text") or "Lugar desconocido"
        address = item.get("formattedAddress") or name
        location = item.get("location", {})
        lat = location.get("latitude")
        lng = location.get("longitude")

        distance_meters = None
        if lat is not None and lng is not None:
            distance_meters = round(_haversine_meters(origin_lat, origin_lng, lat, lng), 1)

        types = item.get("types") or []
        primary_type = item.get("primaryTypeDisplayName", {}).get("text") or item.get("primaryType")

        results.append(
            NearbyPlaceResult(
                place_id=f"google:{item.get('id')}",
                name=name,
                address=address,
                lat=lat,
                lng=lng,
                category=primary_type or (types[0] if types else None),
                provider="google_places",
                rating=item.get("rating"),
                user_ratings_total=item.get("userRatingCount"),
                distance_meters=distance_meters,
            )
        )

    results.sort(key=lambda place: (place.distance_meters is None, place.distance_meters or 0))
    return results

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


"""def get_trip_allowed_regions(viaje) -> list[dict[str, str | None]]:
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

    return allowed_regions"""

def get_trip_allowed_regions(viaje) -> list[dict[str, str | float | None]]:
    allowed_regions: list[dict[str, str | float | None]] = []
    for relacion in viaje.Destinos:
        destino = relacion.Destino
        if not destino.Pais:
            continue
        region = {
            "country": destino.Pais,
            "admin_area": destino.ProvinciaEstado,
            "lat": destino.Lat,
            "lng": destino.Lng,
            "name": destino.Nombre,
        }
        if region not in allowed_regions:
            allowed_regions.append(region)
    return allowed_regions


_region_center_cache: dict[tuple, tuple[float, float] | None] = {}


async def resolve_region_center(region: dict) -> tuple[float, float] | None:
    """Devuelve (lat, lng) del destino. Si el destino no tiene coordenadas
    guardadas, las obtiene buscando "nombre, provincia, país" en Google Places
    (con caché en memoria) para poder contextualizar igual la búsqueda."""
    lat, lng = region.get("lat"), region.get("lng")
    if lat is not None and lng is not None:
        return float(lat), float(lng)

    nombre = region.get("name")
    if not nombre or not settings.google_maps_api_key:
        return None

    partes = [nombre, region.get("admin_area"), region.get("country")]
    consulta = ", ".join(str(p) for p in partes if p)
    clave = (consulta.casefold(),)
    if clave in _region_center_cache:
        return _region_center_cache[clave]

    centro = None
    try:
        data = await _google_places_text_search(
            {"textQuery": consulta, "languageCode": "es", "maxResultCount": 1},
            field_mask="places.id,places.location",
        )
        places = data.get("places") or []
        loc = (places[0].get("location") or {}) if places else {}
        if loc.get("latitude") is not None and loc.get("longitude") is not None:
            centro = (float(loc["latitude"]), float(loc["longitude"]))
    except Exception as error:
        print("No se pudo obtener el centro del destino:", consulta, error)
    _region_center_cache[clave] = centro
    return centro


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


async def obtener_detalles_lugar(place_id: str) -> Optional[Dict[str, Any]]:
    """Consulta la API v1 (New) de Google Places para obtener horarios y nombre."""
    if not settings.google_maps_api_key:
        return None

    raw_place_id = place_id.replace("google:", "", 1)
    url = GOOGLE_PLACE_DETAILS_URL.format(place_id=raw_place_id)
    
    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "id,displayName,currentOpeningHours,regularOpeningHours"
    }
    params = {"languageCode": "es"}

    client = _get_client()
    try:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Adaptamos la estructura para que coincida con lo que espera el validador de horarios
        current_hours = data.get("currentOpeningHours")
        regular_hours = data.get("regularOpeningHours")
        
        return {
            "name": data.get("displayName", {}).get("text"),
            "current_opening_hours": current_hours,
            "opening_hours": regular_hours
        }
    except Exception as e:
        print("🚨 Error al obtener detalles del lugar para horarios:", e)
        return None


async def buscar_lugar_por_nombre(
    query: str,
    lat: float | None = None,
    lng: float | None = None,
    radius_meters: float = 50000.0,
    max_distance_km: float | None = None,
) -> Optional[str]:
    """Busca un lugar por texto usando Places API (New) y retorna su place_id.

    Si se pasan `lat`/`lng` se prioriza esa zona (locationBias). Si además se
    pasa `max_distance_km`, se descarta un resultado que quede más lejos que eso
    (evita asociar "Animal Kingdom" de otro país a un viaje a Córdoba)."""
    if not settings.google_maps_api_key:
        return None

    payload: dict = {
        "textQuery": query.strip(),
        "languageCode": "es",
        "maxResultCount": 1,
    }
    if lat is not None and lng is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": min(float(radius_meters), 50000.0),
            }
        }

    try:
        data = await _google_places_text_search(
            payload,
            field_mask="places.id,places.displayName,places.location",
        )
        places = data.get("places", [])
        if not places:
            return None
        place = places[0]
        place_id = place.get("id")
        if not place_id:
            return None

        if max_distance_km is not None and lat is not None and lng is not None:
            loc = place.get("location") or {}
            if loc.get("latitude") is not None and loc.get("longitude") is not None:
                distancia = _haversine_meters(lat, lng, loc["latitude"], loc["longitude"])
                if distancia > max_distance_km * 1000:
                    return None
        return f"google:{place_id}"
    except Exception as e:
        print("Error al buscar lugar por nombre:", e)
        return None


async def buscar_lugar_en_destinos(
    query: str,
    destinos: list[dict],
    max_distance_km: float = 150.0,
) -> Optional[str]:
    """Busca `query` contextualizado a los destinos del viaje (cualquiera).

    Prueba cada destino con coordenadas (o geocodificadas) y devuelve el primer
    lugar cercano. Si ningún destino tiene ubicación conocida, busca sin sesgo."""
    centros: list[tuple[float, float]] = []
    for destino in destinos or []:
        centro = await resolve_region_center(destino)
        if centro:
            centros.append(centro)

    if not centros:
        return await buscar_lugar_por_nombre(query)

    for lat, lng in centros:
        place_id = await buscar_lugar_por_nombre(
            query, lat=lat, lng=lng, max_distance_km=max_distance_km
        )
        if place_id:
            return place_id
    return None
