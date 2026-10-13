from datetime import datetime, time
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


class ResultadoSugerenciasRead(BaseModel):
    IdSolicitud: int
    Sugerencias: list[SugerenciaActividadRead]
    Mensaje: str | None = None
    SolicitudesRestantes: int
    LimiteDiario: int


class ContextoSugerenciasRead(BaseModel):
    PuedeSolicitar: bool
    LimiteDiario: int
    SolicitudesRestantes: int
    ParticipantesTotal: int
    ParticipantesConPreferencias: int
    MisPreferenciasConfiguradas: bool