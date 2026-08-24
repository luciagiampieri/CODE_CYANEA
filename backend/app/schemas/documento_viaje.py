from datetime import datetime

from pydantic import BaseModel, Field


class CategoriasDocumentosRead(BaseModel):
    IdCategoriaDocumento: int
    Nombre: str

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

    NombreCategoria: str
    NombreUsuarioSubida: str
    EsPropio: bool = Field(
        ...,
        description="Si el documento fue subido por el usuario que consulta (habilita eliminarlo)."
    )

    model_config = {
        "from_attributes": True
    }