from datetime import date, timedelta

import pytest

from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.viaje import Viaje
from tests.test_trips import _agregar_participante, _crear_usuario, _token_de

URL = "/api/v1/offline/access"


def _crear_viaje(db_session, admin, fecha_inicio, fecha_fin, estado="activo"):
    estado_viaje = db_session.query(EstadoViaje).filter_by(Nombre=estado).first()
    rol_admin = db_session.query(RolParticipante).filter_by(Nombre="administrador").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()

    viaje = Viaje(
        Titulo="Viaje offline",
        FechaInicio=fecha_inicio,
        FechaFin=fecha_fin,
        IdEstadoViaje=estado_viaje.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=admin.IdUsuario,
    )
    db_session.add(viaje)
    db_session.flush()
    db_session.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=admin.IdUsuario,
            IdRolParticipante=rol_admin.IdRolParticipante,
            IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
        )
    )
    db_session.commit()
    db_session.refresh(viaje)
    return viaje


def _viaje_vigente(db_session, admin, estado="activo"):
    hoy = date.today()
    return _crear_viaje(db_session, admin, hoy + timedelta(days=10), hoy + timedelta(days=20), estado)


def test_incluye_viaje_activo_del_administrador(client, db_session, master_data, usuario_activo, auth_headers):
    viaje = _viaje_vigente(db_session, usuario_activo)

    response = client.get(URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == [viaje.IdViaje]


def test_incluye_viaje_de_participante_aceptado(client, db_session, master_data, usuario_activo):
    viaje = _viaje_vigente(db_session, usuario_activo)
    participante = _crear_usuario(db_session, "offline_aceptado")
    _agregar_participante(db_session, viaje, participante, estado_nombre="aceptado")

    response = client.get(URL, headers=_token_de(participante))

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == [viaje.IdViaje]


@pytest.mark.parametrize("estado", ["salio", "expulsado", "invitado", "rechazado", "cancelada", "vencida"])
def test_excluye_viaje_sin_participacion_aceptada(client, db_session, master_data, usuario_activo, estado):
    viaje = _viaje_vigente(db_session, usuario_activo)
    participante = _crear_usuario(db_session, f"offline_{estado}")
    _agregar_participante(db_session, viaje, participante, estado_nombre=estado)

    response = client.get(URL, headers=_token_de(participante))

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == []


@pytest.mark.parametrize("estado", ["cancelado", "eliminado", "finalizado"])
def test_excluye_viaje_no_activo(client, db_session, master_data, usuario_activo, auth_headers, estado):
    _viaje_vigente(db_session, usuario_activo, estado=estado)

    response = client.get(URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == []


def test_excluye_viaje_con_fecha_fin_pasada(client, db_session, master_data, usuario_activo, auth_headers):
    hoy = date.today()
    _crear_viaje(db_session, usuario_activo, hoy - timedelta(days=10), hoy - timedelta(days=1))

    response = client.get(URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == []


def test_incluye_viaje_que_termina_hoy(client, db_session, master_data, usuario_activo, auth_headers):
    hoy = date.today()
    viaje = _crear_viaje(db_session, usuario_activo, hoy - timedelta(days=3), hoy)

    response = client.get(URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == [viaje.IdViaje]


def test_no_incluye_viajes_de_otros_usuarios(client, db_session, master_data, usuario_activo, auth_headers):
    otro = _crear_usuario(db_session, "offline_otro_admin")
    _viaje_vigente(db_session, otro)

    response = client.get(URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == []


def test_devuelve_varios_viajes_ordenados(client, db_session, master_data, usuario_activo, auth_headers):
    primero = _viaje_vigente(db_session, usuario_activo)
    segundo = _viaje_vigente(db_session, usuario_activo)

    response = client.get(URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdsViajes"] == sorted([primero.IdViaje, segundo.IdViaje])


def test_requiere_autenticacion(client, master_data):
    response = client.get(URL)

    assert response.status_code in (401, 403)