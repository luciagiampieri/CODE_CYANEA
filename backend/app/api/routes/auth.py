import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm
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
from app.schemas.auth import GoogleLoginRequest, LoginRequest, TokenResponse, FacebookLoginRequest, FacebookRegisterRequest, FacebookAuthResponse, GoogleAuthResponse, GoogleRegisterRequest
from app.schemas.password_reset import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    ResetTokenRequest,
    TokenValidationResponse,
)
from app.services.auth import password_reset_service
from app.services.invitaciones_externas import vincular_invitaciones_externas_seguro
from app.schemas.usuario import UsuarioRegister, UsuarioRegisterResponse
from app.services.auth.google_auth_service import GoogleAuthService
from app.services.auth.facebook_auth_service import FacebookAuthService
from app.services.mail import get_mail_service
from app.services.mail.service import MailService

router = APIRouter()
logger = logging.getLogger(__name__)
google_auth_service = GoogleAuthService()
facebook_auth_service = FacebookAuthService()


def _registrar_aceptacion_terminos(usuario: Usuario) -> None:
    usuario.AceptaTerminos = True
    usuario.FechaAceptacionTerminos = datetime.now(timezone.utc)
    usuario.VersionTerminosAceptada = settings.terms_version


def _send_template_no_bloqueante(
    mail_service: MailService,
    *,
    user_id: int,
    **kwargs,
) -> None:
    try:
        mail_service.send_template(**kwargs)
    except Exception:
        logger.warning(
            "No se pudo enviar el correo transaccional",
            exc_info=True,
            extra={"user_id": user_id},
        )


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

    if db.scalar(select(Usuario).where(Usuario.Email == data.email.strip().lower())):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El correo electrónico ya está registrado.",
        )

    if db.scalar(select(Usuario).where(Usuario.NombreUsuario == data.nombreUsuario.strip())):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El nombre de usuario ya está en uso.",
        )

    nuevo = Usuario(
        Nombre=data.nombre.strip(),
        Apellido=data.apellido.strip(),
        NombreUsuario=data.nombreUsuario.strip(),
        Email=data.email.strip().lower(),
        HashedPassword=hash_password(data.password),
        Activo=True,
        EmailConfirmado=False,
    )
    _registrar_aceptacion_terminos(nuevo)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    # Si lo habían invitado por mail a algún viaje, la invitación pasa a su cuenta.
    vincular_invitaciones_externas_seguro(db, nuevo)

    token = create_email_confirmation_token(nuevo.Email)
    confirm_url = (
        f"{settings.api_base_url.rstrip('/')}"
        F"/auth/confirm-email?token={token}"
    )

    _send_template_no_bloqueante(
        mail_service,
        user_id=nuevo.IdUsuario,
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

    if not usuario.EmailConfirmado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debés confirmar tu correo electrónico antes de iniciar sesión.",
        )

    vincular_invitaciones_externas_seguro(db, usuario)

    token = create_access_token(
        {"sub": usuario.Email, "user_id": usuario.IdUsuario}
    )

    logger.info("Login exitoso", extra={"user_id": usuario.IdUsuario})
    return TokenResponse(access_token=token)


@router.post("/google", response_model=GoogleAuthResponse)
def login_with_google(
    payload: GoogleLoginRequest,
    db: Session = Depends(get_db),
) -> GoogleAuthResponse:
    identity = google_auth_service.verify_id_token(payload.idToken)

    usuario = google_auth_service.find_existing_user(db, identity)

    if usuario:
        if not usuario.Activo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="La cuenta no se encuentra habilitada",
            )

        vincular_invitaciones_externas_seguro(db, usuario)
        token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
        logger.info("Login con Google exitoso", extra={"user_id": usuario.IdUsuario})
        return GoogleAuthResponse(requiereRegistro=False, access_token=token)

    logger.info("Cuenta de Google sin usuario asociado", extra={"google_sub": identity.sub})
    return GoogleAuthResponse(
        requiereRegistro=True,
        nombre=identity.given_name,
        apellido=identity.family_name,
        email=identity.email,
        fotoUrl=identity.picture,
    )


@router.post("/register/google", response_model=TokenResponse)
def register_with_google(
    payload: GoogleRegisterRequest,
    db: Session = Depends(get_db),
    mail_service: MailService = Depends(get_mail_service),
) -> TokenResponse:
    if not payload.aceptaTerminos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debés aceptar los términos y condiciones para registrarte.",
        )

    identity = google_auth_service.verify_id_token(payload.idToken)
    usuario = google_auth_service.create_user_from_google(db, identity)
    _registrar_aceptacion_terminos(usuario)
    db.commit()
    db.refresh(usuario)
    vincular_invitaciones_externas_seguro(db, usuario)

    _send_template_no_bloqueante(
        mail_service,
        user_id=usuario.IdUsuario,
        to=[usuario.Email],
        subject="Bienvenido a Cyanea",
        template_name="welcome.html",
        text_template_name="welcome.txt",
        context={"nombre": usuario.Nombre},
    )

    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    logger.info("Registro con Google exitoso", extra={"user_id": usuario.IdUsuario})
    return TokenResponse(access_token=token)


@router.post("/facebook", response_model=FacebookAuthResponse)
def login_with_facebook(payload: FacebookLoginRequest, db: Session = Depends(get_db),) -> FacebookAuthResponse:

    identity = facebook_auth_service.verify_access_token(
        payload.accessToken
    )

    usuario = facebook_auth_service.find_existing_user(
        db,
        identity
    )

    if usuario:

        if not usuario.Activo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="La cuenta no se encuentra habilitada",
            )

        vincular_invitaciones_externas_seguro(db, usuario)

        token = create_access_token(
            {
                "sub": usuario.Email,
                "user_id": usuario.IdUsuario
            }
        )

        logger.info(
            "Login con Facebook exitoso",
            extra={"user_id": usuario.IdUsuario}
        )

        return FacebookAuthResponse(
            requiereRegistro=False,
            access_token=token,
        )

    logger.info(
        "Usuario nuevo detectado con Facebook",
        extra={"facebook_id": identity.id}
    )

    return FacebookAuthResponse(
        requiereRegistro=True,
        nombre=identity.first_name,
        apellido=identity.last_name,
        email=identity.email,
        fotoUrl=identity.picture
    )


@router.post("/register/facebook", response_model=TokenResponse)
def register_with_facebook(
    payload: FacebookRegisterRequest,
    db: Session = Depends(get_db),
    mail_service: MailService = Depends(get_mail_service),
) -> TokenResponse:

    if not payload.aceptaTerminos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debés aceptar los términos y condiciones para registrarte.",
        )

    identity = facebook_auth_service.verify_access_token(
        payload.accessToken
    )

    usuario = facebook_auth_service.create_user_from_facebook(
        db,
        identity
    )
    _registrar_aceptacion_terminos(usuario)
    db.commit()
    db.refresh(usuario)
    vincular_invitaciones_externas_seguro(db, usuario)

    _send_template_no_bloqueante(
        mail_service,
        user_id=usuario.IdUsuario,
        to=[usuario.Email],
        subject="Bienvenido a Cyanea",
        template_name="welcome.html",
        text_template_name="welcome.txt",
        context={
            "nombre": usuario.Nombre
        },
    )

    token = create_access_token(
        {
            "sub": usuario.Email,
            "user_id": usuario.IdUsuario
        }
    )

    logger.info(
        "Registro con Facebook exitoso",
        extra={"user_id": usuario.IdUsuario}
    )

    return TokenResponse(
        access_token=token
    )


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    mail_service: MailService = Depends(get_mail_service),
) -> MessageResponse:
    ip = request.client.host if request.client else None
    password_reset_service.solicitar_recuperacion(db, mail_service, payload.email, ip)
    return MessageResponse(message=password_reset_service.MENSAJE_GENERICO)


@router.post("/reset-password/validate", response_model=TokenValidationResponse)
def validate_reset_token(
    payload: ResetTokenRequest,
    db: Session = Depends(get_db),
) -> TokenValidationResponse:
    password_reset_service.validar_token(db, payload.token)
    return TokenValidationResponse(valid=True)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    mail_service: MailService = Depends(get_mail_service),
) -> MessageResponse:
    password_reset_service.restablecer_password(
        db,
        mail_service,
        payload.token,
        payload.password,
        payload.confirmPassword,
    )
    return MessageResponse(message="Tu contraseña se restableció correctamente.")