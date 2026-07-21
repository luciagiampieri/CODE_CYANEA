
TRIP_PAYLOAD = {
    "title": "Viaje a Bariloche",
    "startDate": "2026-12-01",
    "endDate": "2026-12-10",
    "currency": "ARS",
    "destinations": [
        {"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}
    ],
    "participantUserIds": [],
    "invitedEmails": [],
}


def test_create_trip_requires_authentication(client):
    response = client.post("/api/v1/trips", json=TRIP_PAYLOAD)
    assert response.status_code == 401


def test_create_trip_success(client, master_data, auth_headers):
    response = client.post("/api/v1/trips", json=TRIP_PAYLOAD, headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["title"] == "Viaje a Bariloche"


def test_list_trips_empty_for_new_user(client, master_data, auth_headers):
    response = client.get("/api/v1/trips", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_trip_rejects_empty_destinations(client, master_data, auth_headers):
    payload = {**TRIP_PAYLOAD, "destinations": []}
    response = client.post("/api/v1/trips", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_get_trip_detail_not_found(client, master_data, auth_headers):
    response = client.get("/api/v1/trips/9999", headers=auth_headers)
    assert response.status_code == 404


def test_update_trip_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    payload = {
        "title": "Viaje actualizado",
        "description": "Nueva descripcion",
        "startDate": "2026-12-01",
        "endDate": "2026-12-15",
        "destinations": [{"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}],
    }
    response = client.put(f"/api/v1/trips/{viaje.IdViaje}", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["trip"]["title"] == "Viaje actualizado"


def test_update_trip_forbidden_for_non_admin(client, db_session, viaje_con_admin):
    from app.core.security import hash_password, create_access_token
    from app.models.usuario import Usuario
    from app.models.participante_viaje import ParticipanteViaje
    from app.models.rol_participante import RolParticipante
    from app.models.estado_participacion import EstadoParticipacion

    viaje, _ = viaje_con_admin
    otro = Usuario(
        Nombre="Otro", Apellido="Participante", NombreUsuario="otro_part",
        Email="otro@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(otro)
    db_session.flush()

    rol_participante = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    db_session.add(ParticipanteViaje(
        IdViaje=viaje.IdViaje, IdUsuario=otro.IdUsuario,
        IdRolParticipante=rol_participante.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    ))
    db_session.commit()
    db_session.refresh(otro)

    token = create_access_token({"sub": otro.Email, "user_id": otro.IdUsuario})
    payload = {
        "title": "Intento ajeno",
        "startDate": "2026-12-01",
        "endDate": "2026-12-15",
        "destinations": [{"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}],
    }
    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}", json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_delete_trip_success(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.delete(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200

    # El viaje queda "cancelado" -> el acceso posterior debe estar restringido
    seguimiento = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert seguimiento.status_code == 403


def test_delete_trip_not_found(client, auth_headers):
    response = client.delete("/api/v1/trips/9999", headers=auth_headers)
    assert response.status_code == 404