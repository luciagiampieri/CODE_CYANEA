from decimal import Decimal
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

EnteroPositivo = Annotated[int, Field(strict=True, gt=0, le=2147483647)]
PrecioARS = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]


class LimitesPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    maxViajesActivos: EnteroPositivo
    maxParticipantesViaje: EnteroPositivo
    maxSugerenciasDiarias: EnteroPositivo
    maxEscaneosMensuales: EnteroPositivo
    maxAlmacenamientoMb: EnteroPositivo


class ConfiguracionPlanesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    precioMensualARS: PrecioARS
    precioAnualARS: PrecioARS
    gratuito: LimitesPlan
    pro: LimitesPlan


class LimitesPlanRead(BaseModel):
    maxViajesActivos: int | None
    maxParticipantesViaje: int | None
    maxSugerenciasDiarias: int | None
    maxEscaneosMensuales: int | None
    maxAlmacenamientoMb: int | None


class ConfiguracionPlanesRead(BaseModel):
    precioMensualARS: Decimal | None
    precioAnualARS: Decimal | None
    gratuito: LimitesPlanRead
    pro: LimitesPlanRead


class AuditoriaPlanRead(BaseModel):
    id: int
    idPlan: int
    idAdministrador: int
    campo: str
    valorAnterior: str | None
    valorNuevo: str
    fechaHora: datetime
