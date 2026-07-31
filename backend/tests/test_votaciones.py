from datetime import datetime, timedelta, timezone

from app.models.votacion import Votacion


def _payload_votacion(id_viaje, propuestas=("Asado", "Pizza"), dias_para_cerrar=3, tipo="opcion_unica"):
    return {
        "idViaje": id_viaje,
        "nombre": "Donde comemos?",
        "fechaCierre": (datetime.now(timezone.utc) + timedelta(days=dias_para_cerrar)).isoformat(),
        "tipo": tipo,
        "propuestas": list(propuestas),
    }


def _cerrar_votacion(db_session, id_votacion):
    votacion = db_session.get(Votacion, id_votacion)
    votacion.FechaCierre = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.add(votacion)
    db_session.commit()


def _crear_usuario_miembro(db_session, viaje, email="bob@test.com", username="bob_test"):
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

    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol_participante.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )
    db_session.add(participacion)
    db_session.commit()
    db_session.refresh(usuario)

    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, {"Authorization": f"Bearer {token}"}


def test_resultados_rechaza_votacion_activa(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]

    response = client.get(f"/api/v1/votaciones/{id_votacion}/resultados", headers=auth_headers)

    assert response.status_code == 400


def test_resultados_muestra_ganador(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]
    propuestas = crear.json()["Propuestas"]
    id_asado = propuestas[0]["IdPropuesta"]

    client.post(
        f"/api/v1/votaciones/{id_votacion}/votar",
        json={"idPropuestas": [id_asado]},
        headers=auth_headers,
    )
    _, headers_bob = _crear_usuario_miembro(db_session, viaje)
    client.post(
        f"/api/v1/votaciones/{id_votacion}/votar",
        json={"idPropuestas": [id_asado]},
        headers=headers_bob,
    )

    _cerrar_votacion(db_session, id_votacion)

    response = client.get(f"/api/v1/votaciones/{id_votacion}/resultados", headers=auth_headers)
    assert response.status_code == 200

    body = response.json()
    assert body["Estado"] == "cerrada"
    assert body["TotalVotantes"] == 2
    assert body["TotalVotos"] == 2
    assert body["IdPropuestasGanadoras"] == [id_asado]
    assert body["Empate"] is False

    resultado_asado = next(r for r in body["Resultados"] if r["IdPropuesta"] == id_asado)
    assert resultado_asado["Votos"] == 2
    assert resultado_asado["Porcentaje"] == 100.0
    assert body["MisPropuestas"] == [id_asado]


def test_resultados_detecta_empate(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]
    propuestas = crear.json()["Propuestas"]
    id_asado, id_pizza = propuestas[0]["IdPropuesta"], propuestas[1]["IdPropuesta"]

    client.post(
        f"/api/v1/votaciones/{id_votacion}/votar",
        json={"idPropuestas": [id_asado]},
        headers=auth_headers,
    )
    _, headers_bob = _crear_usuario_miembro(db_session, viaje)
    client.post(
        f"/api/v1/votaciones/{id_votacion}/votar",
        json={"idPropuestas": [id_pizza]},
        headers=headers_bob,
    )

    _cerrar_votacion(db_session, id_votacion)

    response = client.get(f"/api/v1/votaciones/{id_votacion}/resultados", headers=auth_headers)
    body = response.json()

    assert body["Empate"] is True
    assert set(body["IdPropuestasGanadoras"]) == {id_asado, id_pizza}


def test_resultados_sin_votos(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]

    _cerrar_votacion(db_session, id_votacion)

    response = client.get(f"/api/v1/votaciones/{id_votacion}/resultados", headers=auth_headers)
    assert response.status_code == 200

    body = response.json()
    assert body["TotalVotos"] == 0
    assert body["TotalVotantes"] == 0
    assert body["IdPropuestasGanadoras"] == []
    assert body["Empate"] is False


def test_progreso_rechaza_votacion_finalizada(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]

    _cerrar_votacion(db_session, id_votacion)

    response = client.get(f"/api/v1/votaciones/{id_votacion}/progreso", headers=auth_headers)
    assert response.status_code == 400


def test_progreso_votacion_activa(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]
    id_asado = crear.json()["Propuestas"][0]["IdPropuesta"]

    client.post(
        f"/api/v1/votaciones/{id_votacion}/votar",
        json={"idPropuestas": [id_asado]},
        headers=auth_headers,
    )

    response = client.get(f"/api/v1/votaciones/{id_votacion}/progreso", headers=auth_headers)
    assert response.status_code == 200

    body = response.json()
    assert body["Estado"] == "abierta"
    assert body["TotalVotos"] == 1
    resultado_asado = next(r for r in body["Resultados"] if r["IdPropuesta"] == id_asado)
    assert resultado_asado["Votos"] == 1
    assert resultado_asado["Porcentaje"] == 100.0


def test_progreso_actualiza_al_emitir_nuevo_voto(client, db_session, auth_headers, viaje_con_admin):
    from app.core.security import hash_password, create_access_token
    from app.models.usuario import Usuario
    from app.models.participante_viaje import ParticipanteViaje
    from app.models.rol_participante import RolParticipante
    from app.models.estado_participacion import EstadoParticipacion

    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]
    id_asado, id_pizza = (p["IdPropuesta"] for p in crear.json()["Propuestas"])

    client.post(f"/api/v1/votaciones/{id_votacion}/votar", json={"idPropuestas": [id_asado]}, headers=auth_headers)

    progreso_inicial = client.get(f"/api/v1/votaciones/{id_votacion}/progreso", headers=auth_headers).json()
    resultado_asado_inicial = next(r for r in progreso_inicial["Resultados"] if r["IdPropuesta"] == id_asado)
    assert resultado_asado_inicial["Porcentaje"] == 100.0

    bob = Usuario(
        Nombre="Bob", Apellido="Test", NombreUsuario="bob_progreso",
        Email="bob_progreso@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(bob)
    db_session.flush()
    rol_participante = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    db_session.add(ParticipanteViaje(
        IdViaje=viaje.IdViaje, IdUsuario=bob.IdUsuario,
        IdRolParticipante=rol_participante.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    ))
    db_session.commit()
    db_session.refresh(bob)
    headers_bob = {"Authorization": f"Bearer {create_access_token({'sub': bob.Email, 'user_id': bob.IdUsuario})}"}

    client.post(f"/api/v1/votaciones/{id_votacion}/votar", json={"idPropuestas": [id_pizza]}, headers=headers_bob)

    progreso_actualizado = client.get(f"/api/v1/votaciones/{id_votacion}/progreso", headers=auth_headers).json()
    resultado_asado_final = next(r for r in progreso_actualizado["Resultados"] if r["IdPropuesta"] == id_asado)
    assert progreso_actualizado["TotalVotos"] == 2
    assert resultado_asado_final["Porcentaje"] == 50.0