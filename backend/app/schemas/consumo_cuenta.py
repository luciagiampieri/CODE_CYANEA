from datetime import datetime

from pydantic import BaseModel


class ConsumoLimiteRead(BaseModel):
    limite: int | float | None
    usoActual: int | float
    ilimitado: bool
    renuevaEl: datetime | None
    porcentajeUso: float | None
    limiteAlcanzado: bool
    limiteExcedido: bool


class ConsumoViajeRead(BaseModel):
    id: int
    titulo: str
    estado: str
    esAdministrador: bool
    planAdministrador: str
    participantes: ConsumoLimiteRead
    sugerenciasDiarias: ConsumoLimiteRead
    almacenamiento: ConsumoLimiteRead


class ConsumoCuentaRead(BaseModel):
    planActual: str
    consultadoEl: datetime
    viajesActivos: ConsumoLimiteRead
    escaneosMensuales: ConsumoLimiteRead
    items: list[ConsumoViajeRead]
    total: int
    pagina: int
    totalPaginas: int
