from pydantic import BaseModel


class TerminosCondicionesRead(BaseModel):
    version: str
    titulo: str
    contenido: list[str]
