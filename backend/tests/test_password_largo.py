"""Contraseñas de más de 72 bytes (QA): bcrypt no las admite y respondían 500.

Se rechazan con 422 al registrarse, restablecer o cambiar la contraseña, y al iniciar
sesión responden 401 como cualquier contraseña incorrecta.
"""

from app.core.security import MENSAJE_PASSWORD_DEMASIADO_LARGA, verify_password, hash_password
from app.models.usuario import Usuario

# 73 bytes: 72 caracteres ASCII más una letra con acento (2 bytes en UTF-8) = 74 bytes
LARGA = "Aa1!" + "x" * 68 + "é"
# Justo en el límite: 72 bytes
EN_EL_LIMITE = "Aa1!" + "x" * 68


def _registro(password: str, **extra) -> dict:
    return {
        "nombre": "Juan",
        "apellido": "Perez",
        "nombreUsuario": "juanp",
        "email": "juan@test.com",
        "password": password,
        "aceptaTerminos": True,
        **extra,
    }


def _mensajes(response) -> str:
    return " ".join(str(error.get("msg")) for error in response.json()["detail"])


def test_registro_con_password_de_mas_de_72_bytes_responde_422(client, db_session):
    assert len(LARGA.encode()) > 72

    response = client.post("/api/v1/auth/register", json=_registro(LARGA))

    assert response.status_code == 422
    assert MENSAJE_PASSWORD_DEMASIADO_LARGA in _mensajes(response)
    assert db_session.query(Usuario).filter_by(Email="juan@test.com").first() is None


def test_los_bytes_cuentan_y_no_los_caracteres(client):
    # 40 caracteres, pero cada emoji ocupa 4 bytes en UTF-8: 4 + 36 * 4 = 148 bytes.
    password = "Aa1!" + "😀" * 36
    assert len(password) < 72 < len(password.encode())

    response = client.post("/api/v1/auth/register", json=_registro(password))

    assert response.status_code == 422


def test_registro_con_password_de_72_bytes_se_acepta(client):
    assert len(EN_EL_LIMITE.encode()) == 72

    response = client.post("/api/v1/auth/register", json=_registro(EN_EL_LIMITE))

    assert response.status_code == 201


def test_login_con_password_de_mas_de_72_bytes_responde_401(client, usuario_activo):
    response = client.post(
        "/api/v1/auth/login", json={"email": usuario_activo.Email, "password": LARGA}
    )

    assert response.status_code == 401


def test_verify_password_no_lanza_excepcion_con_mas_de_72_bytes():
    assert verify_password(LARGA, hash_password("Password123!")) is False


def test_cambio_de_password_de_mas_de_72_bytes_responde_422(client, usuario_activo, auth_headers):
    response = client.put(
        "/api/v1/users/me/password",
        json={"passwordActual": "Password123!", "passwordNueva": LARGA, "confirmacion": LARGA},
        headers=auth_headers,
    )

    assert response.status_code == 422
    assert MENSAJE_PASSWORD_DEMASIADO_LARGA in _mensajes(response)


def test_reset_de_password_de_mas_de_72_bytes_responde_422(client):
    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "cualquiera", "password": LARGA, "confirmPassword": LARGA},
    )

    assert response.status_code == 422
    assert MENSAJE_PASSWORD_DEMASIADO_LARGA in _mensajes(response)
