import hashlib
import logging
import math
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_email_confirmation_token
from app.models.solicitud_confirmacion_email import SolicitudConfirmacionEmail as Solicitud
from app.models.usuario import Usuario
from app.services.mail.service import MailService

logger = logging.getLogger(__name__)
MENSAJE_GENERICO = "Si el correo corresponde a una cuenta pendiente de confirmación, recibirás un nuevo enlace. Revisá también spam."
ESPERA_SEGUNDOS = 60
MAX_POR_HORA = 5


def enviar_confirmacion(usuario: Usuario, mail_service: MailService) -> None:
    """El fallo del proveedor nunca revierte el alta ni revela cuentas al reenviar."""
    token = create_email_confirmation_token(usuario.Email)
    url = f"{settings.api_base_url.rstrip('/')}/auth/confirm-email?token={token}"
    try:
        enviado = mail_service.send_template(
            to=[usuario.Email],
            subject="Confirmá tu cuenta en Cyanea",
            template_name="confirm_email.html",
            text_template_name="confirm_email.txt",
            context={"nombre": usuario.Nombre, "confirm_url": url},
        )
        if enviado is False:
            logger.warning("Envío de confirmación omitido", extra={"user_id": usuario.IdUsuario})
    except Exception:
        logger.warning(
            "No se pudo enviar el correo transaccional de confirmación",
            exc_info=True,
            extra={"user_id": usuario.IdUsuario},
        )


def solicitar_reenvio(
    db: Session, mail_service: MailService, email_raw: str, ip: str | None
) -> None:
    email = email_raw.strip().lower()
    if len(email) > 255 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "Ingresá un correo electrónico válido.")
    email_hash = hashlib.sha256(email.encode()).hexdigest()
    # Serializa solicitudes concurrentes entre procesos/instancias en PostgreSQL.
    if db.get_bind().dialect.name == "postgresql":
        claves = ["confirmacion:email:" + email_hash]
        if ip:
            claves.append("confirmacion:ip:" + ip)
        for clave in sorted(claves):
            llave = int.from_bytes(hashlib.sha256(clave.encode()).digest()[:8], "big", signed=True)
            db.execute(text("SELECT pg_advisory_xact_lock(:llave)"), {"llave": llave})
    ahora = datetime.now(timezone.utc)
    ultima = db.scalar(select(func.max(Solicitud.Fecha)).where(Solicitud.EmailHash == email_hash))
    if ultima is not None:
        if ultima.tzinfo is None:
            ultima = ultima.replace(tzinfo=timezone.utc)
        espera = math.ceil(ESPERA_SEGUNDOS - (ahora - ultima).total_seconds())
        if espera > 0:
            raise HTTPException(
                429,
                f"Esperá {espera} segundos antes de solicitar otro enlace.",
                headers={"Retry-After": str(espera)},
            )
    desde = ahora - timedelta(hours=1)
    for condicion in [Solicitud.EmailHash == email_hash] + ([Solicitud.Ip == ip] if ip else []):
        cantidad = db.scalar(
            select(func.count()).select_from(Solicitud).where(condicion, Solicitud.Fecha >= desde)
        )
        if cantidad >= MAX_POR_HORA:
            raise HTTPException(
                429,
                "Superaste el límite de solicitudes. Intentá nuevamente en una hora.",
                headers={"Retry-After": "3600"},
            )
    # También se registran cuentas inexistentes/no elegibles: mismos límites y respuesta.
    db.add(Solicitud(EmailHash=email_hash, Ip=ip, Fecha=ahora))
    db.commit()
    usuario = db.scalar(
        select(Usuario).where(
            func.lower(Usuario.Email) == email,
            Usuario.Activo.is_(True),
            Usuario.FechaBaja.is_(None),
            Usuario.EmailConfirmado.is_(False),
            Usuario.ProveedorAutenticacion == "local",
        )
    )
    if usuario:
        enviar_confirmacion(usuario, mail_service)
