from typing import Literal

from pydantic import BaseModel, Field, field_validator

TipoCategoria = Literal["gastos", "documentos", "checklist"]

LARGO_MAXIMO_NOMBRE = 50
# Nombre de un ícono de FontAwesome 6 (p. ej. "utensils", "map-location-dot").
PATRON_ICONO = r"^[a-z0-9]+(-[a-z0-9]+)*$"


def _limpiar_nombre(valor: str | None) -> str | None:
    if valor is None:
        return None
    limpio = " ".join(valor.split())
    if not limpio:
        raise ValueError("Ingresá el nombre de la categoría.")
    return limpio


class CategoriaBackofficeRead(BaseModel):
    id: int
    tipo: TipoCategoria
    nombre: str
    icono: str
    activa: bool
    esSistema: bool
    cantidadUsos: int


class CategoriasBackofficeListado(BaseModel):
    gastos: list[CategoriaBackofficeRead]
    documentos: list[CategoriaBackofficeRead]
    checklist: list[CategoriaBackofficeRead]


class CategoriaBackofficeCreate(BaseModel):
    tipo: TipoCategoria
    nombre: str = Field(..., max_length=LARGO_MAXIMO_NOMBRE)
    icono: str = Field(..., min_length=1, max_length=50, pattern=PATRON_ICONO)

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str) -> str:
        return _limpiar_nombre(valor)


class CategoriaBackofficeUpdate(BaseModel):
    nombre: str | None = Field(default=None, max_length=LARGO_MAXIMO_NOMBRE)
    icono: str | None = Field(default=None, min_length=1, max_length=50, pattern=PATRON_ICONO)

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str | None) -> str | None:
        return _limpiar_nombre(valor)


class CategoriaBackofficeEstado(BaseModel):
    activa: bool
