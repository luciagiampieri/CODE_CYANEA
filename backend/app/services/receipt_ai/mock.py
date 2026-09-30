"""Proveedor de prueba (AI_RECEIPT_PROVIDER=mock).

No llama a ningún servicio externo: devuelve siempre el mismo comprobante
ficticio. Sirve para desarrollar el frontend y mostrar el flujo sin API key ni
consumo de cuota.
"""

from __future__ import annotations

import asyncio
from datetime import date


class MockReceiptExtractor:
    nombre = "mock"

    def __init__(self, demora_segundos: float = 1.5):
        self.demora_segundos = demora_segundos

    async def extraer(self, imagen: bytes, mime_type: str, categorias: list[str]) -> dict:
        # Simula la demora para poder ver el indicador de progreso.
        await asyncio.sleep(self.demora_segundos)
        categoria = "Comida y Bebida" if "Comida y Bebida" in categorias else None
        return {
            "es_comprobante": True,
            "legible": True,
            "monto_total": 18450.50,
            "fecha": date.today().isoformat(),
            "comercio": "Café de prueba",
            "moneda": "ARS",
            "moneda_explicita": False,
            "categoria": categoria,
            "confianza": {
                "monto_total": "alta",
                "fecha": "alta",
                "comercio": "alta",
                "moneda": "baja",
                "categoria": "alta",
            },
        }
