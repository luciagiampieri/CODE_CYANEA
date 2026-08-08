from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class LiquidacionParticipanteResumen(BaseModel):
    IdParticipanteViaje: int
    IdUsuario: int | None = None
    NombreCompleto: str
    NombreUsuario: str | None = None
    FotoUrl: str | None = None
    BalanceOriginal: Decimal
    BalancePendiente: Decimal


class TransferenciaLiquidacionRead(BaseModel):
    IdTransferenciaLiquidacion: int
    IdParticipanteDeudor: int
    IdParticipanteAcreedor: int
    NombreDeudor: str
    NombreAcreedor: str
    Monto: Decimal
    Estado: str
    FechaConfirmacion: datetime | None = None


class LiquidacionViajeRead(BaseModel):
    IdLiquidacion: int
    IdViaje: int
    Version: int
    Moneda: str
    TieneDesbalances: bool
    ResumenParticipantes: list[LiquidacionParticipanteResumen]
    Transferencias: list[TransferenciaLiquidacionRead]


class TransferenciaLiquidacionUpdate(BaseModel):
    Realizada: bool
