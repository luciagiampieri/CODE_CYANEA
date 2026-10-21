from datetime import datetime

from pydantic import BaseModel


class UsoLimiteRead(BaseModel):
    tipoLimite: str
    limite: float | None
    usoActual: float
    ilimitado: bool
    renuevaEl: datetime | None = None