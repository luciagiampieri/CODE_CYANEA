import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator


class UsuarioRead(BaseModel):
    id: int
    nombreUsuario: str
    nombreCompleto: str
    # None cuando el usuario lo configuró como privado (US 61) o en contextos
    # donde nunca se expone, como la búsqueda de usuarios.
    email: str | None = None
    fotoUrl: str | None = None


class UsuarioProfileRead(UsuarioRead):
    nombre: str
    apellido: str
    proveedorAutenticacion: str 
    consienteNotificacionesEmail: bool
    consienteNotificacionesPush: bool
    consienteProcesamientoIA: bool = False
    consienteAsistenteIA: bool = False
    fechaConsentimientoNotificacionesEmail: datetime | None = None
    fechaConsentimientoNotificacionesPush: datetime | None = None
    fechaConsentimientoAsistenteIA: datetime | None = None
    recibeEmailsNuevasActividades: bool = True
    recibeEmailsNuevaVotacion: bool
    recibeEmailsCambiosViaje: bool
    recibeEmailsNuevosGastos: bool
    recibeEmailsRecordatoriosDeuda: bool
    recibeEmailsRecordatoriosActividad: bool
    recibeEmailsRecordatoriosReserva: bool
    recibePushNuevasActividades: bool = True
    recibePushNuevaVotacion: bool
    recibePushCambiosViaje: bool
    recibePushNuevosGastos: bool
    recibePushRecordatoriosDeuda: bool
    recibePushRecordatoriosActividad: bool
    recibePushRecordatoriosReserva: bool
    aceptaTerminos: bool = False
    fechaAceptacionTerminos: datetime | None = None
    versionTerminosAceptada: str | None = None


class UsuarioCurrentRead(UsuarioProfileRead):
    pass


class UsuarioProfileUpdate(BaseModel):
    nombre: str
    apellido: str
    nombreUsuario: str
    fotoUrl: str | None = None
    consienteNotificacionesEmail: bool | None = None
    consienteNotificacionesPush: bool | None = None
    recibeEmailsNuevasActividades: bool | None = None
    recibeEmailsNuevaVotacion: bool | None = None
    recibeEmailsCambiosViaje: bool | None = None
    recibeEmailsNuevosGastos: bool | None = None
    recibeEmailsRecordatoriosDeuda: bool | None = None
    recibeEmailsRecordatoriosActividad: bool | None = None
    recibeEmailsRecordatoriosReserva: bool | None = None
    recibePushNuevasActividades: bool | None = None
    recibePushNuevaVotacion: bool | None = None
    recibePushCambiosViaje: bool | None = None
    recibePushNuevosGastos: bool | None = None
    recibePushRecordatoriosDeuda: bool | None = None
    recibePushRecordatoriosActividad: bool | None = None
    recibePushRecordatoriosReserva: bool | None = None

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


class UsuarioDeleteRequest(BaseModel):
    password: str | None = None


class UsuarioPushTokenUpsert(BaseModel):
    token: str
    plataforma: str
    dispositivoId: str | None = None

    @field_validator("token", "plataforma")
    @classmethod
    def validar_texto_obligatorio(cls, value: str) -> str:
        limpio = value.strip()
        if not limpio:
            raise ValueError("El campo no puede estar vacío")
        return limpio


class UsuarioPushTokenResponse(BaseModel):
    id: int
    token: str
    plataforma: str
    activo: bool


class ConsentimientoIAUpdate(BaseModel):
    """Otorga o revoca el consentimiento de procesamiento con IA (US 93)."""

    consiente: bool


class ConsentimientoIARead(BaseModel):
    consienteProcesamientoIA: bool
    fechaConsentimientoIA: datetime | None = None


class ConsentimientoAsistenteIAUpdate(BaseModel):
    consiente: bool


class ConsentimientoAsistenteIARead(BaseModel):
    consienteAsistenteIA: bool
    fechaConsentimientoAsistenteIA: datetime | None = None


Visibilidad = Literal["participantes", "privado"]


class PrivacidadRead(BaseModel):
    """Preferencias de privacidad del perfil (US 61)."""

    visibilidadNombre: Visibilidad
    visibilidadEmail: Visibilidad
    visibilidadFotoPerfil: Visibilidad
    permiteBusquedaPorUsuario: bool


class PrivacidadUpdate(PrivacidadRead):
    pass


class PrivacidadUpdateResponse(PrivacidadRead):
    message: str
