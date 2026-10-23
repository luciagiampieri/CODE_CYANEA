from pydantic import BaseModel


class TerminosCondicionesRead(BaseModel):
    version: str
    titulo: str
    contenido: list[str]


class EstadoAceptacionTerminos(BaseModel):
    versionVigente: str
    versionAceptada: str | None = None
    requiereAceptacion: bool