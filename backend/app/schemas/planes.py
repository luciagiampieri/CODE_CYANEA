from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.backoffice_plan import ConfiguracionPlanesRead


class SuscripcionPropiaRead(BaseModel):
    id: int
    tipoPlan: Literal["mensual", "anual"] | None
    estado: str
    fechaInicio: datetime
    fechaFin: datetime
    fechaCancelacion: datetime | None
    precioPeriodoARS: Decimal | None


class PlanesDisponiblesRead(ConfiguracionPlanesRead):
    planActual: Literal["gratuito", "pro"]
    ahorroAnualPorcentaje: Decimal | None
    ultimaSuscripcion: SuscripcionPropiaRead | None
