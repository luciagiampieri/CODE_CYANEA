import asyncio
import logging
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notificacion import Notificacion
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

TIPO_SUSCRIPCION_ACTIVADA = "suscripcion_activada"
TIPO_PAGO_SUSCRIPCION_RECHAZADO = "pago_suscripcion_rechazado"

_ZONA_AR = ZoneInfo("America/Argentina/Buenos_Aires")


def _fecha(valor: datetime) -> str:
    return valor.astimezone(_ZONA_AR).strftime("%d/%m/%Y")


def _monto(valor: Decimal | None) -> str:
    if valor is None:
        return ""
    texto = f"{Decimal(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"ARS {texto}"


def _modalidad(suscripcion: SuscripcionUsuario) -> str:
    return "anual" if suscripcion.MesesPeriodo == 12 else "mensual"


async def _registrar_en_app(db: Session, usuario: Usuario, tipo: str, titulo: str, mensaje: str):
    try:
        notificacion = Notificacion(
            IdUsuario=usuario.IdUsuario, IdViaje=None, Tipo=tipo, Titulo=titulo, Mensaje=mensaje
        )
        db.add(notificacion)
        db.commit()
        db.refresh(notificacion)
    except Exception:
        logger.exception("No se pudo registrar la notificación de suscripción")
        db.rollback()
        return None
    try:
        await manager.broadcast_to_user(
            usuario.IdUsuario,
            {
                "tipo": "nueva_notificacion",
                "notificacion": {
                    "id": notificacion.IdNotificacion,
                    "viajeId": None,
                    "tipo": notificacion.Tipo,
                    "titulo": notificacion.Titulo,
                    "mensaje": notificacion.Mensaje,
                    "leida": notificacion.Leida,
                    "fechaCreacion": notificacion.FechaCreacion,
                },
            },
        )
    except Exception:
        logger.warning("No se pudo enviar la notificación en tiempo real", exc_info=True)
    return notificacion


async def _enviar_correo(mail_service, usuario: Usuario, **kwargs) -> None:
    try:
        await asyncio.to_thread(mail_service.send_template, to=[usuario.Email], **kwargs)
    except Exception:
        logger.warning(
            "No se pudo enviar el correo de suscripción",
            exc_info=True,
            extra={"user_id": usuario.IdUsuario},
        )


async def notificar_activacion(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    modalidad = _modalidad(suscripcion)
    renovacion = _fecha(suscripcion.FechaFin)
    await _registrar_en_app(
        db,
        usuario,
        TIPO_SUSCRIPCION_ACTIVADA,
        "¡Ya sos Pro!",
        f"Tu suscripción Pro {modalidad} está activa. Se renovará automáticamente el {renovacion}.",
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: tu suscripción Pro está activa",
        template_name="subscription_activated.html",
        text_template_name="subscription_activated.txt",
        context={
            "nombre": usuario.Nombre,
            "modalidad": modalidad,
            "precio": _monto(suscripcion.PrecioPeriodoARS),
            "fecha_inicio": _fecha(suscripcion.FechaInicio),
            "fecha_renovacion": renovacion,
            "app_url": settings.mail_frontend_base_url.rstrip("/"),
        },
    )


async def notificar_pago_rechazado(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    modalidad = _modalidad(suscripcion)
    await _registrar_en_app(
        db,
        usuario,
        TIPO_PAGO_SUSCRIPCION_RECHAZADO,
        "Tu pago de Pro fue rechazado",
        f"El pago de tu suscripción Pro {modalidad} fue rechazado y tu plan no cambió. "
        "Podés volver a intentarlo desde Mi plan y consumo.",
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: el pago de tu suscripción Pro fue rechazado",
        template_name="subscription_payment_rejected.html",
        text_template_name="subscription_payment_rejected.txt",
        context={
            "nombre": usuario.Nombre,
            "modalidad": modalidad,
            "precio": _monto(suscripcion.PrecioPeriodoARS),
            "app_url": settings.mail_frontend_base_url.rstrip("/"),
        },
    )
