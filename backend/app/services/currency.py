import requests
from decimal import Decimal
from datetime import date, timedelta


def obtener_tipo_cambio(
    moneda_origen: str,
    moneda_destino: str,
    fecha: date
) -> Decimal:
    """
    Obtiene el tipo de cambio más cercano a la fecha del gasto.

    Si existe una cotización para esa fecha, se utiliza esa.
    Si no existe, se utiliza la cotización disponible más cercana,
    anterior o posterior, dentro de un margen de 3 días.
    """

    moneda_origen = moneda_origen.upper()
    moneda_destino = moneda_destino.upper()

    if moneda_origen == moneda_destino:
        return Decimal("1")

    margen_dias = 3

    fecha_desde = fecha - timedelta(days=margen_dias)
    fecha_hasta = fecha + timedelta(days=margen_dias)

    url = "https://api.frankfurter.dev/v2/rates"

    params = {
        "from": fecha_desde.isoformat(),
        "to": fecha_hasta.isoformat(),
        "base": moneda_origen,
        "quotes": moneda_destino,
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=5,
        )

        if response.status_code != 200:
            raise ValueError(
                "Servicio de cotización no disponible"
            )

        data = response.json()

        if not data:
            raise ValueError(
                f"No se encontraron cotizaciones cercanas a {fecha}"
            )

        cotizaciones = [
            item for item in data
            if item.get("quote") == moneda_destino
        ]

        if not cotizaciones:
            raise ValueError(
                f"No se encontró cotización para "
                f"{moneda_origen}/{moneda_destino}"
            )

        fecha_objetivo = fecha

        cotizacion_mas_cercana = min(
            cotizaciones,
            key=lambda item: abs(
                date.fromisoformat(item["date"]) - fecha_objetivo
            )
        )

        return Decimal(str(cotizacion_mas_cercana["rate"]))

    except requests.RequestException as e:
        raise ValueError(
            f"Servicio de cotización no disponible: {str(e)}"
        )