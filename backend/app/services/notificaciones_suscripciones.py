import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notificacion import Notificacion
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.precios_suscripciones import fecha_limite_pago
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

TIPO_SUSCRIPCION_ACTIVADA = "suscripcion_activada"
TIPO_PAGO_SUSCRIPCION_RECHAZADO = "pago_suscripcion_rechazado"
TIPO_SUSCRIPCION_CANCELADA = "suscripcion_cancelada"
TIPO_SUSCRIPCION_REACTIVADA = "suscripcion_reactivada"
TIPO_SUSCRIPCION_RENOVADA = "suscripcion_renovada"
TIPO_RENOVACION_RECHAZADA = "renovacion_suscripcion_rechazada"
TIPO_SUSCRIPCION_POR_FINALIZAR = "suscripcion_por_finalizar"
TIPO_PLAN_GRATUITO = "plan_gratuito"
TIPO_VIAJE_PLAN_GRATUITO = "viaje_plan_gratuito"

AVISO_SUGERENCIAS = (
    "Las sugerencias de actividades con inteligencia artificial pasan al límite del plan "
    "gratuito a partir de mañana."
)

_ZONA_AR = ZoneInfo("America/Argentina/Buenos_Aires")


def fecha_corta(valor: datetime) -> str:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(_ZONA_AR).strftime("%d/%m/%Y")


def _monto(valor: Decimal | None) -> str:
    if valor is None:
        return ""
    texto = f"{Decimal(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"ARS {texto}"


def _modalidad(suscripcion: SuscripcionUsuario) -> str:
    return "anual" if suscripcion.MesesPeriodo == 12 else "mensual"


def _app_url() -> str:
    return settings.mail_frontend_base_url.rstrip("/")


async def _registrar_en_app(
    db: Session,
    id_usuario: int,
    tipo: str,
    titulo: str,
    mensaje: str,
    id_viaje: int | None = None,
):
    try:
        notificacion = Notificacion(
            IdUsuario=id_usuario, IdViaje=id_viaje, Tipo=tipo, Titulo=titulo, Mensaje=mensaje
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
            id_usuario,
            {
                "tipo": "nueva_notificacion",
                "notificacion": {
                    "id": notificacion.IdNotificacion,
                    "viajeId": id_viaje,
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
    renovacion = fecha_corta(suscripcion.FechaFin)
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
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
            "fecha_inicio": fecha_corta(suscripcion.FechaInicio),
            "fecha_renovacion": renovacion,
            "app_url": _app_url(),
        },
    )


async def notificar_pago_rechazado(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    modalidad = _modalidad(suscripcion)
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
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
            "app_url": _app_url(),
        },
    )


async def notificar_renovacion(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    modalidad = _modalidad(suscripcion)
    renovacion = fecha_corta(suscripcion.FechaFin)
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
        TIPO_SUSCRIPCION_RENOVADA,
        "Renovamos tu suscripción Pro",
        f"Tu suscripción Pro {modalidad} se renovó. La próxima renovación es el {renovacion}.",
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: renovamos tu suscripción Pro",
        template_name="subscription_renewed.html",
        text_template_name="subscription_renewed.txt",
        context={
            "nombre": usuario.Nombre,
            "modalidad": modalidad,
            "precio": _monto(suscripcion.PrecioPeriodoARS),
            "fecha_renovacion": renovacion,
            "app_url": _app_url(),
        },
    )


async def notificar_renovacion_rechazada(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    modalidad = _modalidad(suscripcion)
    limite = fecha_limite_pago(suscripcion)
    fecha_limite = fecha_corta(limite) if limite else None
    plazo = f"antes del {fecha_limite}" if fecha_limite else "en los próximos días"
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
        TIPO_RENOVACION_RECHAZADA,
        "No pudimos renovar tu suscripción Pro",
        f"Mercado Pago rechazó el cobro de la renovación de tu suscripción Pro {modalidad} "
        "y va a volver a intentarlo. Actualizá tu medio de pago desde Mi suscripción: si el "
        f"pago no se acredita {plazo}, la suscripción vence y tu cuenta vuelve al plan gratuito.",
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: no pudimos renovar tu suscripción Pro",
        template_name="subscription_renewal_rejected.html",
        text_template_name="subscription_renewal_rejected.txt",
        context={
            "nombre": usuario.Nombre,
            "modalidad": modalidad,
            "precio": _monto(suscripcion.PrecioPeriodoARS),
            "fecha_limite": fecha_limite,
            "app_url": _app_url(),
        },
    )


async def notificar_cancelacion(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    modalidad = _modalidad(suscripcion)
    fin = fecha_corta(suscripcion.FechaFin)
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
        TIPO_SUSCRIPCION_CANCELADA,
        "Cancelaste la renovación de Pro",
        f"Tu suscripción Pro {modalidad} no se va a renovar. Conservás los beneficios Pro "
        f"hasta el {fin} y no se realizarán nuevos cobros.",
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: cancelaste la renovación de tu suscripción Pro",
        template_name="subscription_cancelled.html",
        text_template_name="subscription_cancelled.txt",
        context={
            "nombre": usuario.Nombre,
            "modalidad": modalidad,
            "fecha_fin": fin,
            "app_url": _app_url(),
        },
    )


async def notificar_reactivacion(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario
) -> None:
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
        TIPO_SUSCRIPCION_REACTIVADA,
        "Reactivaste tu suscripción Pro",
        f"Tu suscripción Pro {_modalidad(suscripcion)} se renovará automáticamente el "
        f"{fecha_corta(suscripcion.FechaFin)}.",
    )


async def notificar_fin_proximo(
    db: Session, usuario: Usuario, suscripcion: SuscripcionUsuario, mail_service
) -> None:
    fin = fecha_corta(suscripcion.FechaFin)
    await _registrar_en_app(
        db,
        usuario.IdUsuario,
        TIPO_SUSCRIPCION_POR_FINALIZAR,
        f"Tu suscripción Pro termina el {fin}",
        f"Como cancelaste la renovación, el {fin} tu cuenta vuelve al plan gratuito. Tus "
        "viajes se conservan. Si querés seguir con Pro, reactivá la renovación desde "
        "Mi suscripción.",
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject=f"Cyanea: tu suscripción Pro termina el {fin}",
        template_name="subscription_ending_soon.html",
        text_template_name="subscription_ending_soon.txt",
        context={
            "nombre": usuario.Nombre,
            "modalidad": _modalidad(suscripcion),
            "fecha_fin": fin,
            "app_url": _app_url(),
        },
    )


async def notificar_vuelta_a_gratuito(
    db: Session, usuario: Usuario, excesos: list[str], mail_service
) -> None:
    mensaje = (
        "Tu suscripción Pro terminó y tu cuenta volvió al plan gratuito. Tus viajes, gastos, "
        "documentos, actividades y sugerencias se conservan."
    )
    if excesos:
        mensaje += " Límites del plan gratuito que quedaron excedidos: " + " ".join(excesos)
    mensaje += f" {AVISO_SUGERENCIAS}"
    await _registrar_en_app(
        db, usuario.IdUsuario, TIPO_PLAN_GRATUITO, "Volviste al plan gratuito", mensaje
    )
    await _enviar_correo(
        mail_service,
        usuario,
        subject="Cyanea: tu cuenta volvió al plan gratuito",
        template_name="subscription_ended.html",
        text_template_name="subscription_ended.txt",
        context={
            "nombre": usuario.Nombre,
            "excesos": excesos,
            "aviso_sugerencias": AVISO_SUGERENCIAS,
            "app_url": _app_url(),
        },
    )


async def notificar_viaje_a_gratuito(
    db: Session, id_usuario: int, viaje: Viaje, avisos: list[str]
) -> None:
    mensaje = (
        "Quien administra el viaje ya no tiene Pro, así que el viaje pasó a los límites del "
        "plan gratuito. Todo lo que ya cargaron se conserva."
    )
    if avisos:
        mensaje += " " + " ".join(avisos)
    mensaje += f" {AVISO_SUGERENCIAS}"
    await _registrar_en_app(
        db,
        id_usuario,
        TIPO_VIAJE_PLAN_GRATUITO,
        f"{viaje.Titulo} pasó al plan gratuito"[:150],
        mensaje,
        id_viaje=viaje.IdViaje,
    )