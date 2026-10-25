from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

EstadoSuscripcionFiltro = Literal["activa", "pendiente_pago", "cancelada", "vencida"]
EstadoPagoFiltro = Literal["aprobado", "rechazado", "pendiente"]


class UsuarioSuscripcionRead(BaseModel):
    id: int
    nombreCompleto: str
    nombreUsuario: str
    email: str


class SuscripcionBackofficeRead(BaseModel):
    id: int
    usuario: UsuarioSuscripcionRead
    plan: str
    tipoPlan: Literal["mensual", "anual"] | None
    estado: EstadoSuscripcionFiltro
    fechaInicio: datetime
    fechaFin: datetime
    fechaProximaRenovacion: datetime | None
    precioPeriodoARS: Decimal | None


class SuscripcionesBackofficePagina(BaseModel):
    items: list[SuscripcionBackofficeRead]
    total: int
    pagina: int
    tamanioPagina: int
    totalPaginas: int


class PagoBackofficeRead(BaseModel):
    id: int
    idSuscripcion: int
    usuario: UsuarioSuscripcionRead
    fecha: datetime
    montoARS: Decimal
    estado: EstadoPagoFiltro
    idOperacionPasarela: str | None


class PagosBackofficePagina(BaseModel):
    items: list[PagoBackofficeRead]
    total: int
    pagina: int
    tamanioPagina: int
    totalPaginas: int
    totalIngresosAprobadosARS: Decimal


class PeriodoIngresosRead(BaseModel):
    periodo: str
    desde: date
    hasta: date
    ingresosARS: Decimal
    mensualARS: Decimal
    anualARS: Decimal
    sinPeriodicidadARS: Decimal
    aprobados: int
    pendientesARS: Decimal
    pendientes: int
    rechazados: int


class ResumenFinancieroRead(BaseModel):
    desde: date
    hasta: date
    anteriorDesde: date
    anteriorHasta: date
    ingresosARS: Decimal
    ingresosAnterioresARS: Decimal
    variacionPorcentaje: Decimal | None
    pagosAprobados: int
    pagosPendientes: int
    pendientesARS: Decimal
    pagosRechazados: int
    tasaAprobacion: Decimal
    suscripcionesActivasHoy: int
    periodos: list[PeriodoIngresosRead]


class MovimientoSuscripcionRead(SuscripcionBackofficeRead):
    movimiento: Literal[
        "primer_periodo", "cambio_plan", "cambio_periodicidad", "renovacion", "nuevo_periodo"
    ]
    planAnterior: str | None
    tipoPlanAnterior: Literal["mensual", "anual"] | None
    fechaCancelacion: datetime | None


class HistorialComercialUsuarioRead(BaseModel):
    planActual: str
    totalPagadoARS: Decimal
    pagosAprobados: int
    pagosPendientes: int
    pagosRechazados: int
    ultimaSuscripcion: SuscripcionBackofficeRead | None
    items: list[MovimientoSuscripcionRead]
    total: int
    pagina: int
    tamanioPagina: int
    totalPaginas: int
