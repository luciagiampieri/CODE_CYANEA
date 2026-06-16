from datetime import date
from pydantic import BaseModel, Field, field_validator, model_validator


class TripRead(BaseModel):
    id: int
    title: str
    destination: str
    status: str
    currency: str


class TripCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, description="El nombre del viaje no puede quedar vacío")
    destination: str = Field(..., min_length=2, max_length=150, description="Al menos un destino requerido (país o ciudad)")
    description: str | None = None
    startDate: date = Field(..., description="Fecha de inicio obligatoria")
    endDate: date = Field(..., description="Fecha de finalización obligatoria")
    currency: str = Field(default="ARS", min_length=3, max_length=3, description="Tipo de moneda bas obligatoria")
    adminUserId: int | None = None
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
        if self.startDate < date.today():
            raise ValueError("La fecha de inicio debe ser igual o posterior a la fecha actual")
            
        if self.endDate < self.startDate:
            raise ValueError("La fecha de finalización debe ser posterior o igual a la fecha de inicio")
            
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
