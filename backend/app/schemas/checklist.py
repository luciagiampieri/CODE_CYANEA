from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

class ResponsableRead(BaseModel):
    IdUsuario: int
    NombreCompleto: str
    model_config = {"from_attributes": True}


class CategoriaChecklistRead(BaseModel):
    IdCategoriaChecklist: int
    Nombre: str
    Icono: str | None = None
    model_config = {"from_attributes": True}


class DocumentoTareaRead(BaseModel):
    """Documento subido desde la tarea (las entradas, el pasaje, la reserva...).
    Solo se informan los que el usuario puede ver: públicos o subidos por él."""

    IdDocumento: int
    NombreArchivo: str
    UrlArchivo: str
    IdCategoriaDocumento: int
    NombreCategoria: str
    IconoCategoria: str | None = None
    EsPublico: bool
    EsPropio: bool
    NombreUsuarioSubida: str


class ChecklistCreate(BaseModel):
    Nombre: str = Field(..., min_length=1, max_length=150)
    IdCategoriaChecklist: int 
    IdsResponsables: list[int] = Field(default_factory=list)
    # "Solo para mí": solo la ve quien la crea, que queda como único responsable.
    EsPrivada: bool = False

class ChecklistUpdate(BaseModel):
    Nombre: str | None = Field(None, min_length=1, max_length=150)
    IdCategoriaChecklist: int | None = None
    Completada: bool | None = None
    IdsResponsables: list[int] | None = None
    EsPrivada: bool | None = None

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

    # Tareas creadas con "Recordármelo" desde una recomendación de entradas o reservas.
    Enlace: str | None = None
    IdActividad: int | None = None

    # Tarea privada ("Solo para mí"): solo la ve quien la creó.
    EsPrivada: bool = False
    # Quién la marcó como hecha ("Hecha por ...").
    IdUsuarioCompletada: int | None = None
    NombreUsuarioCompletada: str | None = None
    # Si el usuario que consulta puede marcarla o desmarcarla como hecha: sus
    # responsables o, si no tiene, cualquier integrante (privada: solo quien la creó).
    PuedeCompletar: bool = True
    # Las tareas de "Recordármelo" son siempre del grupo.
    PuedeSerPrivada: bool = True
    # Documentos subidos desde la tarea que el usuario puede ver.
    Documentos: list[DocumentoTareaRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}

class TareaEntradasCreate(BaseModel):
    """"Recordármelo" en la recomendación de entradas o reservas de una actividad.

    Si el backend todavía tiene la recomendación verificada en caché, usa esa y no
    estos datos (el enlace guardado siempre es el verificado en el sitio oficial)."""

    tipo: Literal["RESERVA", "RESERVA_DISPONIBLE", "ENTRADAS_ANTICIPADAS"]
    enlace: str | None = Field(default=None, max_length=500)
    nombreLugar: str | None = Field(default=None, max_length=150)


class SugerenciaDocumentoRead(BaseModel):
    """Sugerencia de subir las entradas o la reserva al marcar la tarea como hecha."""

    sugerir: bool
    tipo: str | None = None
    documento: str | None = None
    titulo: str | None = None
    mensaje: str | None = None
    IdCategoriaDocumento: int | None = None
    NombreCategoriaDocumento: str | None = None
    EsPublico: bool | None = None
    NombreSugerido: str | None = None
