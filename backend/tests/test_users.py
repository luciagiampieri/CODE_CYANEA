def test_get_me_success(client, auth_headers, usuario_activo):
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == usuario_activo.IdUsuario
    assert body["nombreUsuario"] == "ana_test"
    assert body["email"] == "ana@test.com"
    assert body["nombreCompleto"] == "Ana Test"


def test_get_me_requires_auth(client):
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401


def test_get_me_rejects_invalid_token(client):
    response = client.get(
        "/api/v1/users/me", headers={"Authorization": "Bearer token-invalido"}
    )
    assert response.status_code == 401


def test_list_users_requires_auth(client):
    response = client.get("/api/v1/users/")
    assert response.status_code == 401


def test_list_users_success(client, auth_headers, usuario_activo):
    response = client.get("/api/v1/users/", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert any(u["id"] == usuario_activo.IdUsuario for u in body)


def test_list_users_filters_by_query(client, db_session, auth_headers):
    from app.core.security import hash_password
    from app.models.usuario import Usuario

    otro = Usuario(
        Nombre="Bruno", Apellido="Diaz", NombreUsuario="bruno_d",
        Email="bruno@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
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
        Nombre="Carla", Apellido="Ruiz", NombreUsuario="carla_r",
        Email="carla@test.com", HashedPassword=hash_password("Password123!"),
        Activo=False, EmailConfirmado=True,
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
            Nombre=f"User{i}", Apellido="Test", NombreUsuario=f"user{i}",
            Email=f"user{i}@test.com", HashedPassword=hash_password("Password123!"),
            Activo=True, EmailConfirmado=True,
        )
        for i in range(5)
    ]
    db_session.add_all(extras)
    db_session.commit()

    response = client.get("/api/v1/users/?limit=2", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2