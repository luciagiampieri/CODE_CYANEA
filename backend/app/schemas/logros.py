from pydantic import BaseModel


class LogroRead(BaseModel):
    id: str
    titulo: str
    descripcion: str
    icono: str
    valor: int
    meta: int
    nivel: int
    niveles: int
    obtenido: bool
    completo: bool
    progreso: int
    progresoTexto: str


class MetricasLogrosRead(BaseModel):
    viajes: int
    paises: int
    viajesOrganizados: int
    maxAmigosEnViaje: int


class LogrosRead(BaseModel):
    metricas: MetricasLogrosRead
    logros: list[LogroRead]