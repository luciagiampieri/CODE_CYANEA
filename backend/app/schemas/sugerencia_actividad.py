from datetime import date, datetime, time
from pydantic import BaseModel


class SolicitudSugerenciasCreate(BaseModel):
    IdDiaCronograma: int
    HoraInicio: time
    HoraFin: time
    ContinuarSinPreferencias: bool = False
    Indicacion: str | None = None 
    DistanciaMaximaKm: int | None = None


class SugerenciaActividadRead(BaseModel):
    IdSugerenciaActividad: int
    IdSolicitud: int
    IdViaje: int
    IdDiaCronograma: int
    Estado: str
    Nombre: str
    Descripcion: str
    HoraInicio: str  
    HoraFin: str  
    GooglePlaceId: str
    LugarNombre: str
    LugarDireccion: str
    Lat: float
    Lng: float
    SitioWebUrl: str | None = None
    TieneFoto: bool = False
    CostoEstimadoARS: float
    Motivo: str
    FechaCreacion: datetime
    FranjaInicio: str | None = None
    FranjaFin: str | None = None


class ResultadoSugerenciasRead(BaseModel):
    IdSolicitud: int
    Sugerencias: list[SugerenciaActividadRead]
    Mensaje: str | None = None
    SolicitudesRestantes: int | None
    LimiteDiario: int | None


class ContextoSugerenciasRead(BaseModel):
    PuedeSolicitar: bool
    LimiteDiario: int | None
    SolicitudesRestantes: int | None
    ParticipantesTotal: int
    ParticipantesConPreferencias: int
    MisPreferenciasConfiguradas: bool



class AceptarSugerenciaRequest(BaseModel):
    """Horario con el que se crea la actividad. Si no llega, se usa el de la sugerencia."""

    HoraInicio: time | None = None
    HoraFin: time | None = None
    ConfirmarSuperposicion: bool = False


class ActividadSuperpuestaRead(BaseModel):
    IdActividad: int
    Nombre: str
    HoraInicio: str
    HoraFin: str


class AceptacionSugerenciaRead(BaseModel):
    """Resultado de aceptar una sugerencia.

    Con `RequiereConfirmacion` no se creó nada: hay actividades superpuestas y la app
    debe pedir confirmación y reenviar con `ConfirmarSuperposicion`."""

    Aceptada: bool
    RequiereConfirmacion: bool = False
    Superpuestas: list[ActividadSuperpuestaRead] = []
    Mensaje: str
    IdActividad: int | None = None
    Sugerencia: SugerenciaActividadRead | None = None


class FranjaLibreRead(BaseModel):
    IdDiaCronograma: int
    Fecha: date
    IndiceDia: int | None = None
    HoraInicio: str
    HoraFin: str
    DiaCompleto: bool


class FranjasLibresRead(BaseModel):
    Franjas: list[FranjaLibreRead]
    ItinerarioCompleto: bool
    Mensaje: str | None = None
    SolicitudesRestantes: int | None
    LimiteDiario: int | None
    MaxSugerenciasPorFranja: int


class FranjaSeleccionada(BaseModel):
    IdDiaCronograma: int
    HoraInicio: time
    HoraFin: time


class CompletarDiasLibresRequest(BaseModel):
    Franjas: list[FranjaSeleccionada]
    ContinuarSinPreferencias: bool = False
    DistanciaMaximaKm: int | None = None


class ResultadoFranjaRead(BaseModel):
    IdDiaCronograma: int
    Fecha: date
    HoraInicio: str
    HoraFin: str
    Sugerencias: list[SugerenciaActividadRead] = []
    Mensaje: str | None = None
    CodigoError: str | None = None


class ResultadoCompletarDiasLibresRead(BaseModel):
    Resultados: list[ResultadoFranjaRead]
    SolicitudesRestantes: int | None
    LimiteDiario: int | None