from datetime import datetime

from pydantic import BaseModel


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

    model_config = {
        "from_attributes": True
    }