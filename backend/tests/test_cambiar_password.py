"""US 101: cambiar la contraseña desde "Mi cuenta".

Los casos de prueba de la US se mapean como CP1 a CP9.
"""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import TOKEN_ACCESO, create_access_token, verify_password
from app.models.usuario import Usuario
from app.services.mail import get_mail_service
from app.main import app

URL = "/api/v1/users/me/password"
PASSWORD_ACTUAL = "Password123!"
PASSWORD_NUEVA = "NuevaClave456#"


class _MailFalso:
    def __init__(self, falla=False):
        self.enviados = []
        self.falla = falla

    def send_template(self, **kwargs):
        if self.falla:
            raise RuntimeError("SMTP caído")
        self.enviados.append(kwargs)


@pytest.fixture()
def mail(client):
    falso = _MailFalso()
    app.dependency_overrides[get_mail_service] = lambda: falso
    return falso


def _payload(actual=PASSWORD_ACTUAL, nueva=PASSWORD_NUEVA, confirmacion=None):
    return {
        "passwordActual": actual,
        "passwordNueva": nueva,
        "confirmacion": nueva if confirmacion is None else confirmacion,
    }


def _token_emitido_hace(usuario, segundos):
    """Token de "otro dispositivo", emitido antes del cambio de contraseña."""
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


def _hash_actual(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).HashedPassword


# --- CP1: cambio exitoso --------------------------------------------------------


def test_cp1_cambia_la_contrasena_con_datos_validos(client, db_session, usuario_activo, auth_headers, mail):
    respuesta = client.put(URL, json=_payload(), headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert "se cambió correctamente" in cuerpo["message"]
    assert cuerpo["access_token"]
    hashed = _hash_actual(db_session, usuario_activo)
    assert verify_password(PASSWORD_NUEVA, hashed)
    assert not verify_password(PASSWORD_ACTUAL, hashed)


def test_cp1_se_puede_iniciar_sesion_con_la_nueva_contrasena(client, usuario_activo, auth_headers, mail):
    client.put(URL, json=_payload(), headers=auth_headers)

    vieja = client.post("/api/v1/auth/login", json={"email": usuario_activo.Email, "password": PASSWORD_ACTUAL})
    nueva = client.post("/api/v1/auth/login", json={"email": usuario_activo.Email, "password": PASSWORD_NUEVA})

    assert vieja.status_code == 401
    assert nueva.status_code == 200


# --- CP2: contraseña actual incorrecta -----------------------------------------


def test_cp2_contrasena_actual_incorrecta_falla(client, db_session, usuario_activo, auth_headers, mail):
    hash_previo = usuario_activo.HashedPassword

    respuesta = client.put(URL, json=_payload(actual="Incorrecta1!"), headers=auth_headers)

    # 400 y no 401: un 401 cerraría la sesión del usuario en la app.
    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "CURRENT_PASSWORD_INVALID"
    assert respuesta.json()["detail"] == "La contraseña actual es incorrecta."
    assert _hash_actual(db_session, usuario_activo) == hash_previo
    assert mail.enviados == []


# --- CP3 y CP4: reglas de la nueva contraseña ----------------------------------


def test_cp3_nueva_contrasena_con_menos_de_8_caracteres_falla(client, usuario_activo, auth_headers, mail):
    respuesta = client.put(URL, json=_payload(nueva="Ab1#xyz"), headers=auth_headers)

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_WEAK"
    assert "al menos 8 caracteres" in respuesta.json()["detail"]


@pytest.mark.parametrize(
    ("nueva", "falta"),
    [
        ("nuevaclave456#", "una letra mayúscula"),
        ("NUEVACLAVE456#", "una letra minúscula"),
        ("NuevaClave####", "un número"),
        ("NuevaClave4567", "un carácter especial"),
    ],
)
def test_cp4_nueva_contrasena_sin_algun_tipo_de_caracter_falla(
    client, db_session, usuario_activo, auth_headers, mail, nueva, falta
):
    respuesta = client.put(URL, json=_payload(nueva=nueva), headers=auth_headers)

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_WEAK"
    assert falta in respuesta.json()["detail"]
    assert verify_password(PASSWORD_ACTUAL, _hash_actual(db_session, usuario_activo))


# --- CP5: igual a la actual ------------------------------------------------------


def test_cp5_nueva_contrasena_identica_a_la_actual_falla(client, usuario_activo, auth_headers, mail):
    respuesta = client.put(URL, json=_payload(nueva=PASSWORD_ACTUAL), headers=auth_headers)

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_SAME_AS_CURRENT"


# --- CP6: confirmación distinta --------------------------------------------------


def test_cp6_confirmacion_distinta_falla(client, db_session, usuario_activo, auth_headers, mail):
    respuesta = client.put(URL, json=_payload(confirmacion="OtraClave789$"), headers=auth_headers)

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_MISMATCH"
    assert verify_password(PASSWORD_ACTUAL, _hash_actual(db_session, usuario_activo))


@pytest.mark.parametrize("campo", ["passwordActual", "passwordNueva", "confirmacion"])
def test_campos_obligatorios(client, usuario_activo, auth_headers, mail, campo):
    payload = _payload()
    payload[campo] = ""

    respuesta = client.put(URL, json=payload, headers=auth_headers)

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_REQUIRED"


# --- CP7: cuentas de Google o Facebook -------------------------------------------


def test_cp7_cuenta_google_no_puede_cambiar_contrasena(
    client, db_session, usuario_google, auth_headers_google, mail
):
    hash_previo = usuario_google.HashedPassword

    respuesta = client.put(URL, json=_payload(), headers=auth_headers_google)

    assert respuesta.status_code == 403
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_CHANGE_NOT_AVAILABLE"
    assert _hash_actual(db_session, usuario_google) == hash_previo


def test_cp7_cuenta_facebook_no_puede_cambiar_contrasena(client, usuario_facebook, auth_headers_facebook, mail):
    respuesta = client.put(URL, json=_payload(), headers=auth_headers_facebook)

    assert respuesta.status_code == 403
    assert respuesta.headers["X-Error-Code"] == "PASSWORD_CHANGE_NOT_AVAILABLE"


def test_me_informa_el_proveedor_para_mostrar_u_ocultar_la_opcion(client, auth_headers, auth_headers_google):
    assert client.get("/api/v1/users/me", headers=auth_headers).json()["proveedorAutenticacion"] == "local"
    assert client.get("/api/v1/users/me", headers=auth_headers_google).json()["proveedorAutenticacion"] == "google"


# --- CP8: cierre de sesiones en otros dispositivos -------------------------------


def test_cp8_cierra_la_sesion_en_otro_dispositivo_y_mantiene_la_actual(client, usuario_activo, mail):
    otro_dispositivo = {"Authorization": f"Bearer {_token_emitido_hace(usuario_activo, 120)}"}
    este_dispositivo = {"Authorization": f"Bearer {_token_emitido_hace(usuario_activo, 60)}"}
    assert client.get("/api/v1/users/me", headers=otro_dispositivo).status_code == 200

    respuesta = client.put(URL, json=_payload(), headers=este_dispositivo)
    assert respuesta.status_code == 200, respuesta.text
    token_nuevo = {"Authorization": f"Bearer {respuesta.json()['access_token']}"}

    assert client.get("/api/v1/users/me", headers=otro_dispositivo).status_code == 401
    assert client.get("/api/v1/users/me", headers=este_dispositivo).status_code == 401
    assert client.get("/api/v1/users/me", headers=token_nuevo).status_code == 200


def test_cp8_un_inicio_de_sesion_posterior_al_cambio_sigue_valido(client, usuario_activo, auth_headers, mail):
    client.put(URL, json=_payload(), headers=auth_headers)

    login = client.post(
        "/api/v1/auth/login", json={"email": usuario_activo.Email, "password": PASSWORD_NUEVA}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.get("/api/v1/users/me", headers=headers).status_code == 200


def test_un_intento_fallido_no_cierra_sesiones(client, usuario_activo, auth_headers, mail):
    client.put(URL, json=_payload(actual="Incorrecta1!"), headers=auth_headers)

    assert client.get("/api/v1/users/me", headers=auth_headers).status_code == 200


# --- CP9: correo de aviso ----------------------------------------------------------


def test_cp9_envia_el_correo_de_aviso(client, usuario_activo, auth_headers, mail):
    client.put(URL, json=_payload(), headers=auth_headers)

    assert len(mail.enviados) == 1
    correo = mail.enviados[0]
    assert correo["to"] == [usuario_activo.Email]
    assert correo["template_name"] == "password_updated.html"
    assert correo["text_template_name"] == "password_updated.txt"
    assert correo["context"]["nombre"] == usuario_activo.Nombre


def test_si_falla_el_correo_el_cambio_se_guarda_igual(client, db_session, usuario_activo, auth_headers):
    app.dependency_overrides[get_mail_service] = lambda: _MailFalso(falla=True)

    respuesta = client.put(URL, json=_payload(), headers=auth_headers)

    assert respuesta.status_code == 200
    assert verify_password(PASSWORD_NUEVA, _hash_actual(db_session, usuario_activo))


def test_las_plantillas_del_correo_se_renderizan():
    from app.services.mail.templates import render_template

    contexto = {"nombre": "Ana", "fecha": "18/10/2026 12:00 UTC", "recuperar_url": "https://cyanea.app"}
    html = render_template("password_updated.html", contexto)
    texto = render_template("password_updated.txt", contexto)

    assert "Ana" in html and "Mi cuenta" in html
    assert "18/10/2026 12:00 UTC" in texto
