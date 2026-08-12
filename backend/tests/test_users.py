import io


def test_get_me_success(client, auth_headers, usuario_activo):
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == usuario_activo.IdUsuario
    assert body["nombre"] == "Ana"
    assert body["apellido"] == "Test"
    assert body["nombreUsuario"] == "ana_test"
    assert body["email"] == "ana@test.com"
    assert body["nombreCompleto"] == "Ana Test"
    assert body["fotoUrl"] is None


def test_get_me_requires_auth(client):
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401


def test_get_me_rejects_invalid_token(client):
    response = client.get(
        "/api/v1/users/me", headers={"Authorization": "Bearer token-invalido"}
    )
    assert response.status_code == 401


def test_update_me_modifica_nombre_y_apellido(client, auth_headers):
    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "nombre": "Ana María",
            "apellido": "Pérez",
            "nombreUsuario": "ana_test",
            "fotoUrl": None,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["nombre"] == "Ana María"
    assert body["apellido"] == "Pérez"
    assert body["nombreCompleto"] == "Ana María Pérez"


def test_update_me_rechaza_nombre_usuario_duplicado(client, db_session, auth_headers):
    from app.core.security import hash_password
    from app.models.usuario import Usuario

    otro = Usuario(
        Nombre="Bruno",
        Apellido="Diaz",
        NombreUsuario="bruno_d",
        Email="bruno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(otro)
    db_session.commit()

    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "nombre": "Ana",
            "apellido": "Test",
            "nombreUsuario": "bruno_d",
            "fotoUrl": None,
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "El nombre de usuario ya está asociado a otra cuenta."


def test_update_me_rechaza_campos_vacios(client, auth_headers):
    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "nombre": " ",
            "apellido": "Test",
            "nombreUsuario": "ana_test",
            "fotoUrl": None,
        },
    )
    assert response.status_code == 422


def test_update_me_no_permte_modificar_email(client, auth_headers):
    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "nombre": "Ana",
            "apellido": "Test",
            "nombreUsuario": "ana_test",
            "email": "otro@test.com",
            "fotoUrl": None,
        },
    )
    assert response.status_code == 200
    assert response.json()["email"] == "ana@test.com"


def test_subir_foto_perfil_actualiza_foto_url(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.users.subir_foto_perfil",
        lambda archivo, user_id: f"profile-photos/{user_id}/foto.png",
    )
    monkeypatch.setattr(
        "app.api.routes.users.obtener_url_publica",
        lambda ruta: f"https://fake-public-url/{ruta}",
    )

    response = client.post(
        "/api/v1/users/me/photo",
        headers=auth_headers,
        files={"archivo": ("perfil.png", io.BytesIO(b"image"), "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fotoUrl"] == "https://fake-public-url/profile-photos/1/foto.png"
    assert body["message"] == "Foto de perfil actualizada correctamente."


def test_list_users_requires_auth(client):
    response = client.get("/api/v1/users/")
    assert response.status_code == 401


def test_list_users_success(client, auth_headers, usuario_activo):
    response = client.get("/api/v1/users/", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert any(user["id"] == usuario_activo.IdUsuario for user in body)


def test_list_users_filters_by_query(client, db_session, auth_headers):
    from app.core.security import hash_password
    from app.models.usuario import Usuario

    otro = Usuario(
        Nombre="Bruno",
        Apellido="Diaz",
        NombreUsuario="bruno_d",
        Email="bruno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(otro)
    db_session.commit()

    response = client.get("/api/v1/users/?q=bruno", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["nombreUsuario"] == "bruno_d"


def test_list_users_excludes_inactive(client, db_session, auth_headers):
    from app.core.security import hash_password
    from app.models.usuario import Usuario

    inactivo = Usuario(
        Nombre="Carla",
        Apellido="Ruiz",
        NombreUsuario="carla_r",
        Email="carla@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=False,
        EmailConfirmado=True,
    )
    db_session.add(inactivo)
    db_session.commit()

    response = client.get("/api/v1/users/?q=carla", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_users_respects_limit(client, db_session, auth_headers):
    from app.core.security import hash_password
    from app.models.usuario import Usuario

    extras = [
        Usuario(
            Nombre=f"User{i}",
            Apellido="Test",
            NombreUsuario=f"user{i}",
            Email=f"user{i}@test.com",
            HashedPassword=hash_password("Password123!"),
            Activo=True,
            EmailConfirmado=True,
        )
        for i in range(5)
    ]
    db_session.add_all(extras)
    db_session.commit()

    response = client.get("/api/v1/users/?limit=2", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2
