from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

TipoEventoAuditoria = Literal[
    "inicio_sesion", "suspension_usuario", "reactivacion_usuario",
    "publicacion_terminos", "cambio_plan",
]


class UsuarioAuditoriaRead(BaseModel):
    id: int | None
    nombreCompleto: str
    email: str | None
    anonimizado: bool


class EntidadAuditoriaRead(BaseModel):
    tipo: Literal["backoffice", "usuario", "terminos", "plan"]
    id: int | None
    nombre: str


class EventoAuditoriaRead(BaseModel):
    id: str
    fechaHora: datetime
    tipo: TipoEventoAuditoria
    usuario: UsuarioAuditoriaRead
    resultado: Literal["exitoso", "fallido"]
    entidad: EntidadAuditoriaRead


class CambioAuditoriaRead(BaseModel):
    campo: str
    valorAnterior: str | None
    valorNuevo: str | None


class DetalleAuditoriaRead(EventoAuditoriaRead):
    descripcion: str
    cambios: list[CambioAuditoriaRead]


class PaginaAuditoriaRead(BaseModel):
    items: list[EventoAuditoriaRead]
    total: int
    pagina: int
    tamanioPagina: int
    totalPaginas: int
    desde: date
    hasta: date


class TipoAuditoriaRead(BaseModel):
    valor: TipoEventoAuditoria
    etiqueta: str


class OpcionesAuditoriaRead(BaseModel):
    tipos: list[TipoAuditoriaRead]
    administradores: list[UsuarioAuditoriaRead]
