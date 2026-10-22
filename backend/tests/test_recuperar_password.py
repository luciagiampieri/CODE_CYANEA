from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy import select

from app.core.config import settings
from app.core.security import TOKEN_ACCESO, verify_password
from app.main import app
from app.models.recuperacion_password import (
    SolicitudRecuperacionPassword,
    TokenRecuperacionPassword,
)
from app.models.usuario import Usuario
from app.services.auth import password_reset_service as svc
from app.services.mail import get_mail_service

URL_FORGOT = "/api/v1/auth/forgot-password"
URL_VALIDATE = "/api/v1/auth/reset-password/validate"
URL_RESET = "/api/v1/auth/reset-password"
EMAIL = "ana@test.com"
PASSWORD_ACTUAL = "Password123!"
PASSWORD_NUEVA = "NuevaClave456#"


class _MailFalso:
    def __init__(self, resultado=True, falla=False):
        self.enviados = []
        self.resultado = resultado
        self.falla = falla

    def send_template(self, **kwargs):
        if self.falla:
            raise RuntimeError("SMTP caído")
        self.enviados.append(kwargs)
        return self.resultado


@pytest.fixture()
def mail():
    return _MailFalso()


@pytest.fixture()
def mail_api(client):
    falso = _MailFalso()
    app.dependency_overrides[get_mail_service] = lambda: falso
    return falso


def _crear_token(db_session, id_usuario, plano="token-de-prueba", **campos):
    campos.setdefault("FechaExpiracion", datetime.now(timezone.utc) + timedelta(hours=1))
    db_session.add(
        TokenRecuperacionPassword(IdUsuario=id_usuario, TokenHash=svc._sha256(plano), **campos)
    )
    db_session.commit()
    return plano


def _buscar_token(db_session, plano):
    db_session.expire_all()
    return db_session.scalar(
        select(TokenRecuperacionPassword).where(
            TokenRecuperacionPassword.TokenHash == svc._sha256(plano)
        )
    )


def _solicitudes_previas(db_session, email, cantidad, minutos_atras=10, ip=None):
    for i in range(cantidad):
        db_session.add(
            SolicitudRecuperacionPassword(
                EmailHash=svc._sha256(email),
                Ip=ip,
                Tipo=svc.TIPO_SOLICITUD,
                Fecha=datetime.now(timezone.utc) - timedelta(minutes=minutos_atras + i),
            )
        )
    db_session.commit()


def _token_del_mail(mail):
    return mail.enviados[-1]["context"]["reset_url"].split("token=")[1]


def _hash_actual(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).HashedPassword


def _token_emitido_hace(usuario, segundos):
    emitido = datetime.now(timezone.utc) - timedelta(seconds=segundos)
    return jwt.encode(
        {
            "sub": usuario.Email,
            "user_id": usuario.IdUsuario,
            "iat": emitido,
            "exp": emitido + timedelta(hours=1),
            "type": TOKEN_ACCESO,
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


@pytest.mark.parametrize("email", ["", "   ", None])
def test_solicitar_rechaza_email_vacio(db_session, mail, email):
    with pytest.raises(HTTPException) as error:
        svc.solicitar_recuperacion(db_session, mail, email, ip=None)
    assert error.value.status_code == 400
    assert error.value.detail == "Ingresá tu correo electrónico."


@pytest.mark.parametrize("email", ["sin-arroba", "a@b", "a b@c.com", "a" * 250 + "@x.com"])
def test_solicitar_rechaza_email_invalido(db_session, mail, email):
    with pytest.raises(HTTPException) as error:
        svc.solicitar_recuperacion(db_session, mail, email, ip=None)
    assert error.value.status_code == 400
    assert "correo electrónico válido" in error.value.detail


def test_solicitar_normaliza_mayusculas_y_espacios(db_session, mail, usuario_activo):
    svc.solicitar_recuperacion(db_session, mail, "  ANA@Test.COM ", ip=None)

    assert mail.enviados[0]["to"] == [EMAIL]


def test_email_inexistente_no_envia_correo_y_registra_solo_el_hash(db_session, mail):
    svc.solicitar_recuperacion(db_session, mail, "nadie@test.com", ip="1.1.1.1")

    assert mail.enviados == []
    solicitud = db_session.scalar(select(SolicitudRecuperacionPassword))
    assert solicitud.IdUsuario is None
    assert solicitud.EmailHash == svc._sha256("nadie@test.com")
    assert solicitud.Ip == "1.1.1.1"


def test_usuario_inactivo_se_trata_como_inexistente(db_session, mail, usuario_activo):
    usuario_activo.Activo = False
    db_session.commit()

    svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)

    assert mail.enviados == []
    assert db_session.scalar(select(TokenRecuperacionPassword)) is None


@pytest.mark.parametrize(
    ("fixture_usuario", "proveedor"),
    [("usuario_google", "Google"), ("usuario_facebook", "Facebook")],
)
def test_cuenta_social_recibe_instrucciones_y_no_token(
    request, db_session, mail, fixture_usuario, proveedor
):
    usuario = request.getfixturevalue(fixture_usuario)

    svc.solicitar_recuperacion(db_session, mail, usuario.Email, ip=None)

    correo = mail.enviados[0]
    assert correo["template_name"] == "password_social.html"
    assert correo["text_template_name"] == "password_social.txt"
    assert correo["context"]["proveedor"] == proveedor
    assert db_session.scalar(select(TokenRecuperacionPassword)) is None


def test_usuario_local_recibe_enlace_y_el_token_se_guarda_hasheado(db_session, mail, usuario_activo):
    svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)

    correo = mail.enviados[0]
    assert correo["template_name"] == "password_reset.html"
    assert correo["context"]["vigencia_horas"] == svc.TOKEN_VIGENCIA_HORAS
    plano = _token_del_mail(mail)
    token = _buscar_token(db_session, plano)
    assert token is not None
    assert token.TokenHash != plano
    svc.validar_token(db_session, plano)


def test_nueva_solicitud_invalida_el_token_anterior(db_session, mail, usuario_activo):
    svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)
    primero = _token_del_mail(mail)
    solicitud = db_session.scalar(select(SolicitudRecuperacionPassword))
    solicitud.Fecha = datetime.now(timezone.utc) - timedelta(minutes=2)
    db_session.commit()

    svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)
    segundo = _token_del_mail(mail)

    with pytest.raises(HTTPException) as error:
        svc.validar_token(db_session, primero)
    assert error.value.status_code == 410
    svc.validar_token(db_session, segundo)


def test_cooldown_entre_solicitudes(db_session, mail, usuario_activo):
    svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)

    with pytest.raises(HTTPException) as error:
        svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)

    assert error.value.status_code == 429
    assert 0 < int(error.value.headers["Retry-After"]) <= svc.ESPERA_ENTRE_SOLICITUDES_SEGUNDOS
    assert len(mail.enviados) == 1


def test_limite_por_hora_por_email(db_session, mail, usuario_activo):
    _solicitudes_previas(db_session, EMAIL, svc.MAX_SOLICITUDES_POR_HORA)

    with pytest.raises(HTTPException) as error:
        svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)

    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"] == "3600"
    assert mail.enviados == []


def test_limite_por_hora_por_ip_aunque_cambie_el_email(db_session, mail):
    for i in range(svc.MAX_SOLICITUDES_POR_HORA):
        _solicitudes_previas(db_session, f"otro{i}@test.com", 1, ip="9.9.9.9")

    with pytest.raises(HTTPException) as error:
        svc.solicitar_recuperacion(db_session, mail, "nuevo@test.com", ip="9.9.9.9")

    assert error.value.status_code == 429


def test_solicitudes_de_hace_mas_de_una_hora_no_cuentan(db_session, mail, usuario_activo):
    _solicitudes_previas(db_session, EMAIL, svc.MAX_SOLICITUDES_POR_HORA, minutos_atras=90)

    svc.solicitar_recuperacion(db_session, mail, EMAIL, ip=None)

    assert len(mail.enviados) == 1


def test_falla_del_correo_devuelve_503(db_session, usuario_activo):
    with pytest.raises(HTTPException) as error:
        svc.solicitar_recuperacion(db_session, _MailFalso(falla=True), EMAIL, ip=None)

    assert error.value.status_code == 503
    assert error.value.detail == svc.MENSAJE_ERROR_ENVIO


def test_correo_deshabilitado_en_desarrollo_no_rompe(db_session, usuario_activo, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")

    svc.solicitar_recuperacion(db_session, _MailFalso(resultado=False), EMAIL, ip=None)

    assert db_session.scalar(select(TokenRecuperacionPassword)) is not None


@pytest.mark.parametrize("plano", ["", "   ", None, "no-existe"])
def test_token_vacio_o_inexistente_es_410(db_session, plano):
    with pytest.raises(HTTPException) as error:
        svc.validar_token(db_session, plano)

    assert error.value.status_code == 410
    assert error.value.detail == svc.MENSAJE_ENLACE_INVALIDO


@pytest.mark.parametrize(
    "campos",
    [
        {"FechaExpiracion": datetime.now(timezone.utc) - timedelta(minutes=1)},
        {"FechaUso": datetime.now(timezone.utc)},
        {"FechaInvalidacion": datetime.now(timezone.utc)},
    ],
    ids=["vencido", "usado", "invalidado"],
)
def test_token_no_utilizable_es_410(db_session, usuario_activo, campos):
    plano = _crear_token(db_session, usuario_activo.IdUsuario, **campos)

    with pytest.raises(HTTPException) as error:
        svc.validar_token(db_session, plano)

    assert error.value.status_code == 410


def test_token_de_usuario_desactivado_es_410(db_session, usuario_activo):
    plano = _crear_token(db_session, usuario_activo.IdUsuario)
    usuario_activo.Activo = False
    db_session.commit()

    with pytest.raises(HTTPException) as error:
        svc.validar_token(db_session, plano)

    assert error.value.status_code == 410


def test_token_de_cuenta_social_es_410(db_session, usuario_google):
    plano = _crear_token(db_session, usuario_google.IdUsuario)

    with pytest.raises(HTTPException) as error:
        svc.validar_token(db_session, plano)

    assert error.value.status_code == 410


def test_token_de_usuario_inexistente_es_410(db_session):
    plano = _crear_token(db_session, 9999)

    with pytest.raises(HTTPException) as error:
        svc.validar_token(db_session, plano)

    assert error.value.status_code == 410


@pytest.mark.parametrize(
    ("password", "falta"),
    [
        ("Ab1#xyz", "al menos 8 caracteres"),
        ("nuevaclave456#", "una letra mayúscula"),
        ("NUEVACLAVE456#", "una letra minúscula"),
        ("NuevaClave####", "un número"),
        ("NuevaClave4567", "un carácter especial"),
    ],
)
def test_reglas_password_detectan_cada_faltante(password, falta):
    assert falta in svc.validar_reglas_password(password)


def test_password_valida_no_tiene_faltantes():
    assert svc.validar_reglas_password(PASSWORD_NUEVA) == []


def test_restablecer_exitoso(db_session, mail, usuario_activo):
    plano = _crear_token(db_session, usuario_activo.IdUsuario)

    svc.restablecer_password(db_session, mail, plano, PASSWORD_NUEVA, PASSWORD_NUEVA)

    hashed = _hash_actual(db_session, usuario_activo)
    assert verify_password(PASSWORD_NUEVA, hashed)
    assert not verify_password(PASSWORD_ACTUAL, hashed)
    assert _buscar_token(db_session, plano).FechaUso is not None
    assert mail.enviados[0]["template_name"] == "password_changed.html"
    assert mail.enviados[0]["to"] == [EMAIL]
    cambio = db_session.scalar(
        select(SolicitudRecuperacionPassword).where(
            SolicitudRecuperacionPassword.Tipo == svc.TIPO_CAMBIO
        )
    )
    assert cambio.IdUsuario == usuario_activo.IdUsuario


def test_token_no_se_puede_reutilizar(db_session, mail, usuario_activo):
    plano = _crear_token(db_session, usuario_activo.IdUsuario)
    svc.restablecer_password(db_session, mail, plano, PASSWORD_NUEVA, PASSWORD_NUEVA)

    with pytest.raises(HTTPException) as error:
        svc.restablecer_password(db_session, mail, plano, "OtraClave789$", "OtraClave789$")

    assert error.value.status_code == 410


def test_restablecer_invalida_los_demas_tokens_pendientes(db_session, mail, usuario_activo):
    usado = _crear_token(db_session, usuario_activo.IdUsuario, plano="uno")
    otro = _crear_token(db_session, usuario_activo.IdUsuario, plano="dos")

    svc.restablecer_password(db_session, mail, usado, PASSWORD_NUEVA, PASSWORD_NUEVA)

    assert _buscar_token(db_session, otro).FechaInvalidacion is not None


@pytest.mark.parametrize(
    ("password", "confirmacion", "mensaje"),
    [
        ("", PASSWORD_NUEVA, "Ingresá y confirmá la nueva contraseña."),
        (PASSWORD_NUEVA, "", "Ingresá y confirmá la nueva contraseña."),
        (PASSWORD_NUEVA, "OtraClave789$", "Las contraseñas no coinciden."),
        ("debil", "debil", "La contraseña debe tener"),
        (PASSWORD_ACTUAL, PASSWORD_ACTUAL, "distinta de la contraseña actual"),
    ],
)
def test_restablecer_validaciones(db_session, mail, usuario_activo, password, confirmacion, mensaje):
    plano = _crear_token(db_session, usuario_activo.IdUsuario)

    with pytest.raises(HTTPException) as error:
        svc.restablecer_password(db_session, mail, plano, password, confirmacion)

    assert error.value.status_code == 400
    assert mensaje in error.value.detail
    assert verify_password(PASSWORD_ACTUAL, _hash_actual(db_session, usuario_activo))
    assert _buscar_token(db_session, plano).FechaUso is None
    assert mail.enviados == []


def test_falla_del_correo_de_confirmacion_no_revierte_el_cambio(db_session, usuario_activo):
    plano = _crear_token(db_session, usuario_activo.IdUsuario)

    svc.restablecer_password(
        db_session, _MailFalso(falla=True), plano, PASSWORD_NUEVA, PASSWORD_NUEVA
    )

    assert verify_password(PASSWORD_NUEVA, _hash_actual(db_session, usuario_activo))


def test_endpoint_responde_lo_mismo_exista_o_no_el_correo(client, usuario_activo, mail_api):
    existente = client.post(URL_FORGOT, json={"email": EMAIL})
    inexistente = client.post(URL_FORGOT, json={"email": "nadie@test.com"})

    assert existente.status_code == inexistente.status_code == 200
    assert existente.json()["message"] == inexistente.json()["message"] == svc.MENSAJE_GENERICO
    assert len(mail_api.enviados) == 1


def test_endpoint_cooldown_devuelve_429_con_retry_after(client, usuario_activo, mail_api):
    client.post(URL_FORGOT, json={"email": EMAIL})

    respuesta = client.post(URL_FORGOT, json={"email": EMAIL})

    assert respuesta.status_code == 429
    assert "Retry-After" in respuesta.headers


def test_endpoint_validar_token_invalido_devuelve_410(client):
    respuesta = client.post(URL_VALIDATE, json={"token": "no-existe"})

    assert respuesta.status_code == 410
    assert respuesta.json()["detail"] == svc.MENSAJE_ENLACE_INVALIDO


def test_flujo_completo_de_recuperacion(client, usuario_activo, mail_api):
    client.post(URL_FORGOT, json={"email": EMAIL})
    token = _token_del_mail(mail_api)

    validacion = client.post(URL_VALIDATE, json={"token": token})
    assert validacion.status_code == 200
    assert validacion.json()["valid"] is True

    reset = client.post(
        URL_RESET,
        json={"token": token, "password": PASSWORD_NUEVA, "confirmPassword": PASSWORD_NUEVA},
    )
    assert reset.status_code == 200, reset.text

    vieja = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD_ACTUAL})
    nueva = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD_NUEVA})
    assert vieja.status_code == 401
    assert nueva.status_code == 200
    assert client.post(URL_VALIDATE, json={"token": token}).status_code == 410


def test_restablecer_cierra_las_sesiones_abiertas(client, db_session, usuario_activo, mail_api):
    sesion_previa = {"Authorization": f"Bearer {_token_emitido_hace(usuario_activo, 60)}"}
    assert client.get("/api/v1/users/me", headers=sesion_previa).status_code == 200
    plano = _crear_token(db_session, usuario_activo.IdUsuario)

    client.post(
        URL_RESET,
        json={"token": plano, "password": PASSWORD_NUEVA, "confirmPassword": PASSWORD_NUEVA},
    )

    assert client.get("/api/v1/users/me", headers=sesion_previa).status_code == 401