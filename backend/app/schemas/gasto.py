from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import date

class CategoriasGastosRead(BaseModel):
    IdCategoria: int
    Nombre: str
    
    model_config = {
        "from_attributes": True
    }


class ParticipantesGastosRead(BaseModel):
    IdParticipanteViaje: int
    Nombre: str
    
    model_config = {
        "from_attributes": True
    }


class GastoCreate(BaseModel):
    IdViaje: int
    Nombre: str
    Monto: Decimal
    IdCategoria: int
    IdPagador: int
    DividirEntreTodos: bool
    FechaGasto: date
    IdParticipantes: list[int] = Field(default_factory=list)





