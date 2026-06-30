from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.usuario import UsuarioRead


class DiaCronogramaRead(BaseModel):
    idDiaCronograma: int = Field(..., alias="IdDiaCronograma")
    fecha: date = Field(..., alias="Fecha")
    indiceDia: int = Field(..., alias="IndiceDia") 

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
    destinations: list[DestinationRead] = Field(default_factory=list, alias="Destinations")
    status: str
    currency: str
    startDate: date | None = None
    endDate: date | None = None
    cronograma: list[DiaCronogramaRead] = Field(default_factory=list, alias="Cronograma")
    participantUserIds: List[int] = Field(default_factory=list, alias="ParticipantUserIds")
    participants: List[UsuarioRead] = Field(default_factory=list, alias="Participants")
    invitedEmails: List[str] = Field(default_factory=list, alias="InvitedEmails")

    class Config:
        from_attributes = True
        populate_by_name = True


class TripCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, description="El nombre del viaje no puede quedar vacío")
    destinations: list[DestinationCreate]
    description: str | None = None
    startDate: date | None = None
    endDate: date | None = None
    currency: str = Field(..., min_length=3, max_length=3, description="Tipo de moneda base obligatoria")
    adminUserId: int | None = None  # ignorado; se usa el usuario autenticado
    participantUserIds: list[int] = Field(default_factory=list, alias="ParticipantUserIds")
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