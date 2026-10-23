from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

LARGO_MAXIMO_MOTIVO = 500
AccionSuspension = Literal["suspension", "reactivacion"]


class SuspensionRequest(BaseModel):
    motivo: str = Field(default="", validate_default=True)

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, valor: str) -> str:
        limpio = (valor or "").strip()
        if not limpio:
            raise ValueError("Ingresá el motivo de la suspensión.")
        if len(limpio) > LARGO_MAXIMO_MOTIVO:
            raise ValueError(f"El motivo puede tener hasta {LARGO_MAXIMO_MOTIVO} caracteres.")
        return limpio


class EventoSuspension(BaseModel):
    id: int
    accion: AccionSuspension
    motivo: str | None = None
    fecha: datetime
    administrador: str


class HistorialSuspensiones(BaseModel):
    suspendida: bool
    motivoVigente: str | None = None
    fechaSuspension: datetime | None = None
    administrador: str | None = None
    historial: list[EventoSuspension] = []