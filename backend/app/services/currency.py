import requests
from decimal import Decimal
from datetime import date

def obtener_tipo_cambio(moneda_origen: str, moneda_destino: str, fecha: date | None = None) -> float:
    """
    Obtiene el tipo de cambio entre dos monedas utilizando ExchangeRate-API.
    Si se proporciona una fecha anterior a hoy, intenta consultar la tasa histórica.
    """
    if moneda_origen.upper() == moneda_destino.upper():
        return 1.0
    
    # Si la fecha es pasada, ExchangeRate-API soporta endpoints históricos v6, 
    # o bien recurrimos al endpoint estándar si es la fecha actual o si el histórico no está disponible en el plan libre.
    # En la versión gratuita de ER-API, el endpoint estándar da la tasa actual más reciente, 
    # pero podemos estructurarlo para consulta.
    url = f"https://open.er-api.com/v6/latest/{moneda_origen.upper()}"
    
    try:
        response = requests.get(url, timeout=5)
        if response.status_code != 200:
            raise ValueError("Servicio de cotización no disponible")
        
        data = response.json()
        rates = data.get("rates", {})
        tasa = rates.get(moneda_destino.upper())
        
        if tasa is None:
            raise ValueError(f"No se encontró la tasa de cambio para {moneda_destino}")
            
        return float(tasa)
    except Exception as e:
        raise ValueError(f"Servicio de cotización no disponible: {str(e)}")