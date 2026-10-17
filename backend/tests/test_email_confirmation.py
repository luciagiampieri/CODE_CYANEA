import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from urllib.parse import parse_qs, urlparse

import pytest
from jose import jwt

from app.core.config import settings
from app.main import app
from app.models.solicitud_confirmacion_email import SolicitudConfirmacionEmail as Solicitud
from app.services.mail import get_mail_service

URL = "/api/v1/auth/resend-confirmation"


@pytest.fixture
def mail(client):
    service = Mock()
    app.dependency_overrides[get_mail_service] = lambda: service
    return service


def test_reenvio_confirma_y_permite_login(client, db_session, usuario_activo, mail):
    usuario_activo.EmailConfirmado = False
    db_session.commit()
    anterior = jwt.encode(
        {
            "sub": usuario_activo.Email,
            "type": "email_confirm",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    result = client.post(URL, json={"email": "  ANA@TEST.COM  "})
    assert result.status_code == 200
    envio = mail.send_template.call_args.kwargs
    assert envio["to"] == [usuario_activo.Email]
    token = parse_qs(urlparse(envio["context"]["confirm_url"]).query)["token"][0]
    claims = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    assert claims["type"] == "email_confirm"
    assert abs(claims["exp"] - datetime.now(timezone.utc).timestamp() - 86400) < 5
    assert (
        client.get("/api/v1/auth/confirm-email", params={"token": token}, follow_redirects=False)
        .headers["location"]
        .endswith("status=ok")
    )
    assert (
        client.get("/api/v1/auth/confirm-email", params={"token": anterior}, follow_redirects=False)
        .headers["location"]
        .endswith("status=ya-confirmado")
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": usuario_activo.Email, "password": "Password123!"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize("estado", ["inexistente", "confirmada", "inactiva", "social", "baja"])
def test_respuesta_generica_sin_enviar(client, db_session, usuario_activo, mail, estado):
    if estado != "confirmada":
        usuario_activo.EmailConfirmado = False
    if estado == "inactiva":
        usuario_activo.Activo = False
    if estado == "social":
        usuario_activo.ProveedorAutenticacion = "google"
    if estado == "baja":
        usuario_activo.FechaBaja = datetime.now(timezone.utc)
    db_session.commit()
    email = "nadie@test.com" if estado == "inexistente" else usuario_activo.Email
    result = client.post(URL, json={"email": email})
    assert result.status_code == 200
    assert "Si el correo corresponde" in result.json()["message"]
    mail.send_template.assert_not_called()
    assert db_session.query(Solicitud).count() == 1


def test_cooldown_persistido_y_normalizado(client, db_session, usuario_activo, mail):
    usuario_activo.EmailConfirmado = False
    db_session.commit()
    assert client.post(URL, json={"email": usuario_activo.Email}).status_code == 200
    second = client.post(URL, json={"email": " ANA@TEST.COM "})
    assert second.status_code == 429
    assert 1 <= int(second.headers["Retry-After"]) <= 60
    assert db_session.query(Solicitud).count() == 1
    assert mail.send_template.call_count == 1


@pytest.mark.parametrize("por_ip", [False, True])
def test_limite_horario(client, db_session, por_ip):
    ahora = datetime.now(timezone.utc)
    email = "nadie@test.com"
    for i in range(5):
        db_session.add(
            Solicitud(
                EmailHash=hashlib.sha256(
                    (f"otro{i}@test.com" if por_ip else email).encode()
                ).hexdigest(),
                Ip="testclient" if por_ip else None,
                Fecha=ahora - timedelta(minutes=i + 2),
            )
        )
    db_session.commit()
    result = client.post(URL, json={"email": email})
    assert result.status_code == 429
    assert result.headers["Retry-After"] == "3600"


def test_proveedor_fallido_no_revela_cuenta_y_registra_intento(
    client, db_session, usuario_activo, mail, caplog
):
    usuario_activo.EmailConfirmado = False
    db_session.commit()
    mail.send_template.side_effect = RuntimeError("SMTP unavailable")
    assert client.post(URL, json={"email": usuario_activo.Email}).status_code == 200
    assert db_session.query(Solicitud).count() == 1
    assert "No se pudo enviar" in caplog.text
    assert not usuario_activo.EmailConfirmado


@pytest.mark.parametrize("email", ["", "sin-arroba", "a@b", "x" * 256])
def test_email_invalido(client, db_session, email):
    assert client.post(URL, json={"email": email}).status_code in (400, 422)
    assert db_session.query(Solicitud).count() == 0


def test_login_codigo_solo_con_password_correcta(client, db_session, usuario_activo):
    usuario_activo.EmailConfirmado = False
    db_session.commit()
    bad = client.post(
        "/api/v1/auth/login", json={"email": usuario_activo.Email, "password": "incorrecta"}
    )
    assert bad.status_code == 401
    assert "X-Error-Code" not in bad.headers
    good = client.post(
        "/api/v1/auth/login", json={"email": usuario_activo.Email, "password": "Password123!"}
    )
    assert good.status_code == 403
    assert good.headers["X-Error-Code"] == "EMAIL_CONFIRMATION_REQUIRED"


def test_cors_expone_headers(client):
    result = client.options(
        URL, headers={"Origin": "http://localhost:8081", "Access-Control-Request-Method": "POST"}
    )
    assert result.status_code == 200
    response = client.post(
        URL, json={"email": "nadie@test.com"}, headers={"Origin": "http://localhost:8081"}
    )
    assert "Retry-After" in response.headers["access-control-expose-headers"]


def test_enlace_vencido_no_confirma_y_reenvio_permite_recuperar(
    client, db_session, usuario_activo, mail
):
    usuario_activo.EmailConfirmado = False
    db_session.commit()
    token = jwt.encode(
        {
            "sub": usuario_activo.Email,
            "type": "email_confirm",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    response = client.get(
        "/api/v1/auth/confirm-email", params={"token": token}, follow_redirects=False
    )
    assert response.headers["location"].endswith("status=error")
    db_session.refresh(usuario_activo)
    assert not usuario_activo.EmailConfirmado
    assert client.post(URL, json={"email": usuario_activo.Email}).status_code == 200
    mail.send_template.assert_called_once()
