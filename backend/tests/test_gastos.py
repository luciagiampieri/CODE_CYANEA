from datetime import date, timedelta


def test_create_gasto_individual(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "IdGasto" in response.json()


def test_create_gasto_rejects_future_date(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today() + timedelta(days=5)),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400


def test_create_gasto_personalizada_montos_no_coinciden(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Excursion",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "500.00"}
        ],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400  # 500 asignado != 1000 total