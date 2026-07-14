from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    idToken: str


class FacebookLoginRequest(BaseModel):
    accessToken: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class FacebookAuthResponse(BaseModel):
    requiereRegistro: bool
    access_token: str | None = None
    token_type: str = "bearer"

    nombre: str | None = None
    apellido: str | None = None
    email: str | None = None
    fotoUrl: str | None = None


class FacebookRegisterRequest(BaseModel):
    accessToken: str
    aceptaTerminos: bool