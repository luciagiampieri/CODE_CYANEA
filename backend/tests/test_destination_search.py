from app.services.destination_search import (
    FALLBACK_DESTINATION_TYPES,
    STRICT_DESTINATION_TYPES,
    _parse_google_results,
)


def test_parse_google_results_accepts_locality_results() -> None:
    results = _parse_google_results(
        [
            {
                "displayName": {"text": "Cordoba"},
                "formattedAddress": "Cordoba, Provincia de Cordoba, Argentina",
                "types": ["locality", "political"],
                "addressComponents": [
                    {
                        "types": ["administrative_area_level_1", "political"],
                        "longText": "Provincia de Cordoba",
                    }
                ],
                "location": {"latitude": -31.42, "longitude": -64.18},
                "id": "cordoba-id",
            }
        ],
        limit=5,
        allowed_types=STRICT_DESTINATION_TYPES,
    )

    assert len(results) == 1
    assert results[0].name == "Cordoba"
    assert results[0].country == "Argentina"
    assert results[0].province_state == "Provincia de Cordoba"
    assert results[0].place_id == "google:cordoba-id"


def test_parse_google_results_fallback_accepts_regions_like_mallorca() -> None:
    mallorca_result = {
        "displayName": {"text": "Mallorca"},
        "formattedAddress": "Mallorca, Illes Balears, Espana",
        "types": ["administrative_area_level_1", "political"],
        "addressComponents": [
            {
                "types": ["administrative_area_level_1", "political"],
                "longText": "Illes Balears",
            }
        ],
        "location": {"latitude": 39.6953, "longitude": 3.0176},
        "id": "mallorca-id",
    }

    strict_results = _parse_google_results(
        [mallorca_result],
        limit=5,
        allowed_types=STRICT_DESTINATION_TYPES,
    )
    fallback_results = _parse_google_results(
        [mallorca_result],
        limit=5,
        allowed_types=FALLBACK_DESTINATION_TYPES,
    )

    assert strict_results == []
    assert len(fallback_results) == 1
    assert fallback_results[0].name == "Mallorca"
    assert fallback_results[0].country == "Espana"
