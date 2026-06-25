from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import date
from typing import Optional

from app.models.gasto import TipoDivisionEnum

class CategoriasGastosRead(BaseModel):
    IdCategoria: int
    Nombre: str
    
    model_config = {
        "from_attributes": True
    }


class ParticipantesGastosRead(BaseModel):
    IdParticipanteViaje: int
    Nombre: str
    Apellido: str
    NombreUsuario: str
    MontoAsignado: Optional[Decimal] = None
    
    model_config = {
        "from_attributes": True
    }


class ParticipanteDivisionCreate(BaseModel):
    IdParticipanteViaje: int
    MontoAsignado: Decimal | None = None


class GastoCreate(BaseModel):
    IdViaje: int
    Nombre: str
    Monto: Decimal
    IdCategoria: int
    IdPagador: Optional[int] = None
    FechaGasto: date
    EsCompartido: bool = True
    DividirEntreTodos: bool = True
    TipoDivision: Optional[TipoDivisionEnum] = None
    IdParticipantes: Optional[list[int]] = []
    DetalleMontosPersonalizados: Optional[list[ParticipanteDivisionCreate]] = []


class GastoRead(BaseModel):
    IdGasto: int
    IdViaje: int
    Nombre: str
    Monto: Decimal

    NombreCategoria: str

    NombrePagador: str
    ApellidoPagador: str
    NombreUsuarioPagador: str

    DividirEntreTodos: bool
    FechaGasto: date

    Participantes: list[str]

    model_config = {
        "from_attributes": True
    }



