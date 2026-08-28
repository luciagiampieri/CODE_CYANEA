import io

from app.models.viaje import Viaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.estado_participacion import EstadoParticipacion
from app.models.rol_participante import RolParticipante
from app.models.estado_viaje import EstadoViaje

from app.core.security import create_access_token, hash_password

from datetime import date as date_type


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


def test_delete_me_con_password_correcta(
    client,
    db_session,
    auth_headers,
    usuario_activo,
):
    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response.status_code == 204

    db_session.refresh(usuario_activo)

    assert usuario_activo.Activo is False
    assert usuario_activo.FechaBaja is not None
    assert usuario_activo.Nombre == "Usuario"
    assert usuario_activo.Apellido == "Anónimo"
    assert usuario_activo.FotoUrl is None


def test_delete_me_con_password_incorrecta(
    client,
    db_session,
    auth_headers,
    usuario_activo,
):
    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "PasswordIncorrecta123!"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "La contraseña ingresada es incorrecta."

    db_session.refresh(usuario_activo)

    assert usuario_activo.Activo is True
    assert usuario_activo.FechaBaja is None
    assert usuario_activo.Nombre == "Ana"
    assert usuario_activo.Apellido == "Test"
    assert usuario_activo.Email == "ana@test.com"


def test_delete_me_usuario_google_sin_password(
    client,
    db_session,
    usuario_google,
    auth_headers_google,
):
    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers_google,
        json={},
    )

    assert response.status_code == 204

    db_session.refresh(usuario_google)

    assert usuario_google.Activo is False
    assert usuario_google.FechaBaja is not None

    assert usuario_google.Nombre == "Usuario"
    assert usuario_google.Apellido == "Anónimo"
    assert usuario_google.FotoUrl is None

    assert usuario_google.GoogleSub is None


def test_delete_me_usuario_facebook_sin_password(
    client,
    db_session,
    usuario_facebook,
    auth_headers_facebook,
):
    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers_facebook,
        json={},
    )

    assert response.status_code == 204

    db_session.refresh(usuario_facebook)

    assert usuario_facebook.Activo is False
    assert usuario_facebook.FechaBaja is not None

    assert usuario_facebook.Nombre == "Usuario"
    assert usuario_facebook.Apellido == "Anónimo"
    assert usuario_facebook.FotoUrl is None

    assert usuario_facebook.FacebookId is None


def test_registrar_nueva_cuenta_con_email_de_cuenta_dada_de_baja(
    client,
    db_session,
    auth_headers,
    usuario_activo,
):
    response_delete = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response_delete.status_code == 204

    response_register = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Nueva",
            "apellido": "Persona",
            "nombreUsuario": "nueva_persona",
            "email": "ana@test.com",
            "password": "NuevaPassword123!",
            "aceptaTerminos": True,
        },
    )

    assert response_register.status_code == 201

    body = response_register.json()
    assert body["email"] == "ana@test.com"


def test_delete_me_conserva_participacion_historica_del_viaje(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
):
    viaje, participante = viaje_con_admin

    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response.status_code == 204

    db_session.refresh(viaje)
    db_session.refresh(participante)
    db_session.refresh(usuario_activo)

    assert db_session.get(Viaje, viaje.IdViaje) is not None

    assert db_session.get(
        ParticipanteViaje,
        participante.IdParticipanteViaje,
    ) is not None

    assert participante.IdUsuario == usuario_activo.IdUsuario
    assert usuario_activo.Activo is False
    assert viaje.IdAdministrador == usuario_activo.IdUsuario


def test_delete_me_invalida_sesion_activa(
    client,
    auth_headers,
    usuario_activo,
):
    response_delete = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response_delete.status_code == 204

    response_me = client.get(
        "/api/v1/users/me",
        headers=auth_headers,
    )

    assert response_me.status_code == 401


def test_delete_me_usuario_deja_de_aparecer_en_datos_publicos(
    client,
    db_session,
    auth_headers,
    usuario_activo,
):
    from app.core.security import hash_password
    from app.models.usuario import Usuario

    otro_usuario = Usuario(
        Nombre="Bruno",
        Apellido="Test",
        NombreUsuario="bruno_test",
        Email="bruno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )

    db_session.add(otro_usuario)
    db_session.commit()
    db_session.refresh(otro_usuario)

    # Antes de eliminar la cuenta, debe aparecer públicamente
    response_antes = client.get(
        "/api/v1/users/?q=bruno_test",
        headers=auth_headers,
    )

    assert response_antes.status_code == 200
    assert len(response_antes.json()) == 1
    assert response_antes.json()[0]["nombreUsuario"] == "bruno_test"

    # Eliminamos la cuenta de Bruno.
    token_bruno = create_access_token(
        {
            "sub": otro_usuario.Email,
            "user_id": otro_usuario.IdUsuario,
        }
    )

    response_delete = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token_bruno}"},
        json={"password": "Password123!"},
    )

    assert response_delete.status_code == 204

    # Ana ya no debería poder encontrar a Bruno
    response_despues = client.get(
        "/api/v1/users/?q=bruno_test",
        headers=auth_headers,
    )

    assert response_despues.status_code == 200
    assert response_despues.json() == []


def test_delete_me_reasigna_administrador_en_viaje_activo(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
):
    viaje, participante_admin = viaje_con_admin

    # Crear otro usuario activo
    otro_usuario = Usuario(
        Nombre="Bruno",
        Apellido="Test",
        NombreUsuario="bruno_test",
        Email="bruno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(otro_usuario)
    db_session.flush()

    # Obtener estado y rol necesarios
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(
        Nombre="aceptado"
    ).first()

    rol_participante = db_session.query(RolParticipante).filter_by(
        Nombre="participante"
    ).first()

    otro_participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=otro_usuario.IdUsuario,
        IdRolParticipante=rol_participante.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )

    db_session.add(otro_participante)
    db_session.commit()

    # El administrador elimina su cuenta
    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response.status_code == 204

    db_session.refresh(viaje)
    db_session.refresh(otro_usuario)

    # El otro participante pasa a ser administrador
    assert viaje.IdAdministrador == otro_usuario.IdUsuario


def test_delete_me_no_reasigna_administrador_si_es_unico_participante(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
):
    viaje, participante = viaje_con_admin

    # El administrador elimina su cuenta
    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response.status_code == 204

    db_session.refresh(viaje)
    db_session.refresh(usuario_activo)

    # La cuenta fue dada de baja
    assert usuario_activo.Activo is False
    assert usuario_activo.FechaBaja is not None

    # El viaje sigue teniendo al usuario original como administrador.
    # No había otro participante al que reasignar.
    assert viaje.IdAdministrador == usuario_activo.IdUsuario


def test_delete_me_no_reasigna_administrador_en_viaje_finalizado(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    master_data,
):
    estado_finalizado = db_session.query(EstadoViaje).filter_by(
        Nombre="finalizado"
    ).first()

    rol_admin = db_session.query(RolParticipante).filter_by(
        Nombre="administrador"
    ).first()

    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(
        Nombre="aceptado"
    ).first()

    viaje = Viaje(
        Titulo="Viaje finalizado",
        FechaInicio=date_type(2026, 6, 1),
        FechaFin=date_type(2026, 6, 10),
        IdEstadoViaje=estado_finalizado.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario_activo.IdUsuario,
    )

    db_session.add(viaje)
    db_session.flush()

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario_activo.IdUsuario,
        IdRolParticipante=rol_admin.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )

    db_session.add(participante)
    db_session.commit()

    administrador_original = viaje.IdAdministrador

    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response.status_code == 204

    db_session.refresh(viaje)

    # El administrador NO cambia porque el viaje ya finalizó.
    assert viaje.IdAdministrador == administrador_original


def test_delete_me_no_reasigna_administrador_en_viaje_cancelado(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    master_data,
):
    estado_cancelado = db_session.query(EstadoViaje).filter_by(
        Nombre="cancelado"
    ).first()

    rol_admin = db_session.query(RolParticipante).filter_by(
        Nombre="administrador"
    ).first()

    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(
        Nombre="aceptado"
    ).first()

    viaje = Viaje(
        Titulo="Viaje cancelado",
        FechaInicio=date_type(2026, 7, 1),
        FechaFin=date_type(2026, 7, 10),
        IdEstadoViaje=estado_cancelado.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario_activo.IdUsuario,
    )

    db_session.add(viaje)
    db_session.flush()

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario_activo.IdUsuario,
        IdRolParticipante=rol_admin.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )

    db_session.add(participante)
    db_session.commit()

    administrador_original = viaje.IdAdministrador

    response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers=auth_headers,
        json={"password": "Password123!"},
    )

    assert response.status_code == 204

    db_session.refresh(viaje)

    # El administrador NO cambia porque el viaje fue cancelado.
    assert viaje.IdAdministrador == administrador_original