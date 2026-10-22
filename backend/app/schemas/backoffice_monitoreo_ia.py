from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

NivelAlertaCosto = Literal["sin_umbral", "normal", "advertencia", "superado"]


class ConsumoFuncionalidadIA(BaseModel):
    servicio: str
    nombre: str
    solicitudes: int
    fallidas: int
    tiempoPromedioMs: int | None = None
    costoEstimadoUSD: float


class TotalesConsumoIA(BaseModel):
    solicitudes: int
    fallidas: int
    tiempoPromedioMs: int | None = None
    costoEstimadoUSD: float


class EstadoUmbralCostoIA(BaseModel):
    periodo: str
    umbralMensualUSD: float | None = None
    costoMesActualUSD: float
    porcentajeUsado: float | None = None
    nivel: NivelAlertaCosto
    fechaActualizacion: datetime | None = None
    fechaUltimaAlerta: datetime | None = None


class MonitoreoIA(BaseModel):
    desde: date
    hasta: date
    funcionalidades: list[ConsumoFuncionalidadIA]
    totales: TotalesConsumoIA
    umbral: EstadoUmbralCostoIA


class UmbralCostoIAUpdate(BaseModel):
    # null quita el umbral.
    umbralMensualUSD: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
