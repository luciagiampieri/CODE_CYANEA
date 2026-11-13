from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class SaldoFaseRead(BaseModel):
    Fase: Literal["pre_viaje", "en_curso", "post_viaje"]
    Desde: date | None = None
    Hasta: date | None = None
    CantidadGastos: int
    TotalGrupo: Decimal
    Pagado: Decimal | None = None
    Parte: Decimal | None = None
    Neto: Decimal | None = None


class LiquidacionParticipanteResumen(BaseModel):
    IdParticipanteViaje: int
    IdUsuario: int | None = None
    NombreCompleto: str
    NombreUsuario: str | None = None
    FotoUrl: str | None = None
    TotalPagado: Decimal
    GastoIndividual: Decimal
    BalanceOriginal: Decimal
    BalancePendiente: Decimal
    Fases: list[SaldoFaseRead] = []


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
    TotalGastosViaje: Decimal
    GastoUsuario: Decimal | None = None
    GastoPersonalUsuario: Decimal | None = None
    TieneDesbalances: bool
    ResumenParticipantes: list[LiquidacionParticipanteResumen]
    Transferencias: list[TransferenciaLiquidacionRead]
    FechaInicioViaje: date | None = None
    FechaFinViaje: date | None = None
    Fases: list[SaldoFaseRead] = []


class TransferenciaLiquidacionUpdate(BaseModel):
    Realizada: bool


class MiSaldoGastoRead(BaseModel):
    IdGasto: int
    Nombre: str
    FechaGasto: date
    NombreCategoria: str
    IconoCategoria: str | None = None
    Monto: Decimal
    NombrePagador: str
    PagasteVos: bool
    Pagado: Decimal
    TuParte: Decimal
    Efecto: Decimal


class MiSaldoTransferenciaRead(BaseModel):
    IdTransferenciaLiquidacion: int
    Enviada: bool
    NombreContraparte: str
    Monto: Decimal
    Estado: str
    Efecto: Decimal


class MiSaldoRead(BaseModel):
    Moneda: str
    TotalPagado: Decimal
    TotalParte: Decimal
    TransferenciasEnviadas: Decimal
    TransferenciasRecibidas: Decimal
    Saldo: Decimal
    Gastos: list[MiSaldoGastoRead]
    Transferencias: list[MiSaldoTransferenciaRead]