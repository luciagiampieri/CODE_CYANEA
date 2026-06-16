from pydantic import BaseModel, EmailStr, field_validator
import re


class UsuarioRead(BaseModel):
    id: int
    nombreUsuario: str
    nombreCompleto: str
    email: str
    fotoUrl: str | None = None


class UsuarioRegister(BaseModel):
    nombre: str
    apellido: str
    nombreUsuario: str
    email: EmailStr # EmailStr valida automáticamente el formato (Criterio 2)
    password: str
    aceptaTerminos: bool

    @field_validator("password")
    @classmethod
    def validar_password(cls, v: str) -> str:
        # Criterio 4: Mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número, 1 especial
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contraseña debe contener al menos una letra mayúscula.")
        if not re.search(r"[a-z]", v):
            raise ValueError("La contraseña debe contener al menos una letra minúscula.")
        if not re.search(r"\d", v):
            raise ValueError("La contraseña debe contener al menos un número.")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("La contraseña debe contener al menos un carácter especial.")
        return v

    @field_validator("aceptaTerminos")
    @classmethod
    def validar_terminos(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Se deben aceptar los Términos y Condiciones para completar el registro.")
        return v


class UsuarioRegisterResponse(BaseModel):
    message: str
    email: str