from datetime import time
import pytest

from app.api.routes import places as places_module
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.lugar_interes import LugarInteres
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.services import place_search as places_service
from app.services.place_search import (
    PlaceDetailsResult,
    PlaceReviewResult,
    PlaceSearchResult,
    PopularPlacesResponse,
)
from tests.test_trips import _crear_usuario, _token_de


async def _broadcast_noop(*args, **kwargs):
    return None


def _crear_lugar_guardado(db_session, viaje, usuario, google_place_id="google:palma-catedral"):
    lugar = LugarInteres(
        GooglePlaceId=google_place_id,
        Nombre="Catedral de Palma",
        Direccion="Pl. de la Seu, Palma, España",
        Lat=39.567,
        Lng=2.648,
        Categoria="cathedral",
    )
    db_session.add(lugar)
    db_session.flush()

    lugar_viaje = LugarInteresViaje(
        IdViaje=viaje.IdViaje,
        IdLugarInteres=lugar.IdLugarInteres,
        IdUsuarioAlta=usuario.IdUsuario,
        Notas="Lugar favorito",
    )
    db_session.add(lugar_viaje)
    db_session.commit()
    db_session.refresh(lugar)
    db_session.refresh(lugar_viaje)
    return lugar, lugar_viaje


def test_search_places_devuelve_resultados_normalizados(client, auth_headers, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin

    async def fake_search_trip_places(query,allowed_regions, limit=8):
        assert query == "catedral palma"
        assert limit == 8
        return [
            PlaceSearchResult(
                place_id="google:1",
                name="Catedral de Palma",
                address="Pl. de la Seu, Palma, España",
                country="España",
                admin_area=None,
                lat=39.567,
                lng=2.648,
                category="cathedral",
                provider="google_places",
                metadata={"types": ["church"]},
            ),
            PlaceSearchResult(
                place_id="google:sin-coords",
                name="Resultado inválido",
                address="Sin coordenadas",
                country="España",
                admin_area=None,
                lat=None,
                lng=None,
            ),
        ]

    monkeypatch.setattr(places_module, "search_trip_places", fake_search_trip_places)

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/places/search",
        params={"q": "catedral palma"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["placeId"] == "google:1"
    assert body[0]["name"] == "Catedral de Palma"
    assert body[0]["provider"] == "google_places"


def test_search_places_direccion_no_reconocida_no_devuelve_resultados(
    client, auth_headers, viaje_con_admin, monkeypatch
):
    viaje, _ = viaje_con_admin

    async def fake_search_trip_places(query, allowed_regions=None, limit=8):
        assert query == "direccion inexistente 999999"
        return []

    monkeypatch.setattr(
        places_module,
        "search_trip_places",
        fake_search_trip_places,
    )

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/places/search",
        params={"q": "direccion inexistente 999999"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json() == []


def test_search_places_rechaza_usuario_ajeno(client, db_session, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin
    ajeno = _crear_usuario(db_session, "ajeno_places")

    async def fake_search_trip_places(query, limit=8):
        return []

    monkeypatch.setattr(places_module, "search_trip_places", fake_search_trip_places)

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/places/search",
        params={"q": "mallorca"},
        headers=_token_de(ajeno),
    )

    assert response.status_code == 403


def test_popular_places_devuelve_contexto_y_items(client, auth_headers, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin

    async def fake_search_popular_places(lat, lng, limit=6):
        assert lat == 39.5696
        assert lng == 2.6502
        assert limit == 4
        return PopularPlacesResponse(
            context_label="Palma",
            items=[
                PlaceSearchResult(
                    place_id="google:palma-1",
                    name="Catedral de Palma",
                    address="Palma, España",
                    country="España",
                    admin_area=None,
                    lat=39.567,
                    lng=2.648,
                    category="tourist_attraction",
                    provider="google_places",
                    rating=4.7,
                    user_ratings_total=1280,
                    popularity_score=144.2,
                )
            ],
        )

    monkeypatch.setattr(places_module, "search_popular_places", fake_search_popular_places)

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/places/popular",
        params={"lat": 39.5696, "lng": 2.6502, "limit": 4},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["contextLabel"] == "Palma"
    assert len(body["items"]) == 1
    assert body["items"][0]["rating"] == 4.7
    assert body["items"][0]["userRatingsTotal"] == 1280


def test_get_place_details_devuelve_reviews(client, auth_headers, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin

    async def fake_get_place_details(place_id):
        assert place_id == "google:palma-1"
        return PlaceDetailsResult(
            place_id="google:palma-1",
            name="Catedral de Palma",
            address="Pl. de la Seu, Palma, España",
            category="establishment",
            rating=4.8,
            user_ratings_total=5000,
            google_maps_uri="https://maps.google.com/?cid=1",
            reviews=[
                PlaceReviewResult(
                    author_name="Lucía",
                    author_url=None,
                    profile_photo_url=None,
                    rating=5,
                    publish_time="2026-08-01T12:00:00Z",
                    text="Hermoso lugar.",
                    relative_publish_time_description="hace 1 semana",
                )
            ],
        )

    monkeypatch.setattr(places_module, "get_place_details", fake_get_place_details)

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/places/details",
        params={"placeId": "google:palma-1"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["placeId"] == "google:palma-1"
    assert body["rating"] == 4.8
    assert body["reviews"][0]["authorName"] == "Lucía"
    assert body["reviews"][0]["text"] == "Hermoso lugar."


def test_create_trip_place_guarda_lugar_y_evitar_duplicado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    payload = {
        "placeId": "google:palma-1",
        "name": "Catedral de Palma",
        "address": "Pl. de la Seu, Palma, España",
        "lat": 39.567,
        "lng": 2.648,
        "category": "cathedral",
        "metadata": {"types": ["church"]},
    }

    first = client.post(f"/api/v1/trips/{viaje.IdViaje}/places", json=payload, headers=auth_headers)
    second = client.post(f"/api/v1/trips/{viaje.IdViaje}/places", json=payload, headers=auth_headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["message"] == "El lugar ya estaba guardado en este viaje."

    lugares = db_session.query(LugarInteresViaje).filter_by(IdViaje=viaje.IdViaje).all()
    assert len(lugares) == 1
    assert lugares[0].LugarInteres.GooglePlaceId == "google:palma-1"


def test_list_trip_places_incluye_dias_agendados(client, db_session, auth_headers, usuario_activo, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _, lugar_viaje = _crear_lugar_guardado(db_session, viaje, usuario_activo)

    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=viaje.FechaInicio, IndiceDia=1)
    db_session.add(dia)
    db_session.flush()

    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        IdLugarInteresViaje=lugar_viaje.IdLugarInteresViaje,
        Nombre="Visita a la catedral",
        HoraInicio=time(10, 0),
        HoraFin=time(11, 30),
        Icono="church",
    )
    db_session.add(actividad)
    db_session.commit()

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/places", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Catedral de Palma"
    assert body[0]["scheduledDays"][0]["dayIndex"] == 1


def test_schedule_trip_place_por_day_index_crea_actividad(client, db_session, auth_headers, usuario_activo, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin
    _, lugar_viaje = _crear_lugar_guardado(db_session, viaje, usuario_activo)
    monkeypatch.setattr(places_module.manager, "broadcast", _broadcast_noop)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/places/{lugar_viaje.IdLugarInteresViaje}/schedule",
        json={
            "dayIndex": 1,
            "nombre": "Desayuno frente al mar",
            "descripcion": "Mesa reservada",
            "horaInicio": "09:00",
            "horaFin": "10:30",
            "icono": "mug-hot",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["Nombre"] == "Desayuno frente al mar"
    assert body["Icono"] == "mug-hot"

    actividad = db_session.query(ActividadItinerario).filter_by(Nombre="Desayuno frente al mar").first()
    assert actividad is not None
    assert actividad.IdLugarInteresViaje == lugar_viaje.IdLugarInteresViaje


def test_schedule_trip_place_rechaza_dia_inexistente(client, db_session, auth_headers, usuario_activo, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin
    _, lugar_viaje = _crear_lugar_guardado(db_session, viaje, usuario_activo)
    monkeypatch.setattr(places_module.manager, "broadcast", _broadcast_noop)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/places/{lugar_viaje.IdLugarInteresViaje}/schedule",
        json={
            "dayId": 999999,
            "nombre": "Lugar sin día",
            "horaInicio": "09:00",
            "horaFin": "10:30",
            "icono": "location-dot",
        },
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Día de itinerario no encontrado"


def test_schedule_trip_place_rechaza_horario_invalido(client, db_session, auth_headers, usuario_activo, viaje_con_admin, monkeypatch):
    viaje, _ = viaje_con_admin
    _, lugar_viaje = _crear_lugar_guardado(db_session, viaje, usuario_activo)
    monkeypatch.setattr(places_module.manager, "broadcast", _broadcast_noop)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/places/{lugar_viaje.IdLugarInteresViaje}/schedule",
        json={
            "dayIndex": 1,
            "nombre": "Horario inválido",
            "horaInicio": "11:00",
            "horaFin": "10:30",
            "icono": "clock",
        },
        headers=auth_headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "La hora de fin debe ser posterior a la hora de inicio"


def test_is_place_allowed_rechaza_ubicacion_fuera_del_destino():
    lugar = places_service.PlaceSearchResult(
        place_id="google:123",
        name="Lugar en Buenos Aires",
        address="Buenos Aires, Argentina",
        country="Argentina",
        admin_area="Buenos Aires",
        lat=-34.6037,
        lng=-58.3816,
    )

    allowed_regions = [
        {
            "country": "Argentina",
            "admin_area": "Córdoba",
        }
    ]

    assert places_service.is_place_allowed(
        lugar,
        allowed_regions,
    ) is False


def test_is_place_allowed_rechaza_ubicacion_de_otro_pais():
    lugar = places_service.PlaceSearchResult(
        place_id="google:456",
        name="Córdoba en otro país",
        address="Córdoba, España",
        country="España",
        admin_area="Córdoba",
        lat=37.8882,
        lng=-4.7794,
    )

    allowed_regions = [
        {
            "country": "Argentina",
            "admin_area": "Córdoba",
        }
    ]

    assert places_service.is_place_allowed(
        lugar,
        allowed_regions,
    ) is False


def test_is_place_allowed_acepta_ubicacion_del_destino():
    lugar = places_service.PlaceSearchResult(
        place_id="google:789",
        name="Museo de Córdoba",
        address="Córdoba, Argentina",
        country="Argentina",
        admin_area="Córdoba",
        lat=-31.4201,
        lng=-64.1888,
    )

    allowed_regions = [
        {
            "country": "Argentina",
            "admin_area": "Córdoba",
        }
    ]

    assert places_service.is_place_allowed(
        lugar,
        allowed_regions,
    ) is True


def test_is_place_allowed_acepta_cualquier_region_si_destino_solo_tiene_pais():
    lugar = places_service.PlaceSearchResult(
        place_id="google:999",
        name="Lugar en Mendoza",
        address="Mendoza, Argentina",
        country="Argentina",
        admin_area="Mendoza",
        lat=-32.8895,
        lng=-68.8458,
    )

    allowed_regions = [
        {
            "country": "Argentina",
            "admin_area": None,
        }
    ]

    assert places_service.is_place_allowed(
        lugar,
        allowed_regions,
    ) is True


@pytest.mark.anyio
async def test_search_trip_places_filtra_ubicaciones_fuera_del_destino(monkeypatch):
    resultados_google = [
        places_service.PlaceSearchResult(
            place_id="google:cordoba",
            name="Lugar en Córdoba",
            address="Córdoba, Argentina",
            country="Argentina",
            admin_area="Córdoba",
            lat=-31.4201,
            lng=-64.1888,
        ),
        places_service.PlaceSearchResult(
            place_id="google:buenos-aires",
            name="Lugar en Buenos Aires",
            address="Buenos Aires, Argentina",
            country="Argentina",
            admin_area="Buenos Aires",
            lat=-34.6037,
            lng=-58.3816,
        ),
    ]

    async def fake_google_places_text_search(payload, field_mask):
        return {
            "places": [
                {
                    "id": "cordoba",
                    "displayName": {"text": "Lugar en Córdoba"},
                    "formattedAddress": "Córdoba, Argentina",
                    "location": {
                        "latitude": -31.4201,
                        "longitude": -64.1888,
                    },
                },
                {
                    "id": "buenos-aires",
                    "displayName": {"text": "Lugar en Buenos Aires"},
                    "formattedAddress": "Buenos Aires, Argentina",
                    "location": {
                        "latitude": -34.6037,
                        "longitude": -58.3816,
                    },
                },
            ]
        }

    async def fake_enrich(result):
        for esperado in resultados_google:
            if esperado.place_id == result.place_id:
                return esperado
        return result

    monkeypatch.setattr(
        places_service,
        "_google_places_text_search",
        fake_google_places_text_search,
    )
    monkeypatch.setattr(
        places_service,
        "_enrich_place_location",
        fake_enrich,
    )

    allowed_regions = [
        {
            "country": "Argentina",
            "admin_area": "Córdoba",
        }
    ]

    resultados = await places_service.search_trip_places(
        "museo",
        allowed_regions=allowed_regions,
        limit=8,
    )

    assert len(resultados) == 1
    assert resultados[0].name == "Lugar en Córdoba"
    assert resultados[0].admin_area == "Córdoba"