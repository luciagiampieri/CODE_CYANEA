from pydantic import BaseModel, Field


class ResendConfirmationRequest(BaseModel):
    email: str = Field(default="", max_length=255)
