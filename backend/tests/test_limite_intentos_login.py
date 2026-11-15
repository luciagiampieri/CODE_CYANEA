"""Fuerza bruta en el login y documentación de la API en producción (QA)."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.main import opciones_documentacion
from app.services.auth import limite_intentos_login
from app.services.auth.limite_intentos_login import MAX_INTENTOS_FALLIDOS, VENTANA_SEGUNDOS

URL_LOGIN = "/api/v1/auth/login"


def _login(client, password="Incorrecta123!", email="ana@test.com"):
    return client.post(URL_LOGIN, json={"email": email, "password": password})


def test_despues_de_10_intentos_fallidos_responde_429(client, usuario_activo):
    for _ in range(MAX_INTENTOS_FALLIDOS):
        assert _login(client).status_code == 401

    response = _login(client)

    assert response.status_code == 429
    assert "Demasiados intentos fallidos de inicio de sesión" in response.json()["detail"]
    assert int(response.headers["Retry-After"]) > 0
    assert response.headers["X-Error-Code"] == "LOGIN_RATE_LIMITED"


def test_bloqueado_ni_siquiera_la_contrasena_correcta_entra(client, usuario_activo):
    for _ in range(MAX_INTENTOS_FALLIDOS):
        _login(client)

    assert _login(client, password="Password123!").status_code == 429


def test_el_limite_es_por_email(client, usuario_activo):
    for _ in range(MAX_INTENTOS_FALLIDOS):
        _login(client)

    assert _login(client, email="otra@test.com").status_code == 401


def test_el_email_se_compara_sin_mayusculas_ni_espacios(client, usuario_activo):
    for _ in range(MAX_INTENTOS_FALLIDOS):
        _login(client, email="ANA@test.com ")

    assert _login(client).status_code == 429


def test_un_login_exitoso_reinicia_el_contador(client, usuario_activo):
    for _ in range(MAX_INTENTOS_FALLIDOS - 1):
        _login(client)
    assert _login(client, password="Password123!").status_code == 200

    for _ in range(MAX_INTENTOS_FALLIDOS - 1):
        assert _login(client).status_code == 401


def test_el_bloqueo_se_levanta_cuando_pasa_la_ventana():
    limite_intentos_login.reiniciar()
    for segundo in range(MAX_INTENTOS_FALLIDOS):
        limite_intentos_login.registrar_fallo("1.2.3.4", "ana@test.com", ahora=float(segundo))

    with pytest.raises(HTTPException) as bloqueo:
        limite_intentos_login.verificar("1.2.3.4", "ana@test.com", ahora=60.0)
    assert bloqueo.value.status_code == 429

    # El intento más viejo (segundo 0) sale de la ventana: queda un lugar libre.
    limite_intentos_login.verificar("1.2.3.4", "ana@test.com", ahora=VENTANA_SEGUNDOS + 0.5)
    limite_intentos_login.reiniciar()


def test_en_produccion_no_se_publica_la_documentacion():
    app = FastAPI(**opciones_documentacion("production"))
    cliente = TestClient(app)

    assert cliente.get("/docs").status_code == 404
    assert cliente.get("/redoc").status_code == 404
    assert cliente.get("/api/v1/openapi.json").status_code == 404


def test_fuera_de_produccion_la_documentacion_sigue_disponible(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/api/v1/openapi.json").status_code == 200
