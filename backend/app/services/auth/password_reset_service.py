import hashlib
import logging
import math
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models.recuperacion_password import (
    SolicitudRecuperacionPassword,
    TokenRecuperacionPassword,
)
from app.models.usuario import Usuario
from app.services.mail.service import MailService

logger = logging.getLogger(__name__)

MAX_SOLICITUDES_POR_HORA = 5
ESPERA_ENTRE_SOLICITUDES_SEGUNDOS = 60
TOKEN_VIGENCIA_HORAS = 24

TIPO_SOLICITUD = "solicitud"
TIPO_CAMBIO = "cambio_password"

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MENSAJE_GENERICO = "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña"
MENSAJE_ENLACE_INVALIDO = "El enlace de recuperación es inválido, venció o ya fue utilizado."
MENSAJE_ERROR_ENVIO = "No pudimos enviar el correo. Intentá nuevamente en unos minutos."

PROVEEDORES = {"google": "Google", "facebook": "Facebook"}


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalizar_y_validar_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresá tu correo electrónico.",
        )
    if not EMAIL_REGEX.match(email) or len(email) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresá un correo electrónico válido (nombre_usuario@dominio).",
        )
    return email


def _verificar_limites(db: Session, email_hash: str, ip: str | None) -> None:
    ahora = datetime.now(timezone.utc)

    ultima = db.scalar(
        select(func.max(SolicitudRecuperacionPassword.Fecha)).where(
            SolicitudRecuperacionPassword.EmailHash == email_hash,
            SolicitudRecuperacionPassword.Tipo == TIPO_SOLICITUD,
        )
    )
    if ultima is not None:
        transcurrido = (ahora - ultima).total_seconds()
        if transcurrido < ESPERA_ENTRE_SOLICITUDES_SEGUNDOS:
            faltan = math.ceil(ESPERA_ENTRE_SOLICITUDES_SEGUNDOS - transcurrido)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Esperá {faltan} segundos antes de solicitar un nuevo enlace.",
                headers={"Retry-After": str(faltan)},
            )

    desde = ahora - timedelta(hours=1)

    por_email = db.scalar(
        select(func.count())
        .select_from(SolicitudRecuperacionPassword)
        .where(
            SolicitudRecuperacionPassword.EmailHash == email_hash,
            SolicitudRecuperacionPassword.Tipo == TIPO_SOLICITUD,
            SolicitudRecuperacionPassword.Fecha >= desde,
        )
    ) or 0

    por_ip = 0
    if ip:
        por_ip = db.scalar(
            select(func.count())
            .select_from(SolicitudRecuperacionPassword)
            .where(
                SolicitudRecuperacionPassword.Ip == ip,
                SolicitudRecuperacionPassword.Tipo == TIPO_SOLICITUD,
                SolicitudRecuperacionPassword.Fecha >= desde,
            )
        ) or 0

    if por_email >= MAX_SOLICITUDES_POR_HORA or por_ip >= MAX_SOLICITUDES_POR_HORA:
        logger.warning("Límite de recuperación de contraseña superado", extra={"ip": ip})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Superaste el límite de solicitudes. Intentá nuevamente en una hora.",
            headers={"Retry-After": "3600"},
        )


def _enviar_correo(db: Session, mail_service: MailService, **kwargs) -> bool:
    try:
        return mail_service.send_template(**kwargs)
    except Exception:
        db.rollback()
        logger.exception("No se pudo enviar el correo de recuperación de contraseña")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MENSAJE_ERROR_ENVIO,
        )


def _invalidar_tokens_pendientes(
    db: Session,
    id_usuario: int,
    ahora: datetime,
    excepto_id: int | None = None,
) -> None:
    condiciones = [
        TokenRecuperacionPassword.IdUsuario == id_usuario,
        TokenRecuperacionPassword.FechaUso.is_(None),
        TokenRecuperacionPassword.FechaInvalidacion.is_(None),
    ]
    if excepto_id is not None:
        condiciones.append(TokenRecuperacionPassword.IdTokenRecuperacion != excepto_id)
    db.execute(
        update(TokenRecuperacionPassword)
        .where(*condiciones)
        .values(FechaInvalidacion=ahora)
    )


def solicitar_recuperacion(
    db: Session,
    mail_service: MailService,
    email_raw: str,
    ip: str | None,
) -> None:
    email = _normalizar_y_validar_email(email_raw)
    email_hash = _sha256(email)

    _verificar_limites(db, email_hash, ip)

    usuario = db.scalar(
        select(Usuario).where(
            func.lower(Usuario.Email) == email,
            Usuario.Activo.is_(True),
        )
    )

    db.add(
        SolicitudRecuperacionPassword(
            IdUsuario=usuario.IdUsuario if usuario else None,
            EmailHash=email_hash,
            Ip=ip,
            Tipo=TIPO_SOLICITUD,
        )
    )
    db.commit()
    logger.info(
        "Recuperación de contraseña solicitada",
        extra={"user_id": usuario.IdUsuario if usuario else None, "ip": ip},
    )

    if usuario is None:
        return

    frontend = settings.mail_frontend_base_url.rstrip("/")

    if usuario.ProveedorAutenticacion != "local":
        _enviar_correo(
            db,
            mail_service,
            to=[usuario.Email],
            subject="Cómo iniciar sesión en Cyanea",
            template_name="password_social.html",
            text_template_name="password_social.txt",
            context={
                "nombre": usuario.Nombre,
                "proveedor": PROVEEDORES.get(
                    usuario.ProveedorAutenticacion, usuario.ProveedorAutenticacion
                ),
                "login_url": frontend,
            },
        )
        return


    token_plano = secrets.token_urlsafe(32)
    ahora = datetime.now(timezone.utc)
    nuevo = TokenRecuperacionPassword(
        IdUsuario=usuario.IdUsuario,
        TokenHash=_sha256(token_plano),
        FechaExpiracion=ahora + timedelta(hours=TOKEN_VIGENCIA_HORAS),
    )
    db.add(nuevo)
    db.flush()
    _invalidar_tokens_pendientes(
        db, usuario.IdUsuario, ahora, excepto_id=nuevo.IdTokenRecuperacion
    )

    reset_url = f"{frontend}/restablecer-contrasena?token={token_plano}"

    enviado = _enviar_correo(
        db,
        mail_service,
        to=[usuario.Email],
        subject="Restablecé tu contraseña de Cyanea",
        template_name="password_reset.html",
        text_template_name="password_reset.txt",
        context={
            "nombre": usuario.Nombre,
            "reset_url": reset_url,
            "vigencia_horas": TOKEN_VIGENCIA_HORAS,
        },
    )
    db.commit()

    if not enviado:
        logger.warning("MAIL_ENABLED=false: no se envió el correo de recuperación")
        if settings.app_env == "development":
            logger.info("URL de recuperación (solo desarrollo): %s", reset_url)


def _obtener_token_valido(
    db: Session, token_plano: str
) -> tuple[TokenRecuperacionPassword, Usuario]:
    error = HTTPException(status_code=status.HTTP_410_GONE, detail=MENSAJE_ENLACE_INVALIDO)

    token_plano = (token_plano or "").strip()
    if not token_plano:
        raise error

    token = db.scalar(
        select(TokenRecuperacionPassword).where(
            TokenRecuperacionPassword.TokenHash == _sha256(token_plano)
        )
    )
    ahora = datetime.now(timezone.utc)
    if (
        token is None
        or token.FechaUso is not None
        or token.FechaInvalidacion is not None
        or token.FechaExpiracion <= ahora
    ):
        raise error

    usuario = db.get(Usuario, token.IdUsuario)
    if usuario is None or not usuario.Activo or usuario.ProveedorAutenticacion != "local":
        raise error

    return token, usuario


def validar_token(db: Session, token_plano: str) -> None:
    _obtener_token_valido(db, token_plano)


def validar_reglas_password(password: str) -> list[str]:
    faltantes: list[str] = []
    if len(password) < 8:
        faltantes.append("al menos 8 caracteres")
    if not re.search(r"[A-Z]", password):
        faltantes.append("una letra mayúscula")
    if not re.search(r"[a-z]", password):
        faltantes.append("una letra minúscula")
    if not re.search(r"\d", password):
        faltantes.append("un número")
    if not re.search(r"[^A-Za-z0-9]", password):
        faltantes.append("un carácter especial")
    return faltantes


def restablecer_password(
    db: Session,
    mail_service: MailService,
    token_plano: str,
    password: str,
    confirmacion: str,
) -> None:
    token, usuario = _obtener_token_valido(db, token_plano)

    if not password or not confirmacion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresá y confirmá la nueva contraseña.",
        )
    if password != confirmacion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Las contraseñas no coinciden.",
        )

    faltantes = validar_reglas_password(password)
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener: " + ", ".join(faltantes) + ".",
        )

    if usuario.HashedPassword and verify_password(password, usuario.HashedPassword):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser distinta de la contraseña actual.",
        )

    ahora = datetime.now(timezone.utc)

    usuario.HashedPassword = hash_password(password)

    token.FechaUso = ahora
    _invalidar_tokens_pendientes(db, usuario.IdUsuario, ahora)

    db.add(
        SolicitudRecuperacionPassword(
            IdUsuario=usuario.IdUsuario,
            EmailHash=_sha256(usuario.Email.strip().lower()),
            Ip=None,
            Tipo=TIPO_CAMBIO,
        )
    )
    db.commit()
    logger.info("Contraseña restablecida", extra={"user_id": usuario.IdUsuario})

    try:
        mail_service.send_template(
            to=[usuario.Email],
            subject="Tu contraseña de Cyanea fue restablecida",
            template_name="password_changed.html",
            text_template_name="password_changed.txt",
            context={
                "nombre": usuario.Nombre,
                "fecha": ahora.strftime("%d/%m/%Y %H:%M") + " UTC",
                "login_url": settings.mail_frontend_base_url.rstrip("/"),
            },
        )
    except Exception:
        logger.exception("No se pudo enviar el correo de confirmación de cambio de contraseña")