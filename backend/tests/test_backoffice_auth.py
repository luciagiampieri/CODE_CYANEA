from datetime import timedelta

import pytest

from app.core.security import create_access_token, hash_password
from app.models.auditoria_acceso_backoffice import AuditoriaAccesoBackoffice
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario
from app.services.backoffice import auth_service as bo

LOGIN = "/api/v1/backoffice/auth/login"
ME = "/api/v1/backoffice/auth/me"
LOGOUT = "/api/v1/backoffice/auth/logout"
PASS = "Segura123!"


@pytest.fixture(autouse=True)
def roles_sistema(db_session):
    if db_session.get(RolSistema, ROL_VIAJERO) is None:
        db_session.add_all([
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ])
        db_session.commit()


def _crear_usuario(db_session, email, rol):
    usuario = Usuario(
        Email=email,
        Nombre="Nombre",
        Apellido="Apellido",
        NombreUsuario=email.split("@")[0],
        HashedPassword=hash_password(PASS),
        Activo=True,
        EmailConfirmado=True,
        IdRolSistema=rol,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def admin(db_session):
    return _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)


@pytest.fixture
def viajero(db_session):
    return _crear_usuario(db_session, "viajero@cyanea.test", ROL_VIAJERO)


def _login(client, email, password=PASS):
    return client.post(LOGIN, json={"email": email, "password": password})


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _mover_reloj(monkeypatch, delta):
    futuro = bo.ahora() + delta
    monkeypatch.setattr(bo, "ahora", lambda: futuro)


def test_admin_inicia_sesion(client, admin):
    r = _login(client, admin.Email)
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert client.get(ME, headers=_auth(token)).status_code == 200


def test_viajero_no_puede_iniciar_sesion(client, viajero):
    r = _login(client, viajero.Email)
    assert r.status_code == 401
    assert r.json()["detail"] == bo.MENSAJE_GENERICO


def test_mensaje_generico_identico(client, admin, viajero):
    r_pass_mala = _login(client, admin.Email, "incorrecta")
    r_inexistente = _login(client, "nadie@cyanea.test", "incorrecta")
    r_viajero = _login(client, viajero.Email)
    assert r_pass_mala.status_code == r_inexistente.status_code == r_viajero.status_code == 401
    assert r_pass_mala.json() == r_inexistente.json() == r_viajero.json()


def test_bloqueo_tras_5_fallos_y_desbloqueo(client, admin, monkeypatch):
    for _ in range(5):
        assert _login(client, admin.Email, "incorrecta").status_code == 401

    assert _login(client, admin.Email).status_code == 429

    _mover_reloj(monkeypatch, timedelta(minutes=16))
    assert _login(client, admin.Email).status_code == 200


def test_tras_desbloqueo_un_error_no_vuelve_a_bloquear(client, admin, monkeypatch):
    for _ in range(5):
        _login(client, admin.Email, "incorrecta")
    _mover_reloj(monkeypatch, timedelta(minutes=16))
    assert _login(client, admin.Email, "incorrecta").status_code == 401
    assert _login(client, admin.Email).status_code == 200


def test_token_de_viajero_rechazado(client, viajero):
    token = create_access_token({"sub": viajero.Email, "user_id": viajero.IdUsuario})
    assert client.get(ME, headers=_auth(token)).status_code == 401


def test_sin_token_rechazado(client):
    assert client.get(ME).status_code == 401


def test_sesion_expira_por_inactividad(client, admin, monkeypatch):
    token = _login(client, admin.Email).json()["access_token"]
    _mover_reloj(monkeypatch, timedelta(minutes=31))
    assert client.get(ME, headers=_auth(token)).status_code == 401


def test_actividad_renueva_la_sesion(client, admin, monkeypatch):
    token = _login(client, admin.Email).json()["access_token"]
    _mover_reloj(monkeypatch, timedelta(minutes=20))
    assert client.get(ME, headers=_auth(token)).status_code == 200
    _mover_reloj(monkeypatch, timedelta(minutes=20))
    assert client.get(ME, headers=_auth(token)).status_code == 200


def test_logout_invalida_el_token(client, admin):
    token = _login(client, admin.Email).json()["access_token"]
    assert client.post(LOGOUT, headers=_auth(token)).status_code == 204
    assert client.get(ME, headers=_auth(token)).status_code == 401


def test_auditoria_registra_exito_y_fallo(client, db_session, admin):
    _login(client, admin.Email, "incorrecta")
    _login(client, admin.Email)
    filas = db_session.query(AuditoriaAccesoBackoffice).filter_by(Email=admin.Email).all()
    assert {(f.Exitoso, f.Motivo) for f in filas} == {
        (False, bo.MOTIVO_CREDENCIALES),
        (True, bo.MOTIVO_EXITO),
    }


def test_registro_publico_no_crea_admins(client, db_session):
    r = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Colado",
            "apellido": "Test",
            "nombreUsuario": "colado",
            "email": "colado@cyanea.com.ar",
            "password": PASS,
            "aceptaTerminos": True,
            "IdRolSistema": ROL_ADMIN_SISTEMA,
        },
    )
    assert r.status_code == 201, r.text
    usuario = db_session.query(Usuario).filter_by(Email="colado@cyanea.com.ar").one()
    assert usuario.IdRolSistema == ROL_VIAJERO