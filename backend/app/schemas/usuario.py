from pydantic import BaseModel


class UsuarioRead(BaseModel):
    id: int
    nombreUsuario: str
    nombreCompleto: str
    email: str
