from unittest.mock import AsyncMock, patch

from app.services.destination_search import (
    DestinationSearchResult,
    DestinationSuggestion,
)


def test_search_destinos_devuelve_sugerencias(
    client,
    auth_headers,
):
    sugerencias = [
        DestinationSuggestion(
            name="Córdoba",
            country="Argentina",
            place_id="google:cordoba-id",
        ),
        DestinationSuggestion(
            name="Buenos Aires",
            country="Argentina",
            place_id="google:buenos-aires-id",
        ),
    ]

    with patch(
        "app.api.routes.trips.autocomplete_destinations",
        new_callable=AsyncMock,
        return_value=sugerencias,
    ):
        response = client.get(
            "/api/v1/trips/search?q=Cordoba",
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert response.json() == [
        {
            "name": "Córdoba",
            "country": "Argentina",
            "placeId": "google:cordoba-id",
        },
        {
            "name": "Buenos Aires",
            "country": "Argentina",
            "placeId": "google:buenos-aires-id",
        },
    ]


def test_search_destinos_requiere_autenticacion(client):
    response = client.get("/api/v1/trips/search?q=Cordoba")

    assert response.status_code == 401


def test_search_destinos_rechaza_query_corta(
    client,
    auth_headers,
):
    response = client.get(
        "/api/v1/trips/search?q=C",
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_search_destinos_devuelve_502_si_falla_google(
    client,
    auth_headers,
):
    with patch(
        "app.api.routes.trips.autocomplete_destinations",
        new_callable=AsyncMock,
        side_effect=Exception("Error Google Places"),
    ):
        response = client.get(
            "/api/v1/trips/search?q=Cordoba",
            headers=auth_headers,
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "No se pudo consultar el servicio externo de destinos"
    )


def test_resolve_destino_devuelve_datos_completos(
    client,
    auth_headers,
):
    resultado = DestinationSearchResult(
        name="Córdoba",
        country="Argentina",
        province_state="Provincia de Córdoba",
        lat=-31.42,
        lng=-64.18,
        place_id="google:cordoba-id",
    )

    with patch(
        "app.api.routes.trips.resolve_destination",
        new_callable=AsyncMock,
        return_value=resultado,
    ):
        response = client.get(
            "/api/v1/trips/destinations/resolve"
            "?placeId=google%3Acordoba-id",
            headers=auth_headers,
        )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "Córdoba"
    assert data["country"] == "Argentina"
    assert data["provinceState"] == "Provincia de Córdoba"
    assert data["lat"] == -31.42
    assert data["lng"] == -64.18
    assert data["placeId"] == "google:cordoba-id"
    assert data["imageUrl"] is not None


def test_resolve_destino_requiere_autenticacion(client):
    response = client.get(
        "/api/v1/trips/destinations/resolve?placeId=google%3Acordoba-id"
    )

    assert response.status_code == 401


def test_resolve_destino_rechaza_place_id_corto(
    client,
    auth_headers,
):
    response = client.get(
        "/api/v1/trips/destinations/resolve?placeId=x",
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_resolve_destino_devuelve_502_si_falla_google(
    client,
    auth_headers,
):
    with patch(
        "app.api.routes.trips.resolve_destination",
        new_callable=AsyncMock,
        side_effect=Exception("Error Google Places"),
    ):
        response = client.get(
            "/api/v1/trips/destinations/resolve"
            "?placeId=google%3Acordoba-id",
            headers=auth_headers,
        )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "No se pudo resolver el destino seleccionado"
    )
