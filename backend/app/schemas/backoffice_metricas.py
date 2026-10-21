from datetime import date
from typing import Literal

from pydantic import BaseModel


class MetricaDashboard(BaseModel):
    valor: int | float | None = None
    anterior: int | float | None = None
    error: str | None = None


class PuntoEvolucion(BaseModel):
    fecha: date
    usuarios: int
    viajes: int
    solicitudesIA: int = 0


class SerieEvolucion(BaseModel):
    agrupacion: Literal["dia", "mes"] | None = None
    puntos: list[PuntoEvolucion] = []
    error: str | None = None


class FilaEstacional(BaseModel):
    anio: int
    meses: list[int]


class Estacionalidad(BaseModel):
    usuarios: list[FilaEstacional] = []
    viajes: list[FilaEstacional] = []
    salidas: list[FilaEstacional] = []
    error: str | None = None


class MetricasDashboard(BaseModel):
    desde: date
    hasta: date
    historico: bool = False
    desdeAnterior: date | None = None
    hastaAnterior: date | None = None
    usuariosRegistrados: MetricaDashboard
    usuariosActivos: MetricaDashboard
    viajesCreados: MetricaDashboard
    viajesActivos: MetricaDashboard
    suscripcionesProActivas: MetricaDashboard
    ingresos: MetricaDashboard
    solicitudesIA: MetricaDashboard
    evolucion: SerieEvolucion
    estacionalidad: Estacionalidad = Estacionalidad()