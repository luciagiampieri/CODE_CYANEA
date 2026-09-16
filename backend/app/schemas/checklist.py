from datetime import datetime
from pydantic import BaseModel, Field

class ResponsableRead(BaseModel):
    IdUsuario: int
    NombreCompleto: str
    model_config = {"from_attributes": True}


class CategoriaChecklistRead(BaseModel):
    IdCategoriaChecklist: int
    Nombre: str
    model_config = {"from_attributes": True}


class ChecklistCreate(BaseModel):
    Nombre: str = Field(..., min_length=1, max_length=60)
    IdCategoriaChecklist: int 
    IdsResponsables: list[int] = Field(default_factory=list)

class ChecklistUpdate(BaseModel):
    Nombre: str | None = Field(None, min_length=1, max_length=60)
    IdCategoriaChecklist: int | None = None
    Completada: bool | None = None
    IdsResponsables: list[int] | None = None

class ChecklistRead(BaseModel):
    IdChecklist: int
    IdViaje: int
    IdUsuarioCreador: int

    Nombre: str
    Completada: bool
    FechaCreacion: datetime

    NombreUsuarioCreador: str
    EsPropio: bool = Field(..., description="Si el checklist fue creado por el usuario que consulta.")

    CategoriaChecklist: CategoriaChecklistRead
    Responsables: list[ResponsableRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}