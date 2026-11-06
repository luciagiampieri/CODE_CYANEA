from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoTramoLiteral = Literal["ida", "entre_destinos", "regreso"]
EstadoTramoLiteral = Literal["pendiente", "oculto", "agendado"]
ValidezTrasladoLiteral = Literal["valido", "no_corresponde", "sin_fecha"]


class TramoRef(BaseModel):
    """Identifica un tramo. La ida y el regreso solo llevan el tipo."""

    model_config = ConfigDict(extra="forbid")

    tipo: TipoTramoLiteral
    idDestinoOrigen: int | None = None
    idDestinoLlegada: int | None = None


class TrasladoDatos(BaseModel):
    # Las fechas salen del recorrido: un campo de fecha se rechaza.
    model_config = ConfigDict(extra="forbid")

    medio: str | None = Field(default=None, max_length=50)
    horaSalida: time | None = None
    horaLlegada: time | None = None
    notas: str | None = None
    confirmarSuperposicion: bool = False


class TrasladoCreate(TrasladoDatos):
    tramo: TramoRef


class TrasladoUpdate(TrasladoDatos):
    # Solo para reasignar un traslado que ya no corresponde al recorrido.
    tramo: TramoRef | None = None


class TrasladoOcultar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tramo: TramoRef
    # En False vuelve a mostrar la tarjeta para todo el grupo.
    oculto: bool = True


class ActividadSuperpuestaTrasladoRead(BaseModel):
    idActividad: int
    nombre: str
    horaInicio: str
    horaFin: str


class TrasladoGuardadoRead(BaseModel):
    guardado: bool
    requiereConfirmacion: bool = False
    superpuestas: list[ActividadSuperpuestaTrasladoRead] = Field(default_factory=list)
    mensaje: str | None = None
    idActividad: int | None = None
    nombre: str | None = None


class _TramoDatosRead(BaseModel):
    tipo: TipoTramoLiteral
    idDestinoOrigen: int | None = None
    idDestinoLlegada: int | None = None
    nombreOrigen: str | None = None
    nombreLlegada: str | None = None
    fechaSalida: date | None = None
    fechaLlegada: date | None = None
    validez: ValidezTrasladoLiteral = "valido"
    # La llegada quedó antes de la salida en un tramo del mismo día.
    revisarHorario: bool = False


class TrasladoActividadRead(_TramoDatosRead):
    """Tramo de la actividad que es un traslado."""


class TramoTrasladoRead(_TramoDatosRead):
    estado: EstadoTramoLiteral
    idDiaCronograma: int | None = None
    idActividad: int | None = None
