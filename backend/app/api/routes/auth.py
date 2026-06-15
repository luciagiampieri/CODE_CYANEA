import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    # Error genérico: no revelar si el email existe o no (criterio 6 de la US)
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Correo electrónico o contraseña incorrectos",
        headers={"WWW-Authenticate": "Bearer"},
    )

    usuario = db.scalar(
        select(Usuario).where(Usuario.Email == payload.email.strip().lower())
    )

    if usuario is None:
        raise credentials_error

    # Cuenta deshabilitada (criterio 7 de la US)
    if not usuario.Activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no se encuentra habilitada",
        )

    # Sin contraseña configurada (usuario seed sin HashedPassword)
    if not usuario.HashedPassword:
        raise credentials_error

    if not verify_password(payload.password, usuario.HashedPassword):
        raise credentials_error

    token = create_access_token(
        {"sub": usuario.Email, "user_id": usuario.IdUsuario}
    )

    logger.info("Login exitoso", extra={"user_id": usuario.IdUsuario})
    return TokenResponse(access_token=token)