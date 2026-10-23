from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

LARGO_MAXIMO_NUMERO = 30
LARGO_MAXIMO_TITULO = 200
LARGO_MAXIMO_CONTENIDO = 100000

EstadoVersionTerminos = Literal["borrador", "vigente", "historica"]


class VersionTerminosPayload(BaseModel):
    numero: str = Field(default="", validate_default=True)
    titulo: str = Field(default="", validate_default=True)
    contenido: str = Field(default="", validate_default=True)

    @field_validator("numero")
    @classmethod
    def _numero(cls, valor: str) -> str:
        limpio = (valor or "").strip()
        if not limpio:
            raise ValueError("Ingresá el número de versión.")
        if len(limpio) > LARGO_MAXIMO_NUMERO:
            raise ValueError(f"El número de versión puede tener hasta {LARGO_MAXIMO_NUMERO} caracteres.")
        return limpio

    @field_validator("titulo")
    @classmethod
    def _titulo(cls, valor: str) -> str:
        limpio = " ".join((valor or "").split())
        if not limpio:
            raise ValueError("Ingresá el título.")
        if len(limpio) > LARGO_MAXIMO_TITULO:
            raise ValueError(f"El título puede tener hasta {LARGO_MAXIMO_TITULO} caracteres.")
        return limpio

    @field_validator("contenido")
    @classmethod
    def _contenido(cls, valor: str) -> str:
        limpio = (valor or "").replace("\r\n", "\n").strip()
        if not limpio:
            raise ValueError("Ingresá el contenido.")
        if len(limpio) > LARGO_MAXIMO_CONTENIDO:
            raise ValueError(f"El contenido puede tener hasta {LARGO_MAXIMO_CONTENIDO} caracteres.")
        return limpio


class VersionTerminosItem(BaseModel):
    id: int
    numero: str
    titulo: str
    estado: EstadoVersionTerminos
    fechaCreacion: datetime
    fechaPublicacion: datetime | None = None


class VersionTerminosDetalle(VersionTerminosItem):
    contenido: str


class ListadoTerminos(BaseModel):
    versiones: list[VersionTerminosItem]
    versionVigente: str | None = None
    usuariosAceptaronVigente: int = 0