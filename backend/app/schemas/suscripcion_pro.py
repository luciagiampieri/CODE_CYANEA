from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

Modalidad = Literal["mensual", "anual"]
EstadoIntento = Literal["activa", "pago_en_proceso", "pago_rechazado", "sin_pago", "descartada"]


class ModalidadResumenRead(BaseModel):
    precioARS: Decimal | None
    fechaProximaRenovacion: datetime


class ResumenSuscripcionRead(BaseModel):
    puedeSuscribirse: bool
    codigo: str | None
    mensaje: str | None
    modalidades: dict[Modalidad, ModalidadResumenRead]


class IniciarSuscripcionRequest(BaseModel):
    modalidad: Modalidad
    aceptaRenovacionAutomatica: bool = False


class IniciarSuscripcionResponse(BaseModel):
    id: int
    modalidad: Modalidad
    precioARS: Decimal
    fechaProximaRenovacion: datetime
    urlPago: str
    urlRetorno: str


class EstadoSuscripcionRead(BaseModel):
    id: int
    estado: EstadoIntento
    modalidad: Modalidad | None
    precioARS: Decimal | None
    fechaInicio: datetime
    fechaFin: datetime
    fechaProximaRenovacion: datetime | None
    planActual: Literal["gratuito", "pro"]
