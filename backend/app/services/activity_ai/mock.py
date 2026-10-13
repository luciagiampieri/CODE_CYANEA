"""Proveedor de prueba (AI_SUGGESTIONS_PROVIDER=mock).

No llama a ningún servicio externo: arma dos sugerencias genéricas dentro de la franja
pedida. Sirve para desarrollar el frontend sin gastar cuota. Los lugares igual se validan
contra Google Places, así que pueden descartarse si el nombre genérico no existe.
"""

from __future__ import annotations

import asyncio

from app.services.activity_ai.context import hhmm, parsear_hhmm


class MockActivitySuggester:
    nombre = "mock"

    def __init__(self, demora_segundos: float = 1.5):
        self.demora_segundos = demora_segundos

    async def sugerir(self, contexto: dict) -> dict:
        await asyncio.sleep(self.demora_segundos)
        destino = contexto.get("destino", "la ciudad")
        franja = contexto.get("franja", {})
        inicio = parsear_hhmm(franja.get("inicio", "10:00")) or 600
        fin = parsear_hhmm(franja.get("fin", "13:00")) or 780
        medio = inicio + (fin - inicio) // 2
        return {
            "sugerencias": [
                {
                    "nombre": f"Paseo por el centro de {destino}",
                    "descripcion": "Recorrido a pie por las calles y plazas principales.",
                    "hora_inicio": hhmm(inicio),
                    "hora_fin": hhmm(medio),
                    "lugar_nombre": f"Plaza principal de {destino}",
                    "costo_estimado_ars": 0,
                    "motivo": "Actividad gratuita y flexible, apta para cualquier grupo.",
                },
                {
                    "nombre": f"Visita al mercado de {destino}",
                    "descripcion": "Probá productos locales y recorré los puestos.",
                    "hora_inicio": hhmm(medio),
                    "hora_fin": hhmm(fin),
                    "lugar_nombre": f"Mercado central de {destino}",
                    "costo_estimado_ars": 8000,
                    "motivo": "Combina gastronomía y cultura local.",
                },
            ]
        }