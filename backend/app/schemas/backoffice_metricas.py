from datetime import date
from typing import Literal

from pydantic import BaseModel


class MetricaDashboard(BaseModel):
    valor: int | float | None = None
    error: str | None = None


class PuntoEvolucion(BaseModel):
    fecha: date
    usuarios: int
    viajes: int


class SerieEvolucion(BaseModel):
    agrupacion: Literal["dia", "mes"] | None = None
    puntos: list[PuntoEvolucion] = []
    error: str | None = None


class MetricasDashboard(BaseModel):
    desde: date
    hasta: date
    usuariosRegistrados: MetricaDashboard
    usuariosActivos: MetricaDashboard
    viajesCreados: MetricaDashboard
    viajesActivos: MetricaDashboard
    suscripcionesProActivas: MetricaDashboard
    ingresos: MetricaDashboard
    solicitudesIA: MetricaDashboard
    evolucion: SerieEvolucion