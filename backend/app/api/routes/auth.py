import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_email_confirmation_token,
    decode_email_confirmation_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.usuario import UsuarioRegister, UsuarioRegisterResponse
from app.services.mail import get_mail_service
from app.services.mail.service import MailService

router = APIRouter()
logger = logging.getLogger(__name__)


# POST /auth/register 
@router.post(
    "/register",
    response_model=UsuarioRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    data: UsuarioRegister,
    db: Session = Depends(get_db),
    mail_service: MailService = Depends(get_mail_service),
) -> UsuarioRegisterResponse:

    # Email único
    if db.scalar(select(Usuario).where(Usuario.Email == data.email.strip().lower())):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El correo electrónico ya está registrado.",
        )

    # Nombre de usuario único
    if db.scalar(select(Usuario).where(Usuario.NombreUsuario == data.nombreUsuario.strip())):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El nombre de usuario ya está en uso.",
        )

    # Crear usuario (inactivo hasta confirmar email)
    nuevo = Usuario(
        Nombre=data.nombre.strip(),
        Apellido=data.apellido.strip(),
        NombreUsuario=data.nombreUsuario.strip(),
        Email=data.email.strip().lower(),
        HashedPassword=hash_password(data.password),
        Activo=True,
        EmailConfirmado=False,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    # Generar token y enviar mail de confirmación
    token = create_email_confirmation_token(nuevo.Email)
    confirm_url = (
        f"{settings.api_base_url.rstrip('/')}"
        F"/auth/confirm-email?token={token}"
    )

    mail_service.send_template(
        to=[nuevo.Email],
        subject="Confirmá tu cuenta en Cyanea",
        template_name="confirm_email.html",
        text_template_name="confirm_email.txt",
        context={"nombre": nuevo.Nombre, "confirm_url": confirm_url},
    )

    logger.info("Registro exitoso", extra={"user_id": nuevo.IdUsuario})
    return UsuarioRegisterResponse(
        message="Registro exitoso. Revisá tu correo para confirmar tu cuenta.",
        email=nuevo.Email,
    )


# GET /auth/confirm-email?token=...
@router.get("/confirm-email")
def confirm_email(
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> RedirectResponse:

    frontend = settings.mail_frontend_base_url.rstrip("/")

    try:
        email = decode_email_confirmation_token(token)
    except (JWTError, ValueError):
        return RedirectResponse(
            url=f"{frontend}/email-confirmado?status=error",
            status_code=302,
        )

    usuario = db.scalar(select(Usuario).where(Usuario.Email == email))
    if not usuario:
        return RedirectResponse(
            url=f"{frontend}/email-confirmado?status=error",
            status_code=302,
        )

    if usuario.EmailConfirmado:
        return RedirectResponse(
            url=f"{frontend}/email-confirmado?status=ya-confirmado",
            status_code=302,
        )

    usuario.EmailConfirmado = True
    db.commit()
    logger.info("Email confirmado", extra={"email": email})

    return RedirectResponse(
        url=f"{frontend}/email-confirmado?status=ok",
        status_code=302,
    )


# POST /auth/login 
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
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

    if not usuario.Activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta no se encuentra habilitada",
        )

    if not usuario.HashedPassword:
        raise credentials_error

    if not verify_password(payload.password, usuario.HashedPassword):
        raise credentials_error

    # Verificar que confirmó el email antes de dejar entrar
    if not usuario.EmailConfirmado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debés confirmar tu correo electrónico antes de iniciar sesión.",
        )

    token = create_access_token(
        {"sub": usuario.Email, "user_id": usuario.IdUsuario}
    )

    logger.info("Login exitoso", extra={"user_id": usuario.IdUsuario})
    return TokenResponse(access_token=token)

