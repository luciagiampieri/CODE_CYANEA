from datetime import date

from pydantic import BaseModel, Field, model_validator


class TripRead(BaseModel):
    id: int
    title: str
    destination: str
    status: str
    currency: str


class TripCreate(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    destination: str = Field(min_length=2, max_length=150)
    description: str | None = None
    startDate: date | None = None
    endDate: date | None = None
    currency: str = Field(default="ARS", min_length=3, max_length=3)
    adminUserId: int | None = None
    participantUserIds: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.startDate and self.endDate and self.endDate < self.startDate:
            raise ValueError("La fecha de fin no puede ser anterior a la fecha de inicio")
        return self
