from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class TripRead(BaseModel):
    id: int
    title: str
    destination: str
    status: str
    currency: str
    startDate: date | None = None
    endDate: date | None = None


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
    destination: str = Field(..., min_length=2, max_length=150, description="Al menos un destino requerido (país o ciudad)")
    description: str | None = None
    startDate: date | None = None
    endDate: date | None = None
    currency: str = Field(default="ARS", min_length=3, max_length=3, description="Tipo de moneda base obligatoria")
    adminUserId: int | None = None  # ignorado; se usa el usuario autenticado
    participantUserIds: list[int] = Field(default_factory=list)
    invitedEmails: list[str] = Field(default_factory=list)

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
    destination: str = Field(..., description="Destino del viaje")
    status: str = Field(..., description="Estado actual de la participación (ej: 'invitado')")
    role: str = Field(..., description="Rol asignado en el viaje")

    class Config:
        from_attributes = True
