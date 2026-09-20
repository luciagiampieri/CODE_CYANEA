import asyncio
import json

import pytest

from app.api.routes import notificaciones as notificaciones_module
from app.core.security import create_access_token
from tests.conftest import TestingSessionLocal


WS_URL = "/api/v1/notificaciones/ws/notifications"


@pytest.fixture(autouse=True)
def _ws_usa_sesion_de_test(monkeypatch):
    monkeypatch.setattr(notificaciones_module, "SessionLocal", TestingSessionLocal)


def _ws_url(token):
    return f"{WS_URL}?token={token}"


def _token(usuario):
    return create_access_token(
        {"sub": usuario.Email, "user_id": usuario.IdUsuario}
    )


def test_ws_notificaciones_conecta_con_token_valido(client, usuario_activo):
    with client.websocket_connect(_ws_url(_token(usuario_activo))):
        pass


def test_ws_notificaciones_rechaza_token_invalido(client):
    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url("token-invalido")) as websocket:
            websocket.receive_text()


def test_ws_notificaciones_rechaza_usuario_inactivo(
    client, db_session, usuario_activo
):
    usuario_activo.Activo = False
    db_session.commit()

    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(_token(usuario_activo))) as websocket:
            websocket.receive_text()


def test_ws_notificaciones_libera_la_conexion_al_desconectar(
    client, usuario_activo
):
    with client.websocket_connect(_ws_url(_token(usuario_activo))):
        assert usuario_activo.IdUsuario in notificaciones_module.manager._conexiones_por_usuario

    assert usuario_activo.IdUsuario not in notificaciones_module.manager._conexiones_por_usuario


def test_ws_notificaciones_rechaza_token_sin_usuario(client):
    token = create_access_token({"sub": "sin-id@example.com"})

    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(token)) as websocket:
            websocket.receive_text()


def test_ws_notificaciones_rechaza_usuario_inexistente(client):
    token = create_access_token(
        {"sub": "inexistente@example.com", "user_id": 999999}
    )

    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(token)) as websocket:
            websocket.receive_text()


def test_manager_broadcast_notificaciones_aisla_por_usuario(usuario_activo):
    class FakeWebSocket:
        def __init__(self):
            self.eventos = []

        async def accept(self):
            pass

        async def send_text(self, payload):
            self.eventos.append(json.loads(payload))

    async def scenario():
        otro_usuario_id = usuario_activo.IdUsuario + 1000
        websocket_propio = FakeWebSocket()
        websocket_ajeno = FakeWebSocket()
        manager = notificaciones_module.manager

        await manager.connect_user(usuario_activo.IdUsuario, websocket_propio)
        await manager.connect_user(otro_usuario_id, websocket_ajeno)
        try:
            await manager.broadcast_to_user(
                usuario_activo.IdUsuario,
                {"tipo": "notificacion_creada", "id": 42},
            )

            assert websocket_propio.eventos == [
                {"tipo": "notificacion_creada", "id": 42}
            ]
            assert websocket_ajeno.eventos == []
        finally:
            manager.disconnect_user(usuario_activo.IdUsuario, websocket_propio)
            manager.disconnect_user(otro_usuario_id, websocket_ajeno)

    asyncio.run(scenario())
