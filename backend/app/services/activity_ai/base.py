from __future__ import annotations
from decimal import Decimal
from typing import Protocol
from pydantic import BaseModel, ConfigDict

from app.services.receipt_ai.base import (  # noqa: F401
    AI_INVALID_RESPONSE,
    AI_RATE_LIMITED,
    AI_TIMEOUT,
    AI_UNAVAILABLE,
)


SUGGESTION_LIMIT_REACHED = "SUGGESTION_LIMIT_REACHED"
REQUEST_IN_PROGRESS = "REQUEST_IN_PROGRESS"
NO_PREFERENCES = "NO_PREFERENCES"
SLOT_FULL = "SLOT_FULL"
SLOT_INVALID = "SLOT_INVALID"
DAY_NOT_FOUND = "DAY_NOT_FOUND"
DAY_IN_PAST = "DAY_IN_PAST"

MENSAJE_NO_DISPONIBLE = (
    "El asistente de inteligencia artificial no está disponible en este momento. "
    "Tu itinerario no se modificó y podés crear la actividad manualmente."
)
MENSAJE_TIEMPO_AGOTADO = (
    "El asistente tardó demasiado en responder. Podés intentar nuevamente o crear la "
    "actividad manualmente."
)
MENSAJE_RESPUESTA_INVALIDA = (
    "No se pudo interpretar la respuesta del asistente. Podés intentar nuevamente o crear "
    "la actividad manualmente."
)
MENSAJE_LIMITE_USO = (
    "Se alcanzó el límite de uso del servicio de inteligencia artificial. Intentá más "
    "tarde o creá la actividad manualmente."
)
MENSAJE_SIN_OPCIONES = (
    "No se encontraron opciones para esa franja. Probá ampliando la franja horaria."
)


class SuggestionError(Exception):
    def __init__(self, message: str, status_code: int, code: str):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class SugerenciaIA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nombre: str
    descripcion: str
    hora_inicio: str
    hora_fin: str
    lugar_nombre: str
    costo_estimado_ars: Decimal
    motivo: str


class RespuestaSugerenciasIA(BaseModel):
    """Respuesta cruda del modelo, ya validada contra el esquema.

    Los tipos son estrictos (otra estructura se rechaza completa); los *valores* se
    revisan después con las reglas de negocio, descartando solo la sugerencia dudosa.
    """

    model_config = ConfigDict(extra="ignore")

    sugerencias: list[SugerenciaIA]


class ActivitySuggester(Protocol):
    """Contrato de un proveedor de IA para sugerir actividades.

    Recibe solo datos anonimizados (destino, fecha, franja, actividades del día y
    preferencias del grupo): ningún dato identificatorio de los participantes (RNF-33).
    Devuelve el JSON crudo; la validación la hace `validar_esquema` para todos por igual.
    """

    nombre: str

    async def sugerir(self, contexto: dict) -> dict: ...