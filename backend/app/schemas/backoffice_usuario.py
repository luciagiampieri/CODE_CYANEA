from datetime import datetime
from typing import Literal

from pydantic import BaseModel

EstadoCuenta = Literal["pendiente", "activa", "suspendida", "inactiva"]
PlanUsuario = Literal["gratuito", "pro"]


class UsuarioBackofficeItem(BaseModel):
    id: int
    nombreCompleto: str
    nombreUsuario: str
    email: str
    plan: PlanUsuario
    estado: EstadoCuenta
    fechaRegistro: datetime | None = None


class UsuarioBackofficePagina(BaseModel):
    items: list[UsuarioBackofficeItem]
    total: int
    pagina: int
    tamanioPagina: int
    totalPaginas: int


class UsuarioBackofficeDetalle(UsuarioBackofficeItem):
    nombre: str
    apellido: str
    fotoUrl: str | None = None
    metodoRegistro: str
    emailConfirmado: bool
    fechaBaja: datetime | None = None
    anonimizado: bool
    cantidadViajes: int
    estadoSuscripcion: str | None = None