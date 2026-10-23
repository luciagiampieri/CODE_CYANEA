from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from jose import jwt

from app.api.routes import auth as auth_routes
from app.core.config import settings
from app.core.security import hash_password
from app.main import app
from app.models.auditoria_suspension_usuario import AuditoriaSuspensionUsuario
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario
from app.services.mail import get_mail_service

BASE = "/api/v1/backoffice/usuarios"
LOGIN_BO = "/api/v1/backoffice/auth/login"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/users/me"
PASS = "Segura123!"
MOTIVO = "Uso indebido de la plataforma."


class _MailFalso:
    def __init__(self, falla=False):
        self.enviados = []
        self.falla = falla

    def send_template(self, **kwargs):
        if self.falla:
            raise RuntimeError("SMTP caído")
        self.enviados.append(kwargs)
        return True


@pytest.fixture(autouse=True)
def roles_sistema(db_session):
    if db_session.get(RolSistema, ROL_VIAJERO) is None:
        db_session.add_all([
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ])
        db_session.commit()


@pytest.fixture
def mail(client):
    falso = _MailFalso()
    app.dependency_overrides[get_mail_service] = lambda: falso
    return falso


def _crear_usuario(db_session, email, rol=ROL_VIAJERO, **campos):
    datos = {
        "Email": email,
        "Nombre": "Nombre",
        "Apellido": "Apellido",
        "NombreUsuario": email.split("@")[0],
        "HashedPassword": hash_password(PASS),
        "Activo": True,
        "EmailConfirmado": True,
        "IdRolSistema": rol,
    }
    datos.update(campos)
    usuario = Usuario(**datos)
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def admin(db_session):
    return _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)


@pytest.fixture
def headers_admin(client, admin):
    token = client.post(LOGIN_BO, json={"email": admin.Email, "password": PASS}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def viajero(db_session):
    return _crear_usuario(db_session, "viajero@cyanea.test")


def _token_viejo(usuario, segundos_atras=10):
    """Token de usuario emitido hace unos segundos (el iat del JWT es entero)."""
    ahora = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": usuario.Email,
            "user_id": usuario.IdUsuario,
            "type": "access",
            "iat": ahora - timedelta(seconds=segundos_atras),
            "exp": ahora + timedelta(hours=1),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _suspender(client, headers, usuario, motivo=MOTIVO):
    return client.post(f"{BASE}/{usuario.IdUsuario}/suspender", json={"motivo": motivo}, headers=headers)


def _reactivar(client, headers, usuario):
    return client.post(f"{BASE}/{usuario.IdUsuario}/reactivar", headers=headers)


# Solo administradores 

def test_viajero_no_puede_suspender(client, viajero, mail):
    token = _token_viejo(viajero)
    r = client.post(f"{BASE}/{viajero.IdUsuario}/suspender", json={"motivo": MOTIVO}, headers=_auth(token))
    assert r.status_code == 401


def test_sin_token_no_puede_suspender_ni_reactivar(client, viajero):
    assert client.post(f"{BASE}/{viajero.IdUsuario}/suspender", json={"motivo": MOTIVO}).status_code == 401
    assert client.post(f"{BASE}/{viajero.IdUsuario}/reactivar").status_code == 401


# Suspender con motivo 

def test_suspender_con_motivo(client, db_session, headers_admin, admin, viajero, mail):
    r = _suspender(client, headers_admin, viajero, "  Spam en viajes  ")
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "suspendida"

    db_session.refresh(viajero)
    assert viajero.Activo is False
    assert viajero.MotivoSuspension == "Spam en viajes"
    assert viajero.FechaSuspension is not None


# Motivo obligatorio 

@pytest.mark.parametrize("motivo", ["", "    ", "x" * 501])
def test_motivo_invalido(client, headers_admin, viajero, mail, motivo):
    r = _suspender(client, headers_admin, viajero, motivo)
    assert r.status_code == 422


def test_sin_motivo_en_el_cuerpo(client, headers_admin, viajero, mail):
    r = client.post(f"{BASE}/{viajero.IdUsuario}/suspender", json={}, headers=headers_admin)
    assert r.status_code == 422


# No puede iniciar sesión 

def test_cp3_login_con_cuenta_suspendida(client, headers_admin, viajero, mail):
    _suspender(client, headers_admin, viajero)
    r = client.post(LOGIN, json={"email": viajero.Email, "password": PASS})
    assert r.status_code == 403
    assert r.headers["X-Error-Code"] == "ACCOUNT_SUSPENDED"
    assert "suspendida" in r.json()["detail"]


def test_login_suspendido_con_password_incorrecta_no_revela_el_estado(client, headers_admin, viajero, mail):
    _suspender(client, headers_admin, viajero)
    r = client.post(LOGIN, json={"email": viajero.Email, "password": "incorrecta"})
    assert r.status_code == 401


def test_cp4_login_con_google_cuenta_suspendida(client, headers_admin, viajero, mail, monkeypatch):
    _suspender(client, headers_admin, viajero)
    monkeypatch.setattr(
        auth_routes.google_auth_service, "verify_id_token", lambda token: SimpleNamespace(sub="g-1")
    )
    monkeypatch.setattr(
        auth_routes.google_auth_service, "find_existing_user", lambda db, identity: viajero
    )
    r = client.post("/api/v1/auth/google", json={"idToken": "token"})
    assert r.status_code == 403
    assert r.headers["X-Error-Code"] == "ACCOUNT_SUSPENDED"


# Cierre de sesiones y no reviven 

def test_cp5_sesion_activa_se_cierra_y_no_revive(client, headers_admin, viajero, mail):
    viejo = _token_viejo(viajero)
    assert client.get(ME, headers=_auth(viejo)).status_code == 200

    _suspender(client, headers_admin, viajero)
    assert client.get(ME, headers=_auth(viejo)).status_code == 401

    _reactivar(client, headers_admin, viajero)
    assert client.get(ME, headers=_auth(viejo)).status_code == 401


# La información de los viajes se conserva 

def test_cp6_participacion_y_viajes_se_conservan(client, db_session, headers_admin, viaje_con_admin, usuario_activo, mail):
    viaje, participante = viaje_con_admin
    r = _suspender(client, headers_admin, usuario_activo)
    assert r.status_code == 200

    db_session.expire_all()
    assert db_session.get(ParticipanteViaje, participante.IdParticipanteViaje) is not None
    assert viaje.IdAdministrador == usuario_activo.IdUsuario


def test_suspension_no_cambia_el_plan(client, db_session, headers_admin, mail):
    pro = _crear_usuario(db_session, "pro@cyanea.test", IdPlan=2)
    _suspender(client, headers_admin, pro)
    db_session.refresh(pro)
    assert pro.IdPlan == 2


#  No se suspende a un admin 

def test_cp7_no_se_suspende_a_un_administrador(client, db_session, headers_admin, mail):
    otro = _crear_usuario(db_session, "admin2@cyanea.test", ROL_ADMIN_SISTEMA)
    r = _suspender(client, headers_admin, otro)
    assert r.status_code == 403
    assert r.headers["X-Error-Code"] == "ADMIN_PROTECTED"
    db_session.refresh(otro)
    assert otro.Activo is True


def test_un_admin_no_puede_suspenderse_a_si_mismo(client, headers_admin, admin, mail):
    assert _suspender(client, headers_admin, admin).status_code == 403


# Estados permitidos 

def test_no_se_suspende_dos_veces(client, headers_admin, viajero, mail):
    assert _suspender(client, headers_admin, viajero).status_code == 200
    r = _suspender(client, headers_admin, viajero)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == "INVALID_ACCOUNT_STATE"


def test_no_se_suspende_cuenta_pendiente_ni_inactiva(client, db_session, headers_admin, mail):
    pendiente = _crear_usuario(db_session, "pend@cyanea.test", EmailConfirmado=False)
    baja = _crear_usuario(db_session, "baja@cyanea.test", FechaBaja=datetime.now(timezone.utc))
    assert _suspender(client, headers_admin, pendiente).status_code == 409
    assert _suspender(client, headers_admin, baja).status_code == 409


def test_no_se_reactiva_una_cuenta_que_no_esta_suspendida(client, db_session, headers_admin, viajero, mail):
    assert _reactivar(client, headers_admin, viajero).status_code == 409
    baja = _crear_usuario(db_session, "baja@cyanea.test", FechaBaja=datetime.now(timezone.utc), Activo=False)
    assert _reactivar(client, headers_admin, baja).status_code == 409


def test_usuario_inexistente(client, headers_admin, mail):
    assert client.post(f"{BASE}/99999/suspender", json={"motivo": MOTIVO}, headers=headers_admin).status_code == 404
    assert client.post(f"{BASE}/99999/reactivar", headers=headers_admin).status_code == 404


#  Reactivar 

def test_cp8_reactivar_y_volver_a_iniciar_sesion(client, db_session, headers_admin, viajero, mail):
    _suspender(client, headers_admin, viajero)
    r = _reactivar(client, headers_admin, viajero)
    assert r.status_code == 200
    assert r.json()["estado"] == "activa"

    db_session.refresh(viajero)
    assert viajero.Activo is True
    assert viajero.MotivoSuspension is None

    login = client.post(LOGIN, json={"email": viajero.Email, "password": PASS})
    assert login.status_code == 200
    assert client.get(ME, headers=_auth(login.json()["access_token"])).status_code == 200


# Correos 

def test_cp9_correo_de_suspension_y_reactivacion(client, headers_admin, viajero, mail):
    _suspender(client, headers_admin, viajero)
    assert len(mail.enviados) == 1
    correo = mail.enviados[0]
    assert correo["to"] == [viajero.Email]
    assert correo["template_name"] == "account_suspended.html"
    assert correo["context"]["motivo"] == MOTIVO

    _reactivar(client, headers_admin, viajero)
    assert len(mail.enviados) == 2
    assert mail.enviados[1]["template_name"] == "account_reactivated.html"


def test_si_falla_el_correo_la_suspension_queda_aplicada(client, db_session, headers_admin, viajero):
    app.dependency_overrides[get_mail_service] = lambda: _MailFalso(falla=True)
    r = _suspender(client, headers_admin, viajero)
    assert r.status_code == 200
    db_session.refresh(viajero)
    assert viajero.Activo is False


def test_las_plantillas_de_correo_se_renderizan():
    from app.services.mail.templates import render_template

    contexto = {"nombre": "Ana", "motivo": "Spam", "fecha": "01/01/2027", "login_url": "http://x", "cyanea_icon_data_uri": ""}
    for plantilla in (
        "account_suspended.html", "account_suspended.txt",
        "account_reactivated.html", "account_reactivated.txt",
    ):
        assert "Ana" in render_template(plantilla, contexto)


#  Auditoría 

def test_cp10_suspension_y_reactivacion_quedan_auditadas(client, db_session, headers_admin, admin, viajero, mail):
    _suspender(client, headers_admin, viajero)
    _reactivar(client, headers_admin, viajero)

    filas = (
        db_session.query(AuditoriaSuspensionUsuario)
        .filter_by(IdUsuario=viajero.IdUsuario)
        .order_by(AuditoriaSuspensionUsuario.IdAuditoriaSuspension)
        .all()
    )
    assert [f.Accion for f in filas] == ["SUSPENSION", "REACTIVACION"]
    assert filas[0].Motivo == MOTIVO
    assert filas[0].IdAdministrador == admin.IdUsuario
    assert filas[0].FechaHora is not None


def test_operaciones_rechazadas_no_se_auditan(client, db_session, headers_admin, viajero, mail):
    _suspender(client, headers_admin, viajero, "")
    _reactivar(client, headers_admin, viajero)
    assert db_session.query(AuditoriaSuspensionUsuario).count() == 0


#  Historial / detalle 

def test_historial_de_suspensiones(client, headers_admin, viajero, mail):
    url = f"{BASE}/{viajero.IdUsuario}/suspensiones"
    assert client.get(url, headers=headers_admin).json()["suspendida"] is False

    _suspender(client, headers_admin, viajero)
    datos = client.get(url, headers=headers_admin).json()
    assert datos["suspendida"] is True
    assert datos["motivoVigente"] == MOTIVO
    assert datos["administrador"] == "Nombre Apellido"
    assert datos["fechaSuspension"] is not None
    assert [e["accion"] for e in datos["historial"]] == ["suspension"]

    _reactivar(client, headers_admin, viajero)
    datos = client.get(url, headers=headers_admin).json()
    assert datos["suspendida"] is False
    assert datos["motivoVigente"] is None
    assert [e["accion"] for e in datos["historial"]] == ["reactivacion", "suspension"]


def test_historial_de_admin_o_inexistente_da_404(client, headers_admin, admin):
    assert client.get(f"{BASE}/{admin.IdUsuario}/suspensiones", headers=headers_admin).status_code == 404
    assert client.get(f"{BASE}/99999/suspensiones", headers=headers_admin).status_code == 404