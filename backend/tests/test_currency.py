"""Tests del servicio de cotización (US-85, CA 3): cotización de la fecha del gasto o la más
cercana dentro de un margen de 3 días. La API externa se reemplaza por una falsa (sin red)."""

from datetime import date
from decimal import Decimal

import pytest
import requests

from app.services import currency
from app.services.currency import obtener_tipo_cambio

FECHA = date(2026, 9, 10)


class _Respuesta:
    def __init__(self, data, status_code=200):
        self._data = data
        self.status_code = status_code

    def json(self):
        return self._data


def _cotizacion(dia, tasa, base="EUR", quote="USD"):
    return {"date": f"2026-09-{dia:02d}", "base": base, "quote": quote, "rate": tasa}


@pytest.fixture
def api_falsa(monkeypatch):
    """
    Uso: llamadas = api_falsa([cotizaciones...])
    Se comporta como la API real: solo devuelve las cotizaciones dentro de [from, to].
    """

    def _instalar(cotizaciones, status_code=200, error=None):
        llamadas = []

        def falsa(url, params=None, timeout=None):
            llamadas.append({"url": url, "params": params, "timeout": timeout})
            if error is not None:
                raise error
            desde = date.fromisoformat(params["from"])
            hasta = date.fromisoformat(params["to"])
            dentro = [c for c in cotizaciones if desde <= date.fromisoformat(c["date"]) <= hasta]
            return _Respuesta(dentro, status_code)

        monkeypatch.setattr(currency.requests, "get", falsa)
        return llamadas

    return _instalar


def test_misma_moneda_devuelve_1_sin_consultar_la_api(api_falsa):
    llamadas = api_falsa([])

    assert obtener_tipo_cambio("usd", "USD", FECHA) == Decimal("1")
    assert llamadas == []


# CA 3
def test_consulta_una_ventana_de_3_dias_antes_y_despues_de_la_fecha(api_falsa):
    llamadas = api_falsa([_cotizacion(10, 1.1)])

    obtener_tipo_cambio("eur", "usd", FECHA)

    assert len(llamadas) == 1
    params = llamadas[0]["params"]
    assert params["from"] == "2026-09-07"
    assert params["to"] == "2026-09-13"
    assert params["base"] == "EUR"
    assert params["quotes"] == "USD"
    assert llamadas[0]["timeout"] is not None


# CA 3
def test_usa_la_cotizacion_de_la_fecha_exacta_si_existe(api_falsa):
    api_falsa([_cotizacion(9, 1.0), _cotizacion(10, 1.1), _cotizacion(11, 1.2)])

    assert obtener_tipo_cambio("EUR", "USD", FECHA) == Decimal("1.1")


# CA 3
def test_sin_fecha_exacta_usa_la_mas_cercana_anterior(api_falsa):
    # 2 días antes (1.05) vs 3 días después (1.3)
    api_falsa([_cotizacion(8, 1.05), _cotizacion(13, 1.3)])

    assert obtener_tipo_cambio("EUR", "USD", FECHA) == Decimal("1.05")


# CA 3
def test_sin_fecha_exacta_usa_la_mas_cercana_posterior(api_falsa):
    # 3 días antes (1.05) vs 1 día después (1.2)
    api_falsa([_cotizacion(7, 1.05), _cotizacion(11, 1.2)])

    assert obtener_tipo_cambio("EUR", "USD", FECHA) == Decimal("1.2")


# CA 3 (margen máximo)
def test_acepta_una_cotizacion_a_exactamente_3_dias(api_falsa):
    api_falsa([_cotizacion(13, 1.3)])

    assert obtener_tipo_cambio("EUR", "USD", FECHA) == Decimal("1.3")


# CA 3 (fuera del margen)
def test_rechaza_una_cotizacion_a_4_dias(api_falsa):
    api_falsa([_cotizacion(14, 1.4)])

    with pytest.raises(ValueError, match="No se encontraron cotizaciones"):
        obtener_tipo_cambio("EUR", "USD", FECHA)


def test_conserva_la_precision_decimal_de_la_cotizacion(api_falsa):
    api_falsa([_cotizacion(10, 1.0832)])

    tasa = obtener_tipo_cambio("EUR", "USD", FECHA)

    assert isinstance(tasa, Decimal)
    assert tasa == Decimal("1.0832")


# CP7 / CA 9
def test_si_la_api_responde_con_error_lanza_servicio_no_disponible(api_falsa):
    api_falsa([_cotizacion(10, 1.1)], status_code=500)

    with pytest.raises(ValueError, match="Servicio de cotización no disponible"):
        obtener_tipo_cambio("EUR", "USD", FECHA)


# CP7 / CA 9
def test_si_falla_la_conexion_lanza_servicio_no_disponible(api_falsa):
    api_falsa([], error=requests.ConnectionError("sin red"))

    with pytest.raises(ValueError, match="Servicio de cotización no disponible"):
        obtener_tipo_cambio("EUR", "USD", FECHA)


def test_si_la_api_demora_demasiado_lanza_servicio_no_disponible(api_falsa):
    api_falsa([], error=requests.Timeout("demoró demasiado"))

    with pytest.raises(ValueError, match="Servicio de cotización no disponible"):
        obtener_tipo_cambio("EUR", "USD", FECHA)


def test_si_la_respuesta_no_trae_el_par_pedido_lanza_error(api_falsa):
    api_falsa([_cotizacion(10, 900, quote="ARS")])

    with pytest.raises(ValueError, match="No se encontró cotización"):
        obtener_tipo_cambio("EUR", "USD", FECHA)