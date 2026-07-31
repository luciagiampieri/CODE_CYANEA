from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class VotacionCreate(BaseModel):

    idViaje: int = Field(..., description="Viaje al que pertenece la votacion")
    nombre: str = Field(
        ..., min_length=1, max_length=150, description="Nombre descriptivo (AC1)"
    )
    fechaCierre: datetime = Field(..., description="Fecha y hora de cierre (AC1/AC6)")
    tipo: Literal["opcion_unica", "opcion_multiple"] = Field(
        ..., description="Tipo de votacion (AC3)"
    )
    propuestas: list[str] = Field(
        ..., description="Listado de propuestas; al menos dos validas (AC2)"
    )

    @field_validator("nombre")
    @classmethod
    def validar_nombre(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El nombre de la votacion no puede quedar vacio")
        return cleaned

    @field_validator("propuestas")
    @classmethod
    def validar_propuestas(cls, value: list[str]) -> list[str]:
        normalizadas: list[str] = []
        vistas: set[str] = set()
        for propuesta in value:
            limpia = (propuesta or "").strip()
            if not limpia:
                continue
            clave = limpia.lower()
            if clave in vistas:
                continue
            vistas.add(clave)
            normalizadas.append(limpia)

        if len(normalizadas) < 2:
            raise ValueError("La votacion debe tener al menos dos propuestas validas")
        return normalizadas

    @field_validator("fechaCierre")
    @classmethod
    def validar_fecha_futura(cls, value: datetime) -> datetime:
        ahora = datetime.now(timezone.utc)
        fecha = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        if fecha <= ahora:
            raise ValueError("La fecha y hora de cierre debe ser futura")
        return fecha


class PropuestaRead(BaseModel):
    IdPropuesta: int
    Texto: str

    class Config:
        from_attributes = True
        populate_by_name = True


class VotacionRead(BaseModel):
    IdVotacion: int
    Titulo: str
    Tipo: str
    FechaCierre: datetime
    Estado: str = Field(..., description="'abierta' o 'cerrada' (derivado de FechaCierre)")
    YaVoto: bool = False
    Propuestas: list[PropuestaRead] = Field(default_factory=list)

    class Config:
        from_attributes = True
        populate_by_name = True


class ResultadoPropuesta(BaseModel):
    IdPropuesta: int
    Texto: str
    Votos: int
    Porcentaje: float


class VotacionResultados(BaseModel):
    IdVotacion: int
    Titulo: str
    Tipo: str
    FechaCierre: datetime
    Estado: str
    TotalVotantes: int
    TotalVotos: int
    Resultados: list[ResultadoPropuesta]
    IdPropuestasGanadoras: list[int] = Field(default_factory=list)
    Empate: bool = False
    MisPropuestas: list[int] = Field(
        default_factory=list, description="Propuestas votadas por el usuario que consulta"
    )