from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


class TripRead(BaseModel):
    id: int
    title: str
    destination: str
    status: str
    currency: str
    startDate: date | None = None
    endDate: date | None = None


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