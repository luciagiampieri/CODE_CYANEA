from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

Modalidad = Literal["mensual", "anual"]
EstadoIntento = Literal["activa", "pago_en_proceso", "pago_rechazado", "sin_pago", "descartada"]
EstadoGestion = Literal["activa", "cancelada", "pendiente_pago", "vencida"]


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


class SuscripcionGestionRead(BaseModel):
    id: int
    modalidad: Modalidad | None
    estado: EstadoGestion
    precioARS: Decimal | None
    fechaInicio: datetime
    fechaFin: datetime
    fechaProximaRenovacion: datetime | None
    fechaCancelacion: datetime | None
    fechaLimitePago: datetime | None = None
    renovacionAutomatica: bool
    puedeCancelar: bool
    puedeReactivar: bool
    urlMedioPago: str | None


class GestionSuscripcionRead(BaseModel):
    planActual: Literal["gratuito", "pro"]
    suscripcion: SuscripcionGestionRead | None


class AccionSuscripcionRead(GestionSuscripcionRead):
    message: str


class PagoHistorialRead(BaseModel):
    id: int
    fecha: datetime
    montoARS: Decimal
    estado: Literal["aprobado", "rechazado", "pendiente"]
    periodoDesde: datetime | None
    periodoHasta: datetime | None


class HistorialPagosRead(BaseModel):
    items: list[PagoHistorialRead]