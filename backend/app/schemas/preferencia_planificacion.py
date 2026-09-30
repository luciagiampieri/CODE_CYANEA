from datetime import date, datetime

from pydantic import BaseModel, Field


class InteresPlanificacionRead(BaseModel):
    IdInteresPlanificacion: int
    Nombre: str
    Icono: str

    model_config = {"from_attributes": True}


class RitmoViajeRead(BaseModel):
    IdRitmoViaje: int
    Nombre: str
    Descripcion: str

    model_config = {"from_attributes": True}


class OpcionesPlanificacionRead(BaseModel):
    Intereses: list[InteresPlanificacionRead]
    Ritmos: list[RitmoViajeRead]
    MaxCaracteresConsideraciones: int


class PreferenciaPlanificacionUpsert(BaseModel):
    """Payload para crear o modificar las preferencias propias en un viaje.

    Los tipos son deliberadamente laxos: las reglas de negocio se validan en la
    ruta para devolver mensajes en español (400) en lugar del 422 genérico.
    """

    IdsIntereses: list[int] = Field(default_factory=list)
    IdRitmoViaje: int | None = None
    PresupuestoDiarioARS: float | int | str | None = None
    Consideraciones: str | None = None


class PreferenciaPlanificacionRead(BaseModel):
    IdPreferenciaPlanificacion: int
    IdsIntereses: list[int]
    IdRitmoViaje: int
    PresupuestoDiarioARS: float | None
    Consideraciones: str | None
    FechaActualizacion: datetime


class PreferenciasPlanificacionResponse(BaseModel):
    Configurada: bool
    PuedeEditar: bool
    Preferencias: PreferenciaPlanificacionRead | None
    Opciones: OpcionesPlanificacionRead


class ViajePreferenciasResumenRead(BaseModel):
    """Fila del listado de "Preferencias de planificación" en Configuración."""

    IdViaje: int
    Titulo: str
    FechaInicio: date
    FechaFin: date
    Destinos: list[str]
    Configurada: bool
    Intereses: list[str]
    Ritmo: str | None
