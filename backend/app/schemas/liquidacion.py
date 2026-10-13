from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


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
    # Total del grupo: solo gastos compartidos.
    TotalGastosViaje: Decimal
    # "Tu gasto" de quien consulta: su parte de los compartidos + sus gastos
    # personales. None si no es participante aceptado del viaje.
    GastoUsuario: Decimal | None = None
    GastoPersonalUsuario: Decimal | None = None
    TieneDesbalances: bool
    ResumenParticipantes: list[LiquidacionParticipanteResumen]
    Transferencias: list[TransferenciaLiquidacionRead]


class TransferenciaLiquidacionUpdate(BaseModel):
    Realizada: bool


# ---------------------------------------------------------------------------
# "De dónde sale tu saldo" (GET /trips/{id}/settlement/mi-saldo)
# ---------------------------------------------------------------------------

class MiSaldoGastoRead(BaseModel):
    """Un gasto compartido en el que el usuario pagó o tiene parte."""
    IdGasto: int
    Nombre: str
    FechaGasto: date
    NombreCategoria: str
    Monto: Decimal
    NombrePagador: str
    PagasteVos: bool
    Pagado: Decimal  # lo que pagó el usuario (Monto si fue el pagador, si no 0)
    TuParte: Decimal  # lo que le toca al usuario en la división
    Efecto: Decimal  # Pagado - TuParte: positivo = le deben más, negativo = debe más


class MiSaldoTransferenciaRead(BaseModel):
    """Una transferencia ya hecha (confirmada o avisada) que mueve el saldo."""
    IdTransferenciaLiquidacion: int
    Enviada: bool  # True: la hizo el usuario; False: la recibió
    NombreContraparte: str
    Monto: Decimal
    Estado: str
    Efecto: Decimal  # enviada suma, recibida resta


class MiSaldoRead(BaseModel):
    Moneda: str
    TotalPagado: Decimal
    TotalParte: Decimal
    TransferenciasEnviadas: Decimal
    TransferenciasRecibidas: Decimal
    # TotalPagado - TotalParte + TransferenciasEnviadas - TransferenciasRecibidas.
    # Positivo: le deben. Negativo: debe.
    Saldo: Decimal
    Gastos: list[MiSaldoGastoRead]
    Transferencias: list[MiSaldoTransferenciaRead]