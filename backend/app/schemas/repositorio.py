from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ItemRepositorioCreate(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=150, description="Título del ítem (AC1)")
    tipo: Literal["enlace", "direccion", "contacto", "otro"] = Field(
        ..., description="Tipo de contenido (AC1)"
    )
    contenido: str = Field(..., min_length=1, description="Enlace, dirección o contacto (AC1)")
    descripcion: str | None = Field(default=None, description="Descripción opcional (AC2)")
    esPublico: bool = Field(default=True, description="Público o privado (AC3)")

    @field_validator("titulo")
    @classmethod
    def validar_titulo(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El título del ítem no puede quedar vacío")
        return cleaned

    @field_validator("contenido")
    @classmethod
    def validar_contenido(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El contenido del ítem no puede quedar vacío")
        return cleaned

    @field_validator("descripcion")
    @classmethod
    def validar_descripcion(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ItemRepositorioUpdate(ItemRepositorioCreate):
    """Mismos campos que la creación: la edición reemplaza el ítem completo."""


class ItemRepositorioRead(BaseModel):
    IdItemRepositorio: int
    IdViaje: int
    IdUsuarioCreador: int
    Titulo: str
    Tipo: str
    Contenido: str
    Descripcion: str | None
    EsPublico: bool
    FechaCreacion: datetime
    FechaActualizacion: datetime
    NombreUsuarioCreador: str
    EsPropio: bool = Field(..., description="Si el ítem fue creado por el usuario que consulta")

    class Config:
        from_attributes = True
        populate_by_name = True


class ItemRepositorioMutationResponse(BaseModel):
    message: str
    item: ItemRepositorioRead