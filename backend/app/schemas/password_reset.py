from pydantic import BaseModel, field_validator

from app.core.security import validar_largo_password


class ForgotPasswordRequest(BaseModel):
    email: str = ""


class ResetTokenRequest(BaseModel):
    token: str = ""


class ResetPasswordRequest(BaseModel):
    token: str = ""
    password: str = ""
    confirmPassword: str = ""

    @field_validator("password")
    @classmethod
    def validar_largo(cls, value: str) -> str:
        return validar_largo_password(value)


class MessageResponse(BaseModel):
    message: str


class TokenValidationResponse(BaseModel):
    valid: bool