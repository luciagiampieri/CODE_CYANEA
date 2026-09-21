from datetime import datetime, timedelta

from app.core.security import create_access_token, hash_password
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario


NOTIFICATIONS_URL = "/api/v1/notificaciones"


def _crear_usuario(db_session, *, nombre_usuario, email):
    usuario = Usuario(
        Nombre=nombre_usuario,
        Apellido="Test",
        NombreUsuario=nombre_usuario,
        Email=email,
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _headers(usuario):
    token = create_access_token(
        {"sub": usuario.Email, "user_id": usuario.IdUsuario}
    )
    return {"Authorization": f"Bearer {token}"}


def _crear_notificacion(
    db_session,
    usuario,
    *,
    titulo,
    fecha_creacion,
    leida=False,
):
    notificacion = Notificacion(
        IdUsuario=usuario.IdUsuario,
        Tipo="viaje_actualizado",
        Titulo=titulo,
        Mensaje=f"Mensaje de {titulo}",
        Leida=leida,
        FechaCreacion=fecha_creacion,
    )
    db_session.add(notificacion)
    db_session.commit()
    db_session.refresh(notificacion)
    return notificacion


def test_listar_notificaciones_requiere_autenticacion(client):
    response = client.get(NOTIFICATIONS_URL)

    assert response.status_code == 401


def test_listar_notificaciones_solo_devuelve_las_propias_y_ordenadas(
    client, db_session, usuario_activo
):
    otro_usuario = _crear_usuario(
        db_session,
        nombre_usuario="bruno_test",
        email="bruno@test.com",
    )
    ahora = datetime(2026, 9, 20, 12, 0, 0)
    mas_nueva = _crear_notificacion(
        db_session,
        usuario_activo,
        titulo="Más nueva",
        fecha_creacion=ahora + timedelta(minutes=2),
    )
    mas_vieja = _crear_notificacion(
        db_session,
        usuario_activo,
        titulo="Más vieja",
        fecha_creacion=ahora,
    )
    _crear_notificacion(
        db_session,
        otro_usuario,
        titulo="De otro usuario",
        fecha_creacion=ahora + timedelta(minutes=3),
    )

    response = client.get(NOTIFICATIONS_URL, headers=_headers(usuario_activo))

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [
        mas_nueva.IdNotificacion,
        mas_vieja.IdNotificacion,
    ]
    assert [item["titulo"] for item in body] == ["Más nueva", "Más vieja"]
    assert all(item["leida"] is False for item in body)


def test_marcar_notificacion_propia_como_leida(client, db_session, usuario_activo):
    notificacion = _crear_notificacion(
        db_session,
        usuario_activo,
        titulo="Cambio de viaje",
        fecha_creacion=datetime(2026, 9, 20, 12, 0, 0),
    )

    response = client.patch(
        f"{NOTIFICATIONS_URL}/{notificacion.IdNotificacion}/read",
        headers=_headers(usuario_activo),
    )

    assert response.status_code == 200
    assert response.json()["id"] == notificacion.IdNotificacion
    assert response.json()["leida"] is True
    db_session.refresh(notificacion)
    assert notificacion.Leida is True


def test_marcar_notificacion_ajena_devuelve_404(client, db_session, usuario_activo):
    otro_usuario = _crear_usuario(
        db_session,
        nombre_usuario="carla_test",
        email="carla@test.com",
    )
    notificacion = _crear_notificacion(
        db_session,
        otro_usuario,
        titulo="Privada",
        fecha_creacion=datetime(2026, 9, 20, 12, 0, 0),
    )

    response = client.patch(
        f"{NOTIFICATIONS_URL}/{notificacion.IdNotificacion}/read",
        headers=_headers(usuario_activo),
    )

    assert response.status_code == 404
    db_session.refresh(notificacion)
    assert notificacion.Leida is False


def test_marcar_notificacion_inexistente_devuelve_404(client, auth_headers):
    response = client.patch(
        f"{NOTIFICATIONS_URL}/99999/read",
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_marcar_todas_como_leidas_solo_afecta_al_usuario_actual(
    client, db_session, usuario_activo
):
    otro_usuario = _crear_usuario(
        db_session,
        nombre_usuario="diego_test",
        email="diego@test.com",
    )
    ahora = datetime(2026, 9, 20, 12, 0, 0)
    propia_no_leida = _crear_notificacion(
        db_session,
        usuario_activo,
        titulo="Pendiente",
        fecha_creacion=ahora,
    )
    propia_leida = _crear_notificacion(
        db_session,
        usuario_activo,
        titulo="Ya leída",
        fecha_creacion=ahora + timedelta(minutes=1),
        leida=True,
    )
    ajena_no_leida = _crear_notificacion(
        db_session,
        otro_usuario,
        titulo="No tocar",
        fecha_creacion=ahora + timedelta(minutes=2),
    )

    response = client.patch(
        f"{NOTIFICATIONS_URL}/read-all",
        headers=_headers(usuario_activo),
    )

    assert response.status_code == 200
    assert response.json() == {
        "mensaje": "Notificaciones marcadas como leídas",
        "cantidad": 1,
    }
    db_session.refresh(propia_no_leida)
    db_session.refresh(propia_leida)
    db_session.refresh(ajena_no_leida)
    assert propia_no_leida.Leida is True
    assert propia_leida.Leida is True
    assert ajena_no_leida.Leida is False
