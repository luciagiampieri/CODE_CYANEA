from pydantic import BaseModel


class ForgotPasswordRequest(BaseModel):
    email: str = ""


class ResetTokenRequest(BaseModel):
    token: str = ""


class ResetPasswordRequest(BaseModel):
    token: str = ""
    password: str = ""
    confirmPassword: str = ""


class MessageResponse(BaseModel):
    message: str


class TokenValidationResponse(BaseModel):
    valid: bool