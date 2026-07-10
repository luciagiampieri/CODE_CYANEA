from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    idToken: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
