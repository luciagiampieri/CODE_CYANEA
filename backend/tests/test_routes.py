import pytest
from datetime import date as date_type
from datetime import time

from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.lugar_interes import LugarInteres
from app.models.ruta_diaria import RutaDiaria
from app.services import route_generation as route_generation_module
from tests.test_trips import _crear_usuario, _token_de


async def _fake_directions_ok(actividades):
    """Simula una respuesta OK de Google Directions: una leg por cada tramo
    entre actividades consecutivas."""
    cantidad_legs = max(len(actividades) - 1, 1)
    return {
        "status": "OK",
        "routes": [
            {
                "overview_polyline": {"points": "fake_polyline_abc123"},
                "legs": [
                    {"distance": {"value": 1000}, "duration": {"value": 600}}
                    for _ in range(cantidad_legs)
                ],
            }
        ],
    }


async def _fake_directions_zero_results(actividades):
    raise route_generation_module.RutaProviderError(
        "No se pudo calcular la ruta entre las actividades seleccionadas. Detalle: ZERO_RESULTS"
    )


@pytest.fixture(autouse=True)
def _mock_google_directions_ok(monkeypatch):
    monkeypatch.setattr(
        route_generation_module, "_consultar_google_directions", _fake_directions_ok
    )


@pytest.fixture()
def dia_cronograma(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date_type(2026, 12, 1), IndiceDia=0)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


def _crear_lugar(db_session, place_id, nombre, lat, lng):
    lugar = LugarInteres(
        GooglePlaceId=place_id,
        Nombre=nombre,
        Direccion=f"Direccion de {nombre}",
        Lat=lat,
        Lng=lng,
        Categoria="atraccion",
    )
    db_session.add(lugar)
    db_session.commit()
    db_session.refresh(lugar)
    return lugar


def _crear_actividad(db_session, dia, nombre, hora_inicio, hora_fin, lugar=None):
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre=nombre,
        HoraInicio=hora_inicio,
        HoraFin=hora_fin,
        Icono="location-dot",
        IdLugarInteres=lugar.IdLugarInteres if lugar else None,
    )
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def _generar_ruta(client, auth_headers, trip_id, day_id):
    return client.post(
        f"/api/v1/trips/{trip_id}/days/{day_id}/route",
        headers=auth_headers,
    )


def test_generar_ruta_con_dos_actividades_con_ubicacion(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-a", "Museo A", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-b", "Museo B", -31.42, -64.18)
    act_a = _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    act_b = _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 200
    data = response.json()
    assert data["ruta"]["IdDiaCronograma"] == dia_cronograma.IdDiaCronograma
    assert data["ruta"]["IdsActividadesOrdenadas"] == [act_a.IdActividad, act_b.IdActividad]
    assert data["actividadesExcluidas"] == []


def test_generar_ruta_para_dia_especifico_del_itinerario(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    otro_dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date_type(2026, 12, 2), IndiceDia=1)
    db_session.add(otro_dia)
    db_session.commit()
    db_session.refresh(otro_dia)

    lugar_a = _crear_lugar(db_session, "place-c", "Plaza C", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-d", "Plaza D", -31.41, -64.19)
    _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)
    assert response.status_code == 200

    ruta_otro_dia = db_session.query(RutaDiaria).filter_by(
        IdDiaCronograma=otro_dia.IdDiaCronograma
    ).first()
    assert ruta_otro_dia is None


def test_generar_ruta_respeta_orden_de_horario(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_norte = _crear_lugar(db_session, "place-norte", "Zona Norte", -31.30, -64.20)
    lugar_sur = _crear_lugar(db_session, "place-sur", "Zona Sur", -31.50, -64.20)

    act_sur_1 = _crear_actividad(db_session, dia_cronograma, "Sur 1", time(9, 0), time(10, 0), lugar_sur)
    act_norte = _crear_actividad(db_session, dia_cronograma, "Norte", time(11, 0), time(12, 0), lugar_norte)
    act_sur_2 = _crear_actividad(db_session, dia_cronograma, "Sur 2", time(13, 0), time(14, 0), lugar_sur)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 200
    data = response.json()
    assert data["ruta"]["IdsActividadesOrdenadas"] == [
        act_sur_1.IdActividad,
        act_norte.IdActividad,
        act_sur_2.IdActividad,
    ]


def test_agregar_actividad_actualiza_ruta_existente(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-e", "Lugar E", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-f", "Lugar F", -31.41, -64.19)
    _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    ruta_previa = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)
    assert ruta_previa.status_code == 200
    id_ruta_previa = ruta_previa.json()["ruta"]["IdRutaDiaria"]

    lugar_c = _crear_lugar(db_session, "place-g", "Lugar G", -31.42, -64.18)
    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Actividad C",
            "horaInicio": "13:00:00",
            "horaFin": "14:00:00",
            "idLugarInteres": lugar_c.IdLugarInteres,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201

    ruta_actualizada = db_session.query(RutaDiaria).filter_by(
        IdDiaCronograma=dia_cronograma.IdDiaCronograma
    ).first()
    assert ruta_actualizada is not None
    assert ruta_actualizada.IdRutaDiaria == id_ruta_previa  # upsert, no duplicado
    assert len(ruta_actualizada.IdsActividadesOrdenadas) == 3


def test_eliminar_actividad_actualiza_ruta_existente(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-h", "Lugar H", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-i", "Lugar I", -31.41, -64.19)
    lugar_c = _crear_lugar(db_session, "place-j", "Lugar J", -31.42, -64.18)
    _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    act_b = _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)
    _crear_actividad(db_session, dia_cronograma, "Actividad C", time(13, 0), time(14, 0), lugar_c)

    ruta_previa = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)
    assert ruta_previa.status_code == 200

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}"
        f"/activities/{act_b.IdActividad}",
        headers=auth_headers,
    )
    assert response.status_code == 200

    ruta_actualizada = db_session.query(RutaDiaria).filter_by(
        IdDiaCronograma=dia_cronograma.IdDiaCronograma
    ).first()
    assert ruta_actualizada is not None
    assert len(ruta_actualizada.IdsActividadesOrdenadas) == 2
    assert act_b.IdActividad not in ruta_actualizada.IdsActividadesOrdenadas


def test_modificar_actividad_actualiza_ruta_existente(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-k", "Lugar K", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-l", "Lugar L", -31.41, -64.19)
    lugar_b_nuevo = _crear_lugar(db_session, "place-m", "Lugar M", -31.45, -64.25)
    _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    act_b = _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    ruta_previa = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)
    assert ruta_previa.status_code == 200
    polilinea_previa = ruta_previa.json()["ruta"]["PolilineaCodificada"]

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}"
        f"/activities/{act_b.IdActividad}",
        json={
            "nombre": "Actividad B modificada",
            "horaInicio": "11:00:00",
            "horaFin": "12:00:00",
            "idLugarInteres": lugar_b_nuevo.IdLugarInteres,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200

    ruta_actualizada = db_session.query(RutaDiaria).filter_by(
        IdDiaCronograma=dia_cronograma.IdDiaCronograma
    ).first()
    assert ruta_actualizada is not None
    # Sigue habiendo ruta (misma cantidad de actividades con ubicación);
    # lo relevante es que el ciclo de regeneración se disparó sin errores.
    assert len(ruta_actualizada.IdsActividadesOrdenadas) == 2
    assert ruta_actualizada.PolilineaCodificada == polilinea_previa  # mock siempre devuelve lo mismo


def test_generar_ruta_excluye_actividades_sin_ubicacion(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-n", "Lugar N", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-o", "Lugar O", -31.41, -64.19)
    act_a = _crear_actividad(db_session, dia_cronograma, "Con ubicacion A", time(9, 0), time(10, 0), lugar_a)
    act_b = _crear_actividad(db_session, dia_cronograma, "Con ubicacion B", time(11, 0), time(12, 0), lugar_b)
    act_sin_ubicacion = _crear_actividad(
        db_session, dia_cronograma, "Sin ubicacion", time(13, 0), time(14, 0), lugar=None
    )

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 200
    data = response.json()
    assert data["ruta"]["IdsActividadesOrdenadas"] == [act_a.IdActividad, act_b.IdActividad]
    assert len(data["actividadesExcluidas"]) == 1
    assert data["actividadesExcluidas"][0]["idActividad"] == act_sin_ubicacion.IdActividad
    assert data["actividadesExcluidas"][0]["nombre"] == "Sin ubicacion"


def test_generar_ruta_con_una_unica_actividad_con_ubicacion_falla(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-p", "Lugar P", -31.4, -64.2)
    _crear_actividad(db_session, dia_cronograma, "Unica actividad", time(9, 0), time(10, 0), lugar_a)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 422
    assert "al menos dos actividades" in response.json()["detail"].lower()


def test_generar_ruta_sin_actividades_registradas_falla(
    client, auth_headers, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 422


def test_generar_ruta_ninguna_actividad_con_ubicacion_falla(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    _crear_actividad(db_session, dia_cronograma, "Sin ubicacion A", time(9, 0), time(10, 0), lugar=None)
    _crear_actividad(db_session, dia_cronograma, "Sin ubicacion B", time(11, 0), time(12, 0), lugar=None)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 422


def test_eliminar_actividades_hasta_menos_de_dos_elimina_ruta_existente(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-q", "Lugar Q", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-r", "Lugar R", -31.41, -64.19)
    act_a = _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    act_b = _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    ruta_previa = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)
    assert ruta_previa.status_code == 200

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}"
        f"/activities/{act_b.IdActividad}",
        headers=auth_headers,
    )
    assert response.status_code == 200

    ruta_restante = db_session.query(RutaDiaria).filter_by(
        IdDiaCronograma=dia_cronograma.IdDiaCronograma
    ).first()
    assert ruta_restante is None


def test_generar_ruta_devuelve_mensaje_de_confirmacion(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-s", "Lugar S", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-t", "Lugar T", -31.41, -64.19)
    _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 200
    assert response.json()["message"] == "La ruta se generó correctamente."


def test_generar_ruta_invalida_devuelve_mensaje_de_error_del_proveedor(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma, monkeypatch
):
    viaje, _ = viaje_con_admin
    lugar_a = _crear_lugar(db_session, "place-u", "Lugar U", -31.4, -64.2)
    lugar_b = _crear_lugar(db_session, "place-v", "Lugar V", -31.41, -64.19)
    _crear_actividad(db_session, dia_cronograma, "Actividad A", time(9, 0), time(10, 0), lugar_a)
    _crear_actividad(db_session, dia_cronograma, "Actividad B", time(11, 0), time(12, 0), lugar_b)

    monkeypatch.setattr(
        route_generation_module, "_consultar_google_directions", _fake_directions_zero_results
    )

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 502
    assert response.json()["detail"]  # hay un mensaje, no vacío


def test_generar_ruta_con_mas_de_25_actividades_con_ubicacion_falla(
    client, auth_headers, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin

    for i in range(26):
        minutos_inicio = i * 5
        hora_inicio = time(minutos_inicio // 60, minutos_inicio % 60)
        hora_fin = time((minutos_inicio + 4) // 60, (minutos_inicio + 4) % 60)
        lugar = _crear_lugar(
            db_session, f"place-limite-{i}", f"Lugar {i}", -31.4 + i * 0.001, -64.2 + i * 0.001
        )
        _crear_actividad(db_session, dia_cronograma, f"Actividad {i}", hora_inicio, hora_fin, lugar)

    response = _generar_ruta(client, auth_headers, viaje.IdViaje, dia_cronograma.IdDiaCronograma)

    assert response.status_code == 422
    assert "25" in response.json()["detail"]


def test_generar_ruta_rechaza_usuario_ajeno_al_viaje(
    client, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    ajeno = _crear_usuario(db_session, "ajeno_rutas")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/route",
        headers=_token_de(ajeno),
    )

    assert response.status_code == 403


def test_generar_ruta_dia_inexistente_devuelve_404(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/999999/route",
        headers=auth_headers,
    )

    assert response.status_code == 404