import pytest

from app.models.moneda import Moneda


@pytest.fixture()
def monedas_seed(db_session):
    monedas = [
        Moneda(Codigo="ARS", Nombre="Peso argentino"),
        Moneda(Codigo="USD", Nombre="Dolar estadounidense"),
        Moneda(Codigo="EUR", Nombre="Euro"),
        Moneda(Codigo="BRL", Nombre="Real brasileno"),
    ]
    db_session.add_all(monedas)
    db_session.commit()
    return monedas


def test_get_monedas_no_requiere_auth(client, monedas_seed):
    response = client.get("/api/v1/monedas/")
    assert response.status_code == 200


def test_get_monedas_lista_ordenada_por_codigo(client, monedas_seed):
    response = client.get("/api/v1/monedas/")
    assert response.status_code == 200
    codigos = [m["Codigo"] for m in response.json()]
    assert codigos == sorted(codigos)
    assert codigos == ["ARS", "BRL", "EUR", "USD"]


def test_get_monedas_vacio_sin_datos(client):
    response = client.get("/api/v1/monedas/")
    assert response.status_code == 200
    assert response.json() == []


def test_search_monedas_por_codigo(client, monedas_seed):
    response = client.get("/api/v1/monedas/search?q=usd")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["Codigo"] == "USD"


def test_search_monedas_por_nombre(client, monedas_seed):
    response = client.get("/api/v1/monedas/search?q=euro")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["Codigo"] == "EUR"


def test_search_monedas_es_case_insensitive(client, monedas_seed):
    response = client.get("/api/v1/monedas/search?q=PESO")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["Codigo"] == "ARS"


def test_search_monedas_sin_query_devuelve_todas(client, monedas_seed):
    response = client.get("/api/v1/monedas/search")
    assert response.status_code == 200
    assert len(response.json()) == 4


def test_search_monedas_sin_resultados(client, monedas_seed):
    response = client.get("/api/v1/monedas/search?q=xyz")
    assert response.status_code == 200
    assert response.json() == []


def test_search_monedas_respeta_limite_de_20(client, db_session):
    monedas = [
        Moneda(Codigo=f"C{i:02d}", Nombre=f"Moneda {i}")
        for i in range(25)
    ]
    db_session.add_all(monedas)
    db_session.commit()

    response = client.get("/api/v1/monedas/search")
    assert response.status_code == 200
    assert len(response.json()) == 20