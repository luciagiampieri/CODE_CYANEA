from datetime import datetime

from pydantic import BaseModel, Field


class CategoriasDocumentosRead(BaseModel):
    IdCategoriaDocumento: int
    Nombre: str
    Icono: str | None = None

    model_config = {
        "from_attributes": True
    }

class DocumentoViajeCreate(BaseModel):
    IdCategoriaDocumento: int
    NombreArchivo: str


class DocumentoViajeRead(BaseModel):
    IdDocumento: int
    IdViaje: int
    IdCategoriaDocumento: int
    IdUsuarioSubida: int

    NombreArchivo: str
    UrlArchivo: str
    FechaSubida: datetime
    FechaActualizacion: datetime | None = None
    TamanoBytes: int | None = None

    NombreCategoria: str
    IconoCategoria: str | None = None
    NombreUsuarioSubida: str
    EsPublico: bool
    EsPropio: bool = Field(
        ...,
        description="Si el documento fue subido por el usuario que consulta (habilita eliminarlo)."
    )

    model_config = {
        "from_attributes": True
    }