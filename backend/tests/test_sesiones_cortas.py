"""Sesiones cortas: los WebSocket no retienen conexiones del pool mientras están
abiertos y cada request autenticado trabaja con una sola sesión.

Etapa 1 del plan de rendimiento: antes, `/ws/notifications` y `/gastos/ws/{id}`
dejaban una sesión abierta (idle in transaction) durante toda la vida del socket,
y `decode_access_token` abría una segunda sesión en cada request.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event

import app.db.session as session_module
from app.core.security import create_access_token
from app.models.recuperacion_password import TokenRecuperacionPassword
from tests.conftest import TestingSessionLocal, engine
from tests.test_gastos import _ws_url as _ws_url_gasto
from tests.test_gastos import gasto_editable, ws_gastos  # noqa: F401 (fixtures)


class _ContadorSesiones:
    """Reemplaza `SessionLocal`: cuenta las sesiones creadas y las que siguen abiertas."""

    def __init__(self):
        self.creadas = 0
        self.abiertas = set()

    def __call__(self):
        sesion = TestingSessionLocal()
        self.creadas += 1
        self.abiertas.add(id(sesion))
        cerrar_original = sesion.close

        def cerrar():
            self.abiertas.discard(id(sesion))
            cerrar_original()

        sesion.close = cerrar
        return sesion


@pytest.fixture
def sesiones(monkeypatch):
    contador = _ContadorSesiones()
    monkeypatch.setattr(session_module, "SessionLocal", contador)
    return contador


def _token(usuario):
    return create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})


# --- WebSockets ---------------------------------------------------------------

def test_ws_notificaciones_no_retiene_sesiones_mientras_esta_abierto(
    client, usuario_activo, sesiones
):
    url = f"/api/v1/notificaciones/ws/notifications?token={_token(usuario_activo)}"
    with client.websocket_connect(url):
        assert sesiones.creadas >= 1, "la validación debería usar una sesión corta"
        assert sesiones.abiertas == set()


def test_ws_itinerario_no_retiene_sesiones_mientras_esta_abierto(
    client, usuario_activo, viaje_con_admin, sesiones
):
    viaje, _ = viaje_con_admin
    url = f"/ws/trips/{viaje.IdViaje}/itinerary?token={_token(usuario_activo)}"
    with client.websocket_connect(url):
        assert sesiones.creadas >= 1
        assert sesiones.abiertas == set()


def test_ws_edicion_gasto_no_retiene_sesiones_con_la_edicion_concedida(
    client, gasto_editable, ws_gastos, sesiones
):
    with client.websocket_connect(_ws_url_gasto(gasto_editable, "carla")) as ws_carla:
        assert ws_carla.receive_json()["tipo"] == "edicion_gasto_concedida"
        assert sesiones.creadas >= 1
        assert sesiones.abiertas == set()


def test_ws_edicion_gasto_no_retiene_sesiones_al_rechazar_por_edicion_en_curso(
    client, gasto_editable, ws_gastos, sesiones
):
    esc = gasto_editable
    with client.websocket_connect(_ws_url_gasto(esc, "carla")) as ws_carla:
        assert ws_carla.receive_json()["tipo"] == "edicion_gasto_concedida"

        with client.websocket_connect(_ws_url_gasto(esc, "bruno")) as ws_bruno:
            respuesta = ws_bruno.receive_json()

        # El contrato no cambia: mismo mensaje, mismos campos y el nombre de quien edita.
        assert respuesta["tipo"] == "edicion_gasto_rechazada"
        assert respuesta["idGasto"] == esc.id_gasto
        assert respuesta["codigo"] == "EXPENSE_BEING_EDITED"
        assert "Carla Test" in respuesta["mensaje"]
        assert sesiones.abiertas == set()


# --- Una sola sesión por request ----------------------------------------------

def test_users_me_usa_solo_la_sesion_del_request(client, auth_headers, sesiones):
    consultas_vigencia = []

    def registrar(conn, cursor, statement, parameters, context, executemany):
        if "TokensRecuperacionPassword" in statement:
            consultas_vigencia.append(statement)

    event.listen(engine, "before_cursor_execute", registrar)
    try:
        response = client.get("/api/v1/users/me", headers=auth_headers)
    finally:
        event.remove(engine, "before_cursor_execute", registrar)

    assert response.status_code == 200, response.text
    # get_db está reemplazado por la sesión de test: ninguna SessionLocal() propia.
    assert sesiones.creadas == 0
    # La verificación de vigencia del token es una sola consulta.
    assert len(consultas_vigencia) == 1


def _momento_posterior_al_token():
    return datetime.now(timezone.utc) + timedelta(minutes=5)


def test_token_anterior_al_cambio_de_password_se_rechaza(
    client, db_session, usuario_activo, auth_headers
):
    usuario_activo.FechaCambioPassword = _momento_posterior_al_token()
    db_session.commit()

    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 401


def test_token_anterior_al_cierre_de_sesiones_se_rechaza(
    client, db_session, usuario_activo, auth_headers
):
    usuario_activo.FechaCierreSesiones = _momento_posterior_al_token()
    db_session.commit()

    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 401


def test_token_anterior_al_restablecimiento_se_rechaza(
    client, db_session, usuario_activo, auth_headers
):
    db_session.add(
        TokenRecuperacionPassword(
            IdUsuario=usuario_activo.IdUsuario,
            TokenHash="a" * 64,
            FechaExpiracion=_momento_posterior_al_token() + timedelta(hours=1),
            FechaUso=_momento_posterior_al_token(),
        )
    )
    db_session.commit()

    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 401


def test_token_posterior_a_los_cambios_se_acepta(client, db_session, usuario_activo):
    pasado = datetime.now(timezone.utc) - timedelta(hours=1)
    usuario_activo.FechaCambioPassword = pasado
    usuario_activo.FechaCierreSesiones = pasado
    db_session.add(
        TokenRecuperacionPassword(
            IdUsuario=usuario_activo.IdUsuario,
            TokenHash="b" * 64,
            FechaExpiracion=pasado + timedelta(hours=2),
            FechaUso=pasado,
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {_token(usuario_activo)}"}
    )
    assert response.status_code == 200, response.text
