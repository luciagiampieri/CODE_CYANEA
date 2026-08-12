import re

from pydantic import BaseModel, EmailStr, field_validator


class UsuarioRead(BaseModel):
    id: int
    nombreUsuario: str
    nombreCompleto: str
    email: str
    fotoUrl: str | None = None


class UsuarioProfileRead(UsuarioRead):
    nombre: str
    apellido: str
    consienteNotificacionesEmail: bool
    recibeEmailsNuevaVotacion: bool
    recibeEmailsCambiosViaje: bool
    recibeEmailsRecordatoriosDeuda: bool
    recibeEmailsRecordatoriosReserva: bool


class UsuarioCurrentRead(UsuarioProfileRead):
    pass


class UsuarioProfileUpdate(BaseModel):
    nombre: str
    apellido: str
    nombreUsuario: str
    fotoUrl: str | None = None

    @field_validator("nombre", "apellido", "nombreUsuario")
    @classmethod
    def validar_obligatorios(cls, value: str) -> str:
        limpio = value.strip()
        if not limpio:
            raise ValueError("El campo no puede estar vacío")
        return limpio


class UsuarioPhotoUploadResponse(BaseModel):
    fotoUrl: str
    message: str


class UsuarioRegister(BaseModel):
    nombre: str
    apellido: str
    nombreUsuario: str
    email: EmailStr
    password: str
    aceptaTerminos: bool

    @field_validator("password")
    @classmethod
    def validar_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres.")
        if not re.search(r"[A-Z]", value):
            raise ValueError("La contraseña debe contener al menos una letra mayúscula.")
        if not re.search(r"[a-z]", value):
            raise ValueError("La contraseña debe contener al menos una letra minúscula.")
        if not re.search(r"\d", value):
            raise ValueError("La contraseña debe contener al menos un número.")
        if not re.search(r"[^A-Za-z0-9]", value):
            raise ValueError("La contraseña debe contener al menos un carácter especial.")
        return value

    @field_validator("aceptaTerminos")
    @classmethod
    def validar_terminos(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Se deben aceptar los Términos y Condiciones para completar el registro.")
        return value


class UsuarioRegisterResponse(BaseModel):
    message: str
    email: str
