from app.core.security import hash_password
from app.models.usuario import Usuario


def test_register_creates_unconfirmed_user(client, db_session):
    response = client.post("/api/v1/auth/register", json={
        "nombre": "Juan",
        "apellido": "Perez",
        "nombreUsuario": "juanp",
        "email": "juan@test.com",
        "password": "Password123!",
        "aceptaTerminos": True,
    })

    assert response.status_code == 201
    creado = db_session.query(Usuario).filter_by(Email="juan@test.com").first()
    assert creado is not None
    assert creado.EmailConfirmado is False


def test_register_rejects_duplicate_email(client, usuario_activo):
    response = client.post("/api/v1/auth/register", json={
        "nombre": "Otro", "apellido": "Usuario",
        "nombreUsuario": "otro_user",
        "email": usuario_activo.Email,
        "password": "Password123!",
        "aceptaTerminos": True,
    })
    assert response.status_code == 409


def test_login_success(client, usuario_activo):
    response = client.post("/api/v1/auth/login", json={
        "email": usuario_activo.Email,
        "password": "Password123!",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client, usuario_activo):
    response = client.post("/api/v1/auth/login", json={
        "email": usuario_activo.Email,
        "password": "incorrecta",
    })
    assert response.status_code == 401


def test_login_blocked_if_email_not_confirmed(client, db_session):
    usuario = Usuario(
        Nombre="Sin", Apellido="Confirmar", NombreUsuario="sinconfirmar",
        Email="sinconfirmar@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=False,
    )
    db_session.add(usuario)
    db_session.commit()

    response = client.post("/api/v1/auth/login", json={
        "email": "sinconfirmar@test.com",
        "password": "Password123!",
    })
    assert response.status_code == 403


def test_register_rejects_weak_password(client):
    response = client.post("/api/v1/auth/register", json={
        "nombre": "Juan", "apellido": "Perez",
        "nombreUsuario": "juanp2",
        "email": "juan2@test.com",
        "password": "debil",  # sin mayúscula, sin número, sin especial
        "aceptaTerminos": True,
    })
    assert response.status_code == 422


def test_register_rejects_without_terms(client):
    response = client.post("/api/v1/auth/register", json={
        "nombre": "Juan", "apellido": "Perez",
        "nombreUsuario": "juanp3",
        "email": "juan3@test.com",
        "password": "Password123!",
        "aceptaTerminos": False,
    })
    assert response.status_code == 422