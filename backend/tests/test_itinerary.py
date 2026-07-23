import pytest
from datetime import date as date_type

from app.api.routes import itinerary as itinerary_module
from app.core.security import create_access_token, hash_password
from app.models.dia_cronograma import DiaCronograma
from app.models.usuario import Usuario
from tests.conftest import TestingSessionLocal


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


def _ws_url(trip_id, token):
    return f"/ws/trips/{trip_id}/itinerary?token={token}"


def test_ws_conecta_si_es_admin_del_viaje(client, usuario_activo, viaje_con_admin):
    viaje, _ = viaje_con_admin
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})

    with client.websocket_connect(_ws_url(viaje.IdViaje, token)):
        pass  # si la conexión se acepta, no debería tirar excepción


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
    """Dos viajes distintos: crear una actividad en uno no debe emitir nada
    a quien está conectado escuchando el itinerario del otro."""
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