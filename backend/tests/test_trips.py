
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