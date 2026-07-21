from datetime import datetime, timedelta, timezone


def _payload_votacion(id_viaje, propuestas=("Asado", "Pizza"), dias_para_cerrar=3):
    return {
        "idViaje": id_viaje,
        "nombre": "Donde comemos?",
        "fechaCierre": (datetime.now(timezone.utc) + timedelta(days=dias_para_cerrar)).isoformat(),
        "tipo": "opcion_unica",
        "propuestas": list(propuestas),
    }


def test_crear_votacion_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    assert response.status_code == 201
    body = response.json()
    assert len(body["Propuestas"]) == 2
    assert body["Estado"] == "abierta"


def test_crear_votacion_rejects_single_propuesta(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    payload = _payload_votacion(viaje.IdViaje, propuestas=["Asado"])
    response = client.post("/api/v1/votaciones", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_crear_votacion_rejects_past_date(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    payload = _payload_votacion(viaje.IdViaje, dias_para_cerrar=-1)
    response = client.post("/api/v1/votaciones", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_crear_votacion_rejects_non_member(client, db_session, viaje_con_admin):
    from app.core.security import hash_password, create_access_token
    from app.models.usuario import Usuario

    viaje, _ = viaje_con_admin
    intruso = Usuario(
        Nombre="Intruso", Apellido="Ajeno", NombreUsuario="intruso",
        Email="intruso@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(intruso)
    db_session.commit()
    db_session.refresh(intruso)
    token = create_access_token({"sub": intruso.Email, "user_id": intruso.IdUsuario})

    response = client.post(
        "/api/v1/votaciones",
        json=_payload_votacion(viaje.IdViaje),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_emitir_voto_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]
    id_propuesta = crear.json()["Propuestas"][0]["IdPropuesta"]

    response = client.post(
        f"/api/v1/votaciones/{id_votacion}/votar",
        json={"idPropuestas": [id_propuesta]},
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_emitir_voto_rechaza_doble_voto(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    crear = client.post("/api/v1/votaciones", json=_payload_votacion(viaje.IdViaje), headers=auth_headers)
    id_votacion = crear.json()["IdVotacion"]
    id_propuesta = crear.json()["Propuestas"][0]["IdPropuesta"]

    client.post(f"/api/v1/votaciones/{id_votacion}/votar", json={"idPropuestas": [id_propuesta]}, headers=auth_headers)
    response = client.post(f"/api/v1/votaciones/{id_votacion}/votar", json={"idPropuestas": [id_propuesta]}, headers=auth_headers)
    assert response.status_code == 400