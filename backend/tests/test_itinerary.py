import pytest
from datetime import date as date_type
from datetime import time

from app.api.routes import itinerary as itinerary_module
from app.core.security import create_access_token, hash_password
from app.models.actividad_itinerario import ActividadItinerario
from app.models.lugar_interes import LugarInteres
from app.models.dia_cronograma import DiaCronograma
from app.models.usuario import Usuario
from tests.conftest import TestingSessionLocal
from tests.test_trips import _agregar_participante, _crear_usuario, _token_de


@pytest.fixture(autouse=True)
def _ws_usa_sesion_de_test(monkeypatch):
    monkeypatch.setattr(itinerary_module, "SessionLocal", TestingSessionLocal)


@pytest.fixture()
def dia_cronograma(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date_type(2026, 12, 1), IndiceDia=0)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


@pytest.fixture()
def actividad_itinerario(db_session, dia_cronograma):
    actividad = ActividadItinerario(
        IdDiaCronograma=dia_cronograma.IdDiaCronograma,
        Nombre="Visita al museo",
        Descripcion="Visita inicial",
        HoraInicio=time(10, 0, 0),
        HoraFin=time(12, 0, 0),
        Icono="camera",
    )
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def _ws_url(trip_id, token):
    return f"/ws/trips/{trip_id}/itinerary?token={token}"


def test_ws_conecta_si_es_admin_del_viaje(client, usuario_activo, viaje_con_admin):
    viaje, _ = viaje_con_admin
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})

    with client.websocket_connect(_ws_url(viaje.IdViaje, token)):
        pass  


def test_ws_rechaza_token_invalido(client, viaje_con_admin):
    viaje, _ = viaje_con_admin

    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(viaje.IdViaje, "token-invalido")) as ws:
            ws.receive_text()


def test_ws_rechaza_viaje_inexistente(client, usuario_activo):
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})

    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(999999, token)) as ws:
            ws.receive_text()


def test_ws_rechaza_usuario_no_participante(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    intruso = Usuario(
        Nombre="Intruso", Apellido="Ajeno", NombreUsuario="intruso_ws",
        Email="intruso_ws@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(intruso)
    db_session.commit()
    db_session.refresh(intruso)
    token = create_access_token({"sub": intruso.Email, "user_id": intruso.IdUsuario})

    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(viaje.IdViaje, token)) as ws:
            ws.receive_text()


def test_ws_recibe_broadcast_al_crear_actividad(
    client, auth_headers, usuario_activo, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})

    with client.websocket_connect(_ws_url(viaje.IdViaje, token)) as ws:
        response = client.post(
            f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities",
            json={
                "nombre": "Visita al museo",
                "horaInicio": "10:00:00",
                "horaFin": "12:00:00",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        evento = ws.receive_json()
        assert evento["tipo"] == "actividad_creada"
        assert evento["idDiaCronograma"] == dia_cronograma.IdDiaCronograma
        assert evento["actividad"]["Nombre"] == "Visita al museo"


def test_ws_no_reenvia_evento_a_quien_no_esta_en_el_mismo_viaje(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin, dia_cronograma
):
    from app.models.viaje import Viaje
    from app.models.estado_viaje import EstadoViaje
    from app.models.rol_participante import RolParticipante
    from app.models.estado_participacion import EstadoParticipacion
    from app.models.participante_viaje import ParticipanteViaje

    viaje, _ = viaje_con_admin

    otro_usuario = Usuario(
        Nombre="Otro", Apellido="User", NombreUsuario="otro_ws",
        Email="otro_ws@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(otro_usuario)
    db_session.commit()
    db_session.refresh(otro_usuario)

    estado_activo = db_session.query(EstadoViaje).filter_by(Nombre="activo").first()
    rol_admin = db_session.query(RolParticipante).filter_by(Nombre="administrador").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()

    otro_viaje = Viaje(
        Titulo="Otro viaje",
        FechaInicio=date_type(2026, 12, 1),
        FechaFin=date_type(2026, 12, 10),
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=otro_usuario.IdUsuario,
    )
    db_session.add(otro_viaje)
    db_session.flush()
    db_session.add(ParticipanteViaje(
        IdViaje=otro_viaje.IdViaje,
        IdUsuario=otro_usuario.IdUsuario,
        IdRolParticipante=rol_admin.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    ))
    db_session.commit()
    db_session.refresh(otro_viaje)

    token_otro = create_access_token({"sub": otro_usuario.Email, "user_id": otro_usuario.IdUsuario})

    with client.websocket_connect(_ws_url(otro_viaje.IdViaje, token_otro)) as ws_otro:
        response = client.post(
            f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities",
            json={
                "nombre": "Visita al museo",
                "horaInicio": "10:00:00",
                "horaFin": "12:00:00",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        with pytest.raises(Exception):
            ws_otro.receive_text(timeout=0.5)


def test_actualizar_actividad_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Visita al museo actualizada",
            "descripcion": "Nueva descripción",
            "horaInicio": "11:00:00",
            "horaFin": "13:00:00",
            "icono": "building",
        },
        headers=auth_headers,
    )

    assert response.status_code == 200

    data = response.json()

    assert data["Nombre"] == "Visita al museo actualizada"
    assert data["Descripcion"] == "Nueva descripción"
    assert data["HoraInicio"].startswith("11:00")
    assert data["HoraFin"].startswith("13:00")
    assert data["Icono"] == "building"

def test_actualizar_actividad_rechaza_hora_fin_invalida(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Visita al museo",
            "descripcion": "Descripción actualizada",
            "horaInicio": "14:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 422

def test_actualizar_actividad_inexistente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/999999",
        json={
            "nombre": "Actividad inexistente",
            "descripcion": "No debería actualizarse",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "La actividad no existe en este día del itinerario."


def test_actualizar_actividad_de_otro_dia_rechazada(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
    db_session,
):
    viaje, _ = viaje_con_admin

    otro_dia = DiaCronograma(
        IdViaje=viaje.IdViaje,
        Fecha=date_type(2026, 12, 2),
        IndiceDia=1,
    )
    db_session.add(otro_dia)
    db_session.commit()
    db_session.refresh(otro_dia)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{otro_dia.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Intento de modificación",
            "descripcion": "No debería modificarse",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "La actividad no existe en este día del itinerario."
    )

def test_actualizar_actividad_rechaza_nombre_vacio(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "",
            "descripcion": "Descripción actualizada",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 422

def test_actualizar_actividad_rechaza_hora_inicio_vacia(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Visita al museo",
            "descripcion": "Descripción actualizada",
            "horaInicio": "",
            "horaFin": "12:00:00",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 422

def test_actualizar_actividad_rechaza_hora_fin_vacia(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Visita al museo",
            "descripcion": "Descripción actualizada",
            "horaInicio": "10:00:00",
            "horaFin": "",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 422

def test_ws_bloquea_edicion_concurrente_de_misma_actividad(
    client,
    usuario_activo,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    token = create_access_token({
        "sub": usuario_activo.Email,
        "user_id": usuario_activo.IdUsuario,
    })

    url = _ws_url(viaje.IdViaje, token)

    with client.websocket_connect(url) as ws_1:
        ws_1.send_json({
            "tipo": "iniciar_edicion",
            "idActividad": actividad_itinerario.IdActividad,
        })

        respuesta_1 = ws_1.receive_json()

        assert respuesta_1["tipo"] == "edicion_concedida"
        assert respuesta_1["idActividad"] == actividad_itinerario.IdActividad

        with client.websocket_connect(url) as ws_2:
            ws_2.send_json({
                "tipo": "iniciar_edicion",
                "idActividad": actividad_itinerario.IdActividad,
            })

            respuesta_2 = ws_2.receive_json()

            assert respuesta_2["tipo"] == "edicion_rechazada"
            assert respuesta_2["idActividad"] == actividad_itinerario.IdActividad
            assert "está editando esta actividad." in respuesta_2["mensaje"]

def test_ws_permite_editar_nuevamente_despues_de_finalizar_edicion(
    client,
    usuario_activo,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    token = create_access_token({
        "sub": usuario_activo.Email,
        "user_id": usuario_activo.IdUsuario,
    })

    url = _ws_url(viaje.IdViaje, token)

    with client.websocket_connect(url) as ws_1:
        ws_1.send_json({
            "tipo": "iniciar_edicion",
            "idActividad": actividad_itinerario.IdActividad,
        })

        respuesta_1 = ws_1.receive_json()

        assert respuesta_1["tipo"] == "edicion_concedida"

        ws_1.send_json({
            "tipo": "finalizar_edicion",
            "idActividad": actividad_itinerario.IdActividad,
        })

        respuesta_finalizacion = ws_1.receive_json()

        assert respuesta_finalizacion["tipo"] == "edicion_finalizada"
        assert (
            respuesta_finalizacion["idActividad"]
            == actividad_itinerario.IdActividad
        )

    with client.websocket_connect(url) as ws_2:
        ws_2.send_json({
            "tipo": "iniciar_edicion",
            "idActividad": actividad_itinerario.IdActividad,
        })

        respuesta_2 = ws_2.receive_json()

        assert respuesta_2["tipo"] == "edicion_concedida"
        assert respuesta_2["idActividad"] == actividad_itinerario.IdActividad

def test_ws_recibe_broadcast_al_actualizar_actividad(
    client,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    token = create_access_token({
        "sub": usuario_activo.Email,
        "user_id": usuario_activo.IdUsuario,
    })

    with client.websocket_connect(
        _ws_url(viaje.IdViaje, token)
    ) as ws:

        response = client.put(
            f"/api/v1/trips/{viaje.IdViaje}/days/"
            f"{dia_cronograma.IdDiaCronograma}/activities/"
            f"{actividad_itinerario.IdActividad}",
            json={
                "nombre": "Museo actualizado",
                "descripcion": "Nueva descripción",
                "horaInicio": "11:00:00",
                "horaFin": "13:00:00",
                "icono": "camera",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200

        evento = ws.receive_json()

        assert evento["tipo"] == "actividad_actualizada"
        assert evento["idDiaCronograma"] == dia_cronograma.IdDiaCronograma
        assert evento["actividad"]["IdActividad"] == actividad_itinerario.IdActividad
        assert evento["actividad"]["Nombre"] == "Museo actualizado"
        assert evento["actividad"]["Descripcion"] == "Nueva descripción"


def test_ws_libera_edicion_al_desconectarse(
    client,
    usuario_activo,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    token = create_access_token({
        "sub": usuario_activo.Email,
        "user_id": usuario_activo.IdUsuario,
    })

    url = _ws_url(viaje.IdViaje, token)

    with client.websocket_connect(url) as ws_1:
        ws_1.send_json({
            "tipo": "iniciar_edicion",
            "idActividad": actividad_itinerario.IdActividad,
        })

        respuesta_1 = ws_1.receive_json()

        assert respuesta_1["tipo"] == "edicion_concedida"


    with client.websocket_connect(url) as ws_2:
        ws_2.send_json({
            "tipo": "iniciar_edicion",
            "idActividad": actividad_itinerario.IdActividad,
        })

        respuesta_2 = ws_2.receive_json()

        assert respuesta_2["tipo"] == "edicion_concedida"
        assert respuesta_2["idActividad"] == actividad_itinerario.IdActividad



def test_consultar_itinerario_incluye_dias_y_actividades_ordenadas(
    client, auth_headers, viaje_con_admin, db_session
):
    viaje, _ = viaje_con_admin

    dia_2 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date_type(2026, 12, 2), IndiceDia=1)
    dia_1 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date_type(2026, 12, 1), IndiceDia=0)
    db_session.add_all([dia_2, dia_1])
    db_session.commit()
    db_session.refresh(dia_1)

    cena = ActividadItinerario(
        IdDiaCronograma=dia_1.IdDiaCronograma,
        Nombre="Cena",
        HoraInicio=time(20, 0),
        HoraFin=time(22, 0),
    )
    desayuno = ActividadItinerario(
        IdDiaCronograma=dia_1.IdDiaCronograma,
        Nombre="Desayuno",
        HoraInicio=time(8, 0),
        HoraFin=time(9, 0),
    )
    db_session.add_all([cena, desayuno])
    db_session.commit()

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200

    cronograma = response.json()["Cronograma"]
    assert len(cronograma) == 2
    assert [dia["IdDiaCronograma"] for dia in cronograma] == [
        dia_1.IdDiaCronograma,
        dia_2.IdDiaCronograma,
    ]

    primer_dia = cronograma[0]
    nombres_en_orden = [actividad["Nombre"] for actividad in primer_dia["Actividades"]]
    assert nombres_en_orden == ["Desayuno", "Cena"]


def test_consultar_itinerario_permite_a_participante_no_admin(
    client, db_session, viaje_con_admin, dia_cronograma, actividad_itinerario
):
    viaje, _ = viaje_con_admin

    invitado = _crear_usuario(db_session, "participante_itinerario")
    _agregar_participante(db_session, viaje, invitado, estado_nombre="aceptado")

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=_token_de(invitado))

    assert response.status_code == 200
    actividades = response.json()["Cronograma"][0]["Actividades"]
    assert any(a["IdActividad"] == actividad_itinerario.IdActividad for a in actividades)


def test_consultar_itinerario_rechaza_usuario_ajeno_al_viaje(
    client, db_session, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    ajeno = _crear_usuario(db_session, "ajeno_itinerario")

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=_token_de(ajeno))

    assert response.status_code == 403


def test_crear_actividad_sin_lugar_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Actividad sin lugar",
            "descripcion": "Actividad sin ubicación asociada",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201

    data = response.json()

    assert data["Nombre"] == "Actividad sin lugar"
    assert data["IdLugarInteres"] is None


def test_crear_actividad_con_lugar_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    db_session,
):
    viaje, _ = viaje_con_admin

    lugar = LugarInteres(
        GooglePlaceId="google-place-123",
        Nombre="Museo del Louvre",
        Direccion="Paris, Francia",
        Lat=48.8606,
        Lng=2.3376,
        Categoria="museo",
    )
    db_session.add(lugar)
    db_session.commit()
    db_session.refresh(lugar)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Visita al Louvre",
            "descripcion": "Visita al museo",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "building",
            "idLugarInteres": lugar.IdLugarInteres,
        },
        headers=auth_headers,
    )

    assert response.status_code == 201

    data = response.json()

    assert data["Nombre"] == "Visita al Louvre"
    assert data["IdLugarInteres"] == lugar.IdLugarInteres


def test_crear_actividad_correctamente(client, auth_headers, viaje_con_admin, dia_cronograma):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Caminata al mirador",
            "descripcion": "Llevar agua",
            "horaInicio": "09:00:00",
            "horaFin": "11:00:00",
            "icono": "person-hiking",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["Nombre"] == "Caminata al mirador"
    assert data["Icono"] == "person-hiking"


def test_crear_actividad_rechaza_hora_fin_invalida(client, auth_headers, viaje_con_admin, dia_cronograma):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Actividad con horario invertido",
            "horaInicio": "15:00:00",
            "horaFin": "10:00:00",
        },
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_crear_actividad_dia_inexistente(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/999999/activities",
        json={
            "nombre": "Actividad sin día",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
        },
        headers=auth_headers,
    )

    assert response.status_code == 404

def test_crear_actividad_rechaza_lugar_inexistente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Actividad con lugar inexistente",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "idLugarInteres": 999999,
        },
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "El lugar de interés seleccionado no existe."
    )


def test_crear_actividad_permite_a_participante_no_admin(
    client, db_session, viaje_con_admin, dia_cronograma
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "creador_actividad")
    _agregar_participante(db_session, viaje, invitado, estado_nombre="aceptado")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities",
        json={
            "nombre": "Actividad creada por participante",
            "horaInicio": "10:00:00",
            "horaFin": "11:00:00",
        },
        headers=_token_de(invitado),
    )

    assert response.status_code == 201


def test_eliminar_actividad_correctamente(
    client, auth_headers, viaje_con_admin, dia_cronograma, actividad_itinerario
):
    viaje, _ = viaje_con_admin

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        headers=auth_headers,
    )

    assert response.status_code == 200

    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    actividades_restantes = detalle.json()["Cronograma"][0]["Actividades"]
    assert actividades_restantes == []


def test_eliminar_actividad_inexistente(client, auth_headers, viaje_con_admin, dia_cronograma):
    viaje, _ = viaje_con_admin

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia_cronograma.IdDiaCronograma}/activities/999999",
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_eliminar_actividad_dia_inexistente(client, auth_headers, viaje_con_admin, actividad_itinerario):
    viaje, _ = viaje_con_admin

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/999999/activities/{actividad_itinerario.IdActividad}",
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_eliminar_actividad_de_otro_dia_rechazada(
    client, auth_headers, viaje_con_admin, dia_cronograma, actividad_itinerario, db_session
):
    viaje, _ = viaje_con_admin
    otro_dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date_type(2026, 12, 2), IndiceDia=1)
    db_session.add(otro_dia)
    db_session.commit()
    db_session.refresh(otro_dia)

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/{otro_dia.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_eliminar_actividad_permite_a_participante_no_admin(
    client, db_session, viaje_con_admin, dia_cronograma, actividad_itinerario
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "eliminador_actividad")
    _agregar_participante(db_session, viaje, invitado, estado_nombre="aceptado")

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        headers=_token_de(invitado),
    )

    assert response.status_code == 200


def test_ws_recibe_broadcast_al_eliminar_actividad(
    client, auth_headers, usuario_activo, viaje_con_admin, dia_cronograma, actividad_itinerario
):
    viaje, _ = viaje_con_admin
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})

    with client.websocket_connect(_ws_url(viaje.IdViaje, token)) as ws:
        response = client.delete(
            f"/api/v1/trips/{viaje.IdViaje}/days/"
            f"{dia_cronograma.IdDiaCronograma}/activities/"
            f"{actividad_itinerario.IdActividad}",
            headers=auth_headers,
        )
        assert response.status_code == 200

        evento = ws.receive_json()
        assert evento["tipo"] == "actividad_eliminada"
        assert evento["idDiaCronograma"] == dia_cronograma.IdDiaCronograma
        assert evento["idActividad"] == actividad_itinerario.IdActividad


def test_actualizar_actividad_permite_a_participante_no_admin(
    client, db_session, viaje_con_admin, dia_cronograma, actividad_itinerario
):
    viaje, _ = viaje_con_admin
    invitado = _crear_usuario(db_session, "editor_actividad")
    _agregar_participante(db_session, viaje, invitado, estado_nombre="aceptado")

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Editado por participante",
            "horaInicio": "09:00:00",
            "horaFin": "10:00:00",
            "icono": "camera",
        },
        headers=_token_de(invitado),
    )

    assert response.status_code == 200
    assert response.json()["Nombre"] == "Editado por participante"


def test_actualizar_actividad_rechaza_lugar_inexistente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Actividad actualizada",
            "descripcion": "Descripción actualizada",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
            "idLugarInteres": 999999,
        },
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "El lugar de interés no existe."


def test_actualizar_actividad_con_lugar_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
    db_session,
):
    viaje, _ = viaje_con_admin

    lugar = LugarInteres(
        GooglePlaceId="google-place-456",
        Nombre="Torre Eiffel",
        Direccion="Champ de Mars, Paris",
        Lat=48.8584,
        Lng=2.2945,
        Categoria="monumento",
    )
    db_session.add(lugar)
    db_session.commit()
    db_session.refresh(lugar)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Visita a la Torre Eiffel",
            "descripcion": "Visita actualizada",
            "horaInicio": "11:00:00",
            "horaFin": "13:00:00",
            "icono": "building",
            "idLugarInteres": lugar.IdLugarInteres,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200

    data = response.json()

    assert data["Nombre"] == "Visita a la Torre Eiffel"
    assert data["IdLugarInteres"] == lugar.IdLugarInteres


def test_actualizar_actividad_quita_lugar_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    actividad_itinerario,
    db_session,
):
    viaje, _ = viaje_con_admin

    lugar = LugarInteres(
        GooglePlaceId="google-place-789",
        Nombre="Museo de París",
        Direccion="Paris, Francia",
        Lat=48.8606,
        Lng=2.3376,
        Categoria="museo",
    )
    db_session.add(lugar)
    db_session.commit()
    db_session.refresh(lugar)

    actividad_itinerario.IdLugarInteres = lugar.IdLugarInteres
    db_session.commit()
    db_session.refresh(actividad_itinerario)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/"
        f"{dia_cronograma.IdDiaCronograma}/activities/"
        f"{actividad_itinerario.IdActividad}",
        json={
            "nombre": "Actividad sin lugar",
            "descripcion": "Se quitó el lugar asociado",
            "horaInicio": "10:00:00",
            "horaFin": "12:00:00",
            "icono": "camera",
            "idLugarInteres": None,
        },
        headers=auth_headers,
    )

    assert response.status_code == 200

    data = response.json()

    assert data["Nombre"] == "Actividad sin lugar"
    assert data["IdLugarInteres"] is None