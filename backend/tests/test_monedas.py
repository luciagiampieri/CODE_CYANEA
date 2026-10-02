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

# ---------------------------------------------------------------------------
# US 94: cotización para completar automáticamente el monto en ARS
# ---------------------------------------------------------------------------

from datetime import date, timedelta  # noqa: E402
from decimal import Decimal  # noqa: E402


@pytest.fixture
def cotizacion_falsa(monkeypatch):
    llamadas = []

    def _instalar(tasa=None, error=None):
        def falsa(origen, destino, fecha=None):
            llamadas.append((origen, destino, fecha))
            if error:
                raise error
            return tasa

        monkeypatch.setattr("app.api.routes.monedas.obtener_tipo_cambio", falsa)
        return llamadas

    return _instalar


def test_cotizacion_requiere_auth(client):
    response = client.get("/api/v1/monedas/cotizacion?origen=USD&monto=10")
    assert response.status_code == 401


def test_cotizacion_convierte_el_monto_a_ars(client, auth_headers, cotizacion_falsa):
    llamadas = cotizacion_falsa(tasa=Decimal("1200.555"))

    response = client.get(
        "/api/v1/monedas/cotizacion?origen=usd&monto=530.43&fecha=2026-09-01", headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["Origen"] == "USD"
    assert data["Destino"] == "ARS"
    assert data["Fecha"] == "2026-09-01"
    assert Decimal(data["MontoConvertido"]) == Decimal("636810.39")
    assert llamadas == [("usd", "ARS", date(2026, 9, 1))]


def test_cotizacion_con_fecha_futura_usa_la_de_hoy(client, auth_headers, cotizacion_falsa):
    llamadas = cotizacion_falsa(tasa=Decimal("2"))
    futura = date.today() + timedelta(days=90)

    response = client.get(
        f"/api/v1/monedas/cotizacion?origen=USD&monto=10&fecha={futura}", headers=auth_headers
    )

    assert response.status_code == 200
    assert llamadas[0][2] == date.today()


def test_cotizacion_servicio_caido_devuelve_503(client, auth_headers, cotizacion_falsa):
    cotizacion_falsa(error=ValueError("caído"))

    response = client.get("/api/v1/monedas/cotizacion?origen=USD&monto=10", headers=auth_headers)

    assert response.status_code == 503
    assert response.headers["X-Error-Code"] == "EXCHANGE_RATE_UNAVAILABLE"
    assert "manualmente" in response.json()["detail"]


@pytest.mark.parametrize("monto", ["0", "-5", "abc"])
def test_cotizacion_rechaza_monto_invalido(client, auth_headers, monto):
    response = client.get(f"/api/v1/monedas/cotizacion?origen=USD&monto={monto}", headers=auth_headers)
    assert response.status_code == 422
