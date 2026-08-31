from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificacionRead(BaseModel):
    id: int
    viajeId: int | None = None
    tipo: str
    titulo: str
    mensaje: str
    leida: bool
    fechaCreacion: datetime

    model_config = ConfigDict(from_attributes=True)