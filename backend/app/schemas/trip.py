from datetime import date, datetime, time as time_type

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.usuario import UsuarioRead


class ActividadRead(BaseModel):
    idActividad: int = Field(..., alias="IdActividad")
    nombre: str = Field(..., alias="Nombre")
    descripcion: str | None = Field(None, alias="Descripcion")
    horaInicio: time_type = Field(..., alias="HoraInicio")
    horaFin: time_type = Field(..., alias="HoraFin")

    class Config:
        from_attributes = True
        populate_by_name = True


class ActividadCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    descripcion: str | None = None
    horaInicio: time_type
    horaFin: time_type

    @model_validator(mode="after")
    def validate_horarios(self):
        if self.horaFin <= self.horaInicio:
            raise ValueError("La hora de fin debe ser posterior a la hora de inicio")
        return self


class DiaCronogramaRead(BaseModel):
    idDiaCronograma: int = Field(..., alias="IdDiaCronograma")
    fecha: date = Field(..., alias="Fecha")
    indiceDia: int = Field(..., alias="IndiceDia")
    actividades: list[ActividadRead] = Field(default_factory=list, alias="Actividades")

    class Config:
        from_attributes = True
        populate_by_name = True

class DestinationCreate(BaseModel):
    name: str
    country: str
    lat: float | None = None
    lng: float | None = None


class DestinationRead(BaseModel):
    id: int
    name: str
    country: str
    lat: float | None = None
    lng: float | None = None

    class Config:
        from_attributes = True


class TripRead(BaseModel):
    id: int
    title: str
    destinations: list[DestinationRead] = Field(default_factory=list)
    status: str
    currency: str
    startDate: date | None = None
    endDate: date | None = None
    cronograma: list[DiaCronogramaRead] = Field(default_factory=list, alias="Cronograma")
    participantUserIds: list[int] = Field(default_factory=list)
    participants: list[UsuarioRead] = Field(default_factory=list)
    invitedEmails: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True
        populate_by_name = True


class TripParticipantRead(BaseModel):
    id: int
    nombreCompleto: str
    nombreUsuario: str
    email: str
    fotoUrl: str | None = None
    role: str
    status: str


class TripExternalInvitationRead(BaseModel):
    email: str
    status: str
    invitedAt: datetime | None = None
    registeredUserId: int | None = None


class TripAdminRead(BaseModel):
    id: int
    nombreCompleto: str
    nombreUsuario: str
    email: str
    fotoUrl: str | None = None


class TripDetailRead(TripRead):
    description: str | None = None
    admin: TripAdminRead
    participants: list[TripParticipantRead] = Field(default_factory=list)
    participantUserIds: list[int] = Field(default_factory=list)
    externalInvitations: list[TripExternalInvitationRead] = Field(default_factory=list)
    invitedEmails: list[str] = Field(default_factory=list)


class TripParticipantUpsert(BaseModel):
    userId: int | None = None
    email: str | None = None

    @model_validator(mode="after")
    def validate_target(self):
        if self.userId is None and not self.email:
            raise ValueError("Debes enviar userId o email")
        return self

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        if not cleaned:
            return None
        if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("El email no tiene un formato valido")
        return cleaned


class TripMutationResponse(BaseModel):
    message: str


class TripCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, description="El nombre del viaje no puede quedar vacío")
    destinations: list[DestinationCreate]
    description: str | None = None
    startDate: date | None = None
    endDate: date | None = None
    currency: str = Field(default="ARS", min_length=3, max_length=3, description="Tipo de moneda base obligatoria")
    adminUserId: int | None = None
    participantUserIds: list[int] = Field(default_factory=list)
    invitedEmails: list[str] = Field(default_factory=list)

    @field_validator("destinations")
    @classmethod
    def validate_destinations(cls, value):
        if not value:
            raise ValueError("Al menos un destino es requerido")
        return value

    @field_validator("invitedEmails")
    @classmethod
    def normalize_invited_emails(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for email in value:
            cleaned = email.strip().lower()
            if not cleaned:
                continue
            if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
                raise ValueError(f"El email '{email}' no tiene un formato valido")
            if cleaned not in normalized:
                normalized.append(cleaned)
        return normalized

    @model_validator(mode="after")
    def validate_dates(self):
        if self.startDate and self.endDate and self.endDate < self.startDate:
            raise ValueError("La fecha de fin no puede ser anterior a la fecha de inicio")
        return self


class TripUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, description="El nombre del viaje no puede quedar vacío")
    description: str | None = None
    startDate: date
    endDate: date
    destinations: list[DestinationCreate]

    @field_validator("destinations")
    @classmethod
    def validate_destinations(cls, value):
        if not value:
            raise ValueError("El viaje debe mantener al menos un destino asignado")
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.endDate < self.startDate:
            raise ValueError("La fecha de finalización debe ser posterior o igual a la fecha de inicio")
        return self


class TripUpdateResponse(BaseModel):
    message: str
    trip: TripDetailRead


class InvitationResponse(BaseModel):
    decision: str = Field(..., description="La decisión del usuario: 'aceptar' o 'rechazar'")

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: str) -> str:
        cleaned_value = value.strip().lower()
        if cleaned_value not in ["aceptar", "rechazar"]:
            raise ValueError("La decisión enviada no es válida. Debe ser 'aceptar' o 'rechazar'.")
        return cleaned_value


class TripInvitationRead(BaseModel):
    tripId: int = Field(..., description="ID del viaje invitado")
    title: str = Field(..., description="Título del viaje")
    destination: list[DestinationRead] = Field(default_factory=list, description="Lista de destinos del viaje")
    status: str = Field(..., description="Estado actual de la participación (ej: 'invitado')")
    role: str = Field(..., description="Rol asignado en el viaje")

    class Config:
        from_attributes = True