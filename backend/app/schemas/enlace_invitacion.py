from datetime import date, datetime

from pydantic import BaseModel


class EnlaceInvitacionCreate(BaseModel):
    renovar: bool = False


class EnlaceInvitacionRead(BaseModel):
    url: str | None = None
    activo: bool = False
    fechaVencimiento: datetime | None = None


class InvitacionCompartidaRead(BaseModel):
    titulo: str
    administrador: str
    destinos: list[str]
    fechaInicio: date
    fechaFin: date


class IncorporacionViajeRead(BaseModel):
    idViaje: int
    yaParticipaba: bool
    message: str
