from app.models.item_repositorio import ItemRepositorioViaje


def _payload_item(titulo="Hotel reservado", tipo="direccion", contenido="Av. Siempre Viva 123", es_publico=True):
    return {
        "titulo": titulo,
        "tipo": tipo,
        "contenido": contenido,
        "descripcion": "Reserva confirmada",
        "esPublico": es_publico,
    }


def _crear_usuario_miembro(db_session, viaje, email="bob_repo@test.com", username="bob_repo_test"):
    from app.core.security import hash_password, create_access_token
    from app.models.usuario import Usuario
    from app.models.participante_viaje import ParticipanteViaje
    from app.models.rol_participante import RolParticipante
    from app.models.estado_participacion import EstadoParticipacion

    usuario = Usuario(
        Nombre="Bob", Apellido="Test", NombreUsuario=username,
        Email=email, HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.flush()

    rol_participante = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()

    db_session.add(ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol_participante.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    ))
    db_session.commit()
    db_session.refresh(usuario)

    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, {"Authorization": f"Bearer {token}"}


def test_crear_item_publico_es_visible_para_otro_participante(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    crear = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(es_publico=True),
        headers=auth_headers,
    )
    assert crear.status_code == 201
    assert crear.json()["message"] == "Información guardada correctamente en el repositorio."

    _, headers_bob = _crear_usuario_miembro(db_session, viaje)
    listado_bob = client.get(f"/api/v1/trips/{viaje.IdViaje}/repositorio", headers=headers_bob)

    assert listado_bob.status_code == 200
    body = listado_bob.json()
    assert len(body) == 1
    assert body[0]["Titulo"] == "Hotel reservado"
    assert body[0]["EsPropio"] is False


def test_crear_item_privado_no_es_visible_para_otro_participante(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(titulo="Nota privada", es_publico=False),
        headers=auth_headers,
    )

    _, headers_bob = _crear_usuario_miembro(db_session, viaje)
    listado_bob = client.get(f"/api/v1/trips/{viaje.IdViaje}/repositorio", headers=headers_bob)

    assert listado_bob.status_code == 200
    assert listado_bob.json() == []

    listado_propio = client.get(f"/api/v1/trips/{viaje.IdViaje}/repositorio", headers=auth_headers)
    assert len(listado_propio.json()) == 1
    assert listado_propio.json()[0]["EsPropio"] is True


def test_editar_item_refleja_los_cambios(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    crear = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(),
        headers=auth_headers,
    )
    item_id = crear.json()["item"]["IdItemRepositorio"]

    editar = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio/{item_id}",
        json=_payload_item(titulo="Hotel actualizado", contenido="Nueva dirección 456"),
        headers=auth_headers,
    )

    assert editar.status_code == 200
    assert editar.json()["item"]["Titulo"] == "Hotel actualizado"
    assert editar.json()["item"]["Contenido"] == "Nueva dirección 456"


def test_editar_item_rechaza_usuario_no_creador(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    crear = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(),
        headers=auth_headers,
    )
    item_id = crear.json()["item"]["IdItemRepositorio"]

    _, headers_bob = _crear_usuario_miembro(db_session, viaje)
    editar = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio/{item_id}",
        json=_payload_item(titulo="Intento ajeno"),
        headers=headers_bob,
    )

    assert editar.status_code == 403


def test_eliminar_item_lo_hace_desaparecer(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    crear = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(),
        headers=auth_headers,
    )
    item_id = crear.json()["item"]["IdItemRepositorio"]

    eliminar = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio/{item_id}",
        headers=auth_headers,
    )
    assert eliminar.status_code == 200

    listado = client.get(f"/api/v1/trips/{viaje.IdViaje}/repositorio", headers=auth_headers)
    assert listado.json() == []

    item_en_bd = db_session.query(ItemRepositorioViaje).filter_by(IdItemRepositorio=item_id).first()
    assert item_en_bd is None


def test_eliminar_item_rechaza_usuario_no_creador(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    crear = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(),
        headers=auth_headers,
    )
    item_id = crear.json()["item"]["IdItemRepositorio"]

    _, headers_bob = _crear_usuario_miembro(db_session, viaje)
    eliminar = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio/{item_id}",
        headers=headers_bob,
    )
    assert eliminar.status_code == 403


def test_crear_item_sin_titulo_falla(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json=_payload_item(titulo="   "),
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_listar_repositorio_rechaza_usuario_ajeno_al_viaje(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin

    from app.core.security import hash_password, create_access_token
    from app.models.usuario import Usuario

    ajeno = Usuario(
        Nombre="Ajeno", Apellido="Test", NombreUsuario="ajeno_repo",
        Email="ajeno_repo@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(ajeno)
    db_session.commit()
    db_session.refresh(ajeno)
    headers_ajeno = {
        "Authorization": f"Bearer {create_access_token({'sub': ajeno.Email, 'user_id': ajeno.IdUsuario})}"
    }

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/repositorio", headers=headers_ajeno)

    assert response.status_code == 403