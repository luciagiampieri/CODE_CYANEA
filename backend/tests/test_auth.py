from app.core.security import hash_password
from app.models.usuario import Usuario
from app.api.routes import auth as auth_module
from app.services.auth.facebook_auth_service import FacebookIdentity
from app.services.auth.google_auth_service import GoogleIdentity


def _google_identity():
    return GoogleIdentity(
        sub="google-new-123",
        email="nuevo.google@test.com",
        email_verified=True,
        given_name="Nuevo",
        family_name="Google",
        name="Nuevo Google",
        picture="https://foto.google/nuevo.jpg",
    )


def _facebook_identity():
    return FacebookIdentity(
        id="facebook-new-123",
        email="nuevo.facebook@test.com",
        name="Nuevo Facebook",
        first_name="Nuevo",
        last_name="Facebook",
        picture="https://foto.facebook/nuevo.jpg",
    )


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
        "password": "debil",
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


def test_google_login_usuario_existente_devuelve_token(
    client, usuario_google, monkeypatch
):
    identity = _google_identity()
    identity.sub = usuario_google.GoogleSub

    class FakeGoogleService:
        def verify_id_token(self, token):
            assert token == "google-token"
            return identity

        def find_existing_user(self, db, received_identity):
            assert received_identity is identity
            return usuario_google

    monkeypatch.setattr(auth_module, "google_auth_service", FakeGoogleService())

    response = client.post(
        "/api/v1/auth/google",
        json={"idToken": "google-token"},
    )

    assert response.status_code == 200
    assert response.json()["requiereRegistro"] is False
    assert response.json()["access_token"]


def test_google_login_usuario_nuevo_pide_completar_registro(client, monkeypatch):
    identity = _google_identity()

    class FakeGoogleService:
        def verify_id_token(self, token):
            return identity

        def find_existing_user(self, db, received_identity):
            return None

    monkeypatch.setattr(auth_module, "google_auth_service", FakeGoogleService())

    response = client.post(
        "/api/v1/auth/google",
        json={"idToken": "google-token"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "requiereRegistro": True,
        "access_token": None,
        "token_type": "bearer",
        "nombre": "Nuevo",
        "apellido": "Google",
        "email": "nuevo.google@test.com",
        "fotoUrl": "https://foto.google/nuevo.jpg",
    }


def test_google_register_crea_usuario_y_devuelve_token(client, db_session, monkeypatch):
    identity = _google_identity()

    class FakeGoogleService:
        def verify_id_token(self, token):
            return identity

        def create_user_from_google(self, db, received_identity):
            usuario = Usuario(
                Nombre="Nuevo",
                Apellido="Google",
                NombreUsuario="nuevo_google",
                Email=received_identity.email,
                HashedPassword=hash_password("GeneratedPassword123!"),
                GoogleSub=received_identity.sub,
                ProveedorAutenticacion="google",
                Activo=True,
                EmailConfirmado=True,
            )
            db.add(usuario)
            db.commit()
            db.refresh(usuario)
            return usuario

    monkeypatch.setattr(auth_module, "google_auth_service", FakeGoogleService())

    response = client.post(
        "/api/v1/auth/register/google",
        json={"idToken": "google-token", "aceptaTerminos": True},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]
    creado = db_session.query(Usuario).filter_by(Email=identity.email).one()
    assert creado.GoogleSub == identity.sub
    assert creado.EmailConfirmado is True


def test_google_register_rechaza_no_aceptar_terminos(client, monkeypatch):
    def fail_if_called(token):
        raise AssertionError("No debe validarse Google sin aceptar términos")

    class FakeGoogleService:
        verify_id_token = fail_if_called

    monkeypatch.setattr(auth_module, "google_auth_service", FakeGoogleService())

    response = client.post(
        "/api/v1/auth/register/google",
        json={"idToken": "google-token", "aceptaTerminos": False},
    )

    assert response.status_code == 400


def test_facebook_login_usuario_existente_devuelve_token(
    client, usuario_facebook, monkeypatch
):
    identity = _facebook_identity()
    identity.id = usuario_facebook.FacebookId

    class FakeFacebookService:
        def verify_access_token(self, token):
            return identity

        def find_existing_user(self, db, received_identity):
            return usuario_facebook

    monkeypatch.setattr(auth_module, "facebook_auth_service", FakeFacebookService())

    response = client.post(
        "/api/v1/auth/facebook",
        json={"accessToken": "facebook-token"},
    )

    assert response.status_code == 200
    assert response.json()["requiereRegistro"] is False
    assert response.json()["access_token"]


def test_facebook_login_usuario_nuevo_pide_completar_registro(client, monkeypatch):
    identity = _facebook_identity()

    class FakeFacebookService:
        def verify_access_token(self, token):
            return identity

        def find_existing_user(self, db, received_identity):
            return None

    monkeypatch.setattr(auth_module, "facebook_auth_service", FakeFacebookService())

    response = client.post(
        "/api/v1/auth/facebook",
        json={"accessToken": "facebook-token"},
    )

    assert response.status_code == 200
    assert response.json()["requiereRegistro"] is True
    assert response.json()["email"] == identity.email
    assert response.json()["fotoUrl"] == identity.picture


def test_facebook_register_crea_usuario_y_devuelve_token(client, db_session, monkeypatch):
    identity = _facebook_identity()

    class FakeFacebookService:
        def verify_access_token(self, token):
            return identity

        def create_user_from_facebook(self, db, received_identity):
            usuario = Usuario(
                Nombre="Nuevo",
                Apellido="Facebook",
                NombreUsuario="nuevo_facebook",
                Email=received_identity.email,
                HashedPassword=hash_password("GeneratedPassword123!"),
                FacebookId=received_identity.id,
                ProveedorAutenticacion="facebook",
                Activo=True,
                EmailConfirmado=True,
            )
            db.add(usuario)
            db.commit()
            db.refresh(usuario)
            return usuario

    monkeypatch.setattr(auth_module, "facebook_auth_service", FakeFacebookService())

    response = client.post(
        "/api/v1/auth/register/facebook",
        json={"accessToken": "facebook-token", "aceptaTerminos": True},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]
    creado = db_session.query(Usuario).filter_by(Email=identity.email).one()
    assert creado.FacebookId == identity.id
    assert creado.EmailConfirmado is True


def test_facebook_register_rechaza_no_aceptar_terminos(client, monkeypatch):
    def fail_if_called(token):
        raise AssertionError("No debe validarse Facebook sin aceptar términos")

    class FakeFacebookService:
        verify_access_token = fail_if_called

    monkeypatch.setattr(auth_module, "facebook_auth_service", FakeFacebookService())

    response = client.post(
        "/api/v1/auth/register/facebook",
        json={"accessToken": "facebook-token", "aceptaTerminos": False},
    )

    assert response.status_code == 400