import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services import notificaciones_suscripciones
from app.services.pagos.mercadopago import (
    PAGO_APROBADO,
    PAGO_PENDIENTE,
    PAGO_RECHAZADO,
    CobroPasarela,
    ErrorPasarela,
    PasarelaNoConfigurada,
)
from app.services.precios_suscripciones import crear_periodo, sumar_meses

logger = logging.getLogger(__name__)

ESTADO_ACTIVA = "activa"
ESTADO_PENDIENTE_PAGO = "pendiente_pago"
ESTADO_CANCELADA = "cancelada"
ESTADO_DESCARTADA = "descartada"

# Estado del último intento tal como lo ve la app.
INTENTO_ACTIVA = "activa"
INTENTO_EN_PROCESO = "pago_en_proceso"
INTENTO_RECHAZADO = "pago_rechazado"
INTENTO_SIN_PAGO = "sin_pago"
INTENTO_DESCARTADO = "descartada"

MODALIDADES = {"mensual": 1, "anual": 12}

# Estados de la suscripción en Mercado Pago.
PASARELA_AUTORIZADA = "authorized"
PASARELA_CANCELADA = "cancelled"

TIPOS_NOTIFICACION_COBRO = {"subscription_authorized_payment", "authorized_payment"}
TIPOS_NOTIFICACION_SUSCRIPCION = {"subscription_preapproval", "preapproval"}


class SuscripcionError(Exception):
    def __init__(self, status: int, codigo: str, mensaje: str):
        super().__init__(mensaje)
        self.status = status
        self.codigo = codigo
        self.mensaje = mensaje


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(valor: datetime | None) -> datetime | None:
    if valor is not None and valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor


def _modalidad(meses: int | None) -> str | None:
    return {1: "mensual", 12: "anual"}.get(meses)


def _id_estado(db: Session, modelo, columna_id, nombre: str) -> int:
    id_estado = db.scalar(select(columna_id).where(modelo.Nombre == nombre))
    if id_estado is None:
        raise SuscripcionError(
            503,
            "SUBSCRIPTION_STATUS_UNAVAILABLE",
            "La suscripción no está disponible en este momento.",
        )
    return id_estado


def _id_estado_suscripcion(db: Session, nombre: str) -> int:
    return _id_estado(db, EstadoSuscripcion, EstadoSuscripcion.IdEstadoSuscripcion, nombre)


def _id_estado_pago(db: Session, nombre: str) -> int:
    return _id_estado(
        db, EstadoPagoSuscripcion, EstadoPagoSuscripcion.IdEstadoPagoSuscripcion, nombre
    )


def _nombre_estado(db: Session, suscripcion: SuscripcionUsuario) -> str:
    return db.scalar(
        select(EstadoSuscripcion.Nombre).where(
            EstadoSuscripcion.IdEstadoSuscripcion == suscripcion.IdEstadoSuscripcion
        )
    )


def _ultimo_pago(db: Session, suscripcion: SuscripcionUsuario) -> str | None:
    return db.scalar(
        select(EstadoPagoSuscripcion.Nombre)
        .join(
            PagoSuscripcion,
            PagoSuscripcion.IdEstadoPagoSuscripcion
            == EstadoPagoSuscripcion.IdEstadoPagoSuscripcion,
        )
        .where(PagoSuscripcion.IdSuscripcionUsuario == suscripcion.IdSuscripcionUsuario)
        .order_by(PagoSuscripcion.FechaPago.desc(), PagoSuscripcion.IdPagoSuscripcion.desc())
        .limit(1)
    )


def estado_intento(db: Session, suscripcion: SuscripcionUsuario) -> str:
    """Estado del intento para la app (activa, en proceso, rechazado, sin pago...)."""
    nombre = _nombre_estado(db, suscripcion)
    if nombre in (ESTADO_ACTIVA, ESTADO_CANCELADA):
        return INTENTO_ACTIVA
    if nombre != ESTADO_PENDIENTE_PAGO:
        return INTENTO_DESCARTADO
    ultimo = _ultimo_pago(db, suscripcion)
    if ultimo == PAGO_PENDIENTE:
        return INTENTO_EN_PROCESO
    if ultimo == PAGO_RECHAZADO:
        return INTENTO_RECHAZADO
    # Tarjeta autorizada en Mercado Pago: el primer cobro llega en menos de una hora.
    if suscripcion.EstadoPasarela == PASARELA_AUTORIZADA:
        return INTENTO_EN_PROCESO
    return INTENTO_SIN_PAGO


def _suscripcion_vigente(db: Session, usuario: Usuario, ahora: datetime) -> bool:
    if usuario.IdPlan != PLAN_GRATUITO:
        return True
    return (
        db.scalar(
            select(SuscripcionUsuario.IdSuscripcionUsuario)
            .join(
                EstadoSuscripcion,
                EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
            )
            .where(
                SuscripcionUsuario.IdUsuario == usuario.IdUsuario,
                EstadoSuscripcion.Nombre.in_([ESTADO_ACTIVA, ESTADO_CANCELADA]),
                SuscripcionUsuario.FechaFin > ahora,
            )
            .limit(1)
        )
        is not None
    )


def _intento_pendiente(db: Session, usuario: Usuario) -> SuscripcionUsuario | None:
    return db.scalar(
        select(SuscripcionUsuario)
        .join(
            EstadoSuscripcion,
            EstadoSuscripcion.IdEstadoSuscripcion == SuscripcionUsuario.IdEstadoSuscripcion,
        )
        .where(
            SuscripcionUsuario.IdUsuario == usuario.IdUsuario,
            EstadoSuscripcion.Nombre == ESTADO_PENDIENTE_PAGO,
        )
        .order_by(SuscripcionUsuario.IdSuscripcionUsuario.desc())
        .limit(1)
    )


def _ultima_suscripcion(db: Session, usuario: Usuario) -> SuscripcionUsuario | None:
    return db.scalar(
        select(SuscripcionUsuario)
        .where(SuscripcionUsuario.IdUsuario == usuario.IdUsuario)
        .order_by(SuscripcionUsuario.IdSuscripcionUsuario.desc())
        .limit(1)
    )


def url_retorno() -> str:
    return settings.mercadopago_back_url or (
        f"{settings.api_base_url.rstrip('/')}/pagos/mercadopago/retorno"
    )


# ---------------------------------------------------------------------------
# Cobros y sincronización con Mercado Pago
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _Aviso:
    tipo: str
    suscripcion: SuscripcionUsuario


def _activar(db: Session, suscripcion: SuscripcionUsuario, fecha_aprobacion: datetime) -> None:
    """El período se cuenta desde la aprobación del pago, no desde el intento."""
    suscripcion.IdEstadoSuscripcion = _id_estado_suscripcion(db, ESTADO_ACTIVA)
    suscripcion.FechaInicio = fecha_aprobacion
    suscripcion.FechaFin = sumar_meses(fecha_aprobacion, suscripcion.MesesPeriodo or 1)
    # Un cobro aprobado implica que Mercado Pago ya autorizó la suscripción.
    suscripcion.EstadoPasarela = PASARELA_AUTORIZADA
    usuario = db.get(Usuario, suscripcion.IdUsuario)
    usuario.IdPlan = PLAN_PRO


def _registrar_cobro(db: Session, cobro: CobroPasarela) -> _Aviso | None:
    """Registra un cobro de forma idempotente y aplica la transición que corresponda."""
    if not cobro.id_suscripcion:
        return None
    suscripcion = db.scalar(
        select(SuscripcionUsuario)
        .where(SuscripcionUsuario.IdSuscripcionPasarela == cobro.id_suscripcion)
        .with_for_update()
    )
    if suscripcion is None:
        logger.info("Cobro de una suscripción desconocida", extra={"cobro": cobro.id})
        return None
    if _nombre_estado(db, suscripcion) != ESTADO_PENDIENTE_PAGO:
        # Renovaciones y reintentos tardíos: fuera del alcance de la US 116.
        return None

    pago = db.scalar(select(PagoSuscripcion).where(PagoSuscripcion.IdOperacionPasarela == cobro.id))
    anterior = None
    if pago is not None:
        anterior = db.scalar(
            select(EstadoPagoSuscripcion.Nombre).where(
                EstadoPagoSuscripcion.IdEstadoPagoSuscripcion == pago.IdEstadoPagoSuscripcion
            )
        )
        if anterior == cobro.estado or anterior == PAGO_APROBADO:
            return None  # Notificación repetida: no se registra ni activa dos veces.

    estaba_en_proceso = anterior == PAGO_PENDIENTE or (
        anterior is None and suscripcion.EstadoPasarela == PASARELA_AUTORIZADA
    )
    fecha = _aware(cobro.fecha) or _ahora()
    id_estado_pago = _id_estado_pago(db, cobro.estado)
    if pago is None:
        db.add(
            PagoSuscripcion(
                IdSuscripcionUsuario=suscripcion.IdSuscripcionUsuario,
                IdEstadoPagoSuscripcion=id_estado_pago,
                FechaPago=fecha,
                MontoARS=cobro.monto or suscripcion.PrecioPeriodoARS,
                IdOperacionPasarela=cobro.id,
            )
        )
    else:
        pago.IdEstadoPagoSuscripcion = id_estado_pago
        pago.FechaPago = fecha
        if cobro.monto:
            pago.MontoARS = cobro.monto

    if cobro.estado == PAGO_APROBADO:
        _activar(db, suscripcion, fecha)
        return _Aviso(notificaciones_suscripciones.TIPO_SUSCRIPCION_ACTIVADA, suscripcion)
    if cobro.estado == PAGO_RECHAZADO and estaba_en_proceso:
        return _Aviso(notificaciones_suscripciones.TIPO_PAGO_SUSCRIPCION_RECHAZADO, suscripcion)
    return None


async def _avisar(db: Session, aviso: _Aviso | None, mail_service) -> None:
    if aviso is None:
        return
    usuario = db.get(Usuario, aviso.suscripcion.IdUsuario)
    if aviso.tipo == notificaciones_suscripciones.TIPO_SUSCRIPCION_ACTIVADA:
        await notificaciones_suscripciones.notificar_activacion(
            db, usuario, aviso.suscripcion, mail_service
        )
    else:
        await notificaciones_suscripciones.notificar_pago_rechazado(
            db, usuario, aviso.suscripcion, mail_service
        )


async def procesar_cobro(db: Session, cobro: CobroPasarela, mail_service) -> None:
    aviso = _registrar_cobro(db, cobro)
    db.commit()
    await _avisar(db, aviso, mail_service)


async def sincronizar(db: Session, suscripcion: SuscripcionUsuario, cliente, mail_service) -> None:
    """Trae de Mercado Pago el estado del intento y sus cobros."""
    if not suscripcion.IdSuscripcionPasarela:
        return
    if _nombre_estado(db, suscripcion) != ESTADO_PENDIENTE_PAGO:
        return
    remota = await cliente.obtener_suscripcion(suscripcion.IdSuscripcionPasarela)
    cobros = await cliente.listar_cobros(suscripcion.IdSuscripcionPasarela)
    # Primero los cobros, con el estado que se conocía hasta ahora: así un rechazo
    # solo se notifica si el pago ya figuraba en proceso.
    for cobro in sorted(cobros, key=lambda c: _aware(c.fecha) or _ahora()):
        await procesar_cobro(db, cobro, mail_service)
    db.refresh(suscripcion)
    if remota.estado:
        suscripcion.EstadoPasarela = remota.estado
        db.commit()
    if (
        remota.estado == PASARELA_CANCELADA
        and _nombre_estado(db, suscripcion) == ESTADO_PENDIENTE_PAGO
    ):
        # Cancelada en Mercado Pago sin pago aprobado: el intento no se concretó.
        suscripcion.IdEstadoSuscripcion = _id_estado_suscripcion(db, ESTADO_DESCARTADA)
        db.commit()


async def procesar_notificacion(db: Session, tipo: str, data_id: str, cliente, mail_service):
    """Webhook de Mercado Pago: el contenido se vuelve a consultar en su API."""
    if tipo in TIPOS_NOTIFICACION_COBRO:
        cobro = await cliente.obtener_cobro(data_id)
        await procesar_cobro(db, cobro, mail_service)
        return
    if tipo in TIPOS_NOTIFICACION_SUSCRIPCION:
        suscripcion = db.scalar(
            select(SuscripcionUsuario).where(SuscripcionUsuario.IdSuscripcionPasarela == data_id)
        )
        if suscripcion is not None:
            await sincronizar(db, suscripcion, cliente, mail_service)
        return
    logger.info("Notificación de Mercado Pago ignorada", extra={"tipo": tipo})


# ---------------------------------------------------------------------------
# Casos de uso del viajero
# ---------------------------------------------------------------------------


async def _validar_elegibilidad(
    db: Session, usuario: Usuario, cliente, mail_service, ahora: datetime
) -> SuscripcionUsuario | None:
    """Devuelve el intento anterior que se puede descartar, o None. Lanza si no puede."""
    if not usuario.EmailConfirmado:
        raise SuscripcionError(
            403,
            "EMAIL_NOT_CONFIRMED",
            "Confirmá tu correo electrónico para poder suscribirte a Pro.",
        )
    if _suscripcion_vigente(db, usuario, ahora):
        raise SuscripcionError(
            409, "SUBSCRIPTION_ALREADY_ACTIVE", "Ya tenés una suscripción Pro activa."
        )
    intento = _intento_pendiente(db, usuario)
    if intento is None:
        return None
    try:
        await sincronizar(db, intento, cliente, mail_service)
    except (PasarelaNoConfigurada, ErrorPasarela):
        logger.warning("No se pudo verificar el intento anterior", exc_info=True)
        raise SuscripcionError(
            503,
            "PAYMENT_GATEWAY_UNAVAILABLE",
            "No pudimos verificar tu intento de pago anterior. Probá de nuevo en unos minutos.",
        )
    db.refresh(usuario)
    estado = estado_intento(db, intento)
    if estado == INTENTO_ACTIVA:
        raise SuscripcionError(
            409, "SUBSCRIPTION_ALREADY_ACTIVE", "Ya tenés una suscripción Pro activa."
        )
    if estado == INTENTO_EN_PROCESO:
        raise SuscripcionError(
            409,
            "SUBSCRIPTION_PAYMENT_PENDING",
            "Tenés un pago pendiente de confirmación. La suscripción se activará "
            "al acreditarse el pago.",
        )
    return intento if estado in (INTENTO_SIN_PAGO, INTENTO_RECHAZADO) else None


def _precios(db: Session) -> dict[str, object]:
    pro = db.get(Plan, PLAN_PRO)
    activo = pro is not None and pro.Activo
    return {
        "mensual": pro.PrecioMensualARS if activo else None,
        "anual": pro.PrecioAnualARS if activo else None,
    }


async def resumen(db: Session, usuario: Usuario, cliente, mail_service) -> dict:
    ahora = _ahora()
    precios = _precios(db)
    modalidades = {
        nombre: {
            "precioARS": precios[nombre],
            "fechaProximaRenovacion": sumar_meses(ahora, meses),
        }
        for nombre, meses in MODALIDADES.items()
    }
    puede, codigo, mensaje = True, None, None
    try:
        await _validar_elegibilidad(db, usuario, cliente, mail_service, ahora)
        if any(p is None or p <= 0 for p in precios.values()):
            raise SuscripcionError(
                409, "PLAN_PRICE_UNAVAILABLE", "El precio de Pro todavía no está configurado."
            )
    except SuscripcionError as error:
        puede, codigo, mensaje = False, error.codigo, error.mensaje
    return {
        "puedeSuscribirse": puede,
        "codigo": codigo,
        "mensaje": mensaje,
        "modalidades": modalidades,
    }


async def iniciar(
    db: Session,
    usuario: Usuario,
    *,
    modalidad: str,
    acepta_renovacion: bool,
    cliente,
    mail_service,
) -> dict:
    if not acepta_renovacion:
        raise SuscripcionError(
            400,
            "AUTO_RENEWAL_NOT_ACCEPTED",
            "Tenés que aceptar la renovación automática para continuar.",
        )
    meses = MODALIDADES[modalidad]
    ahora = _ahora()
    anterior = await _validar_elegibilidad(db, usuario, cliente, mail_service, ahora)
    # La validación puede haber confirmado cambios: se bloquea al viajero recién
    # ahora y se verifica que nadie haya iniciado otro intento en el medio (por
    # ejemplo, dos toques seguidos en "Confirmar").
    db.execute(select(Usuario).where(Usuario.IdUsuario == usuario.IdUsuario).with_for_update())
    actual = _intento_pendiente(db, usuario)
    if (actual.IdSuscripcionUsuario if actual else None) != (
        anterior.IdSuscripcionUsuario if anterior else None
    ):
        db.rollback()
        raise SuscripcionError(
            409,
            "SUBSCRIPTION_PAYMENT_PENDING",
            "Ya iniciaste una suscripción. Revisá el estado de tu pago antes de volver a intentar.",
        )

    try:
        if anterior is not None:
            if anterior.IdSuscripcionPasarela:
                # Se cancela en Mercado Pago para que no cobre un intento abandonado.
                await cliente.cancelar_suscripcion(anterior.IdSuscripcionPasarela)
            anterior.IdEstadoSuscripcion = _id_estado_suscripcion(db, ESTADO_DESCARTADA)
            anterior.EstadoPasarela = PASARELA_CANCELADA

        periodo = crear_periodo(
            db,
            id_usuario=usuario.IdUsuario,
            id_estado=_id_estado_suscripcion(db, ESTADO_PENDIENTE_PAGO),
            meses=meses,
            inicio=ahora,
        )
        periodo.FechaAceptacionRenovacion = ahora
        db.flush()
        remota = await cliente.crear_suscripcion(
            motivo=f"Cyanea Pro {modalidad}",
            referencia_externa=f"cyanea-suscripcion-{periodo.IdSuscripcionUsuario}",
            email_pagador=settings.mercadopago_test_payer_email or usuario.Email,
            meses=meses,
            monto=periodo.PrecioPeriodoARS,
            url_retorno=url_retorno(),
        )
        if not remota.url_pago:
            raise ErrorPasarela("Mercado Pago no devolvió el link de pago")
    except PasarelaNoConfigurada:
        db.rollback()
        raise SuscripcionError(
            503,
            "PAYMENT_GATEWAY_UNAVAILABLE",
            "Los pagos no están disponibles en este momento. Probá más tarde.",
        )
    except ErrorPasarela:
        db.rollback()
        logger.warning("No se pudo crear la suscripción en Mercado Pago", exc_info=True)
        raise SuscripcionError(
            502,
            "PAYMENT_GATEWAY_ERROR",
            "No pudimos comunicarnos con Mercado Pago. Probá de nuevo en unos minutos.",
        )
    except Exception:
        db.rollback()
        raise

    periodo.IdSuscripcionPasarela = remota.id
    periodo.EstadoPasarela = remota.estado
    db.commit()
    db.refresh(periodo)
    return {
        "id": periodo.IdSuscripcionUsuario,
        "modalidad": modalidad,
        "precioARS": periodo.PrecioPeriodoARS,
        "fechaProximaRenovacion": periodo.FechaFin,
        "urlPago": remota.url_pago,
        "urlRetorno": settings.mercadopago_app_return_url,
    }


async def estado_ultima(db: Session, usuario: Usuario, cliente, mail_service) -> dict:
    suscripcion = _ultima_suscripcion(db, usuario)
    if suscripcion is None:
        raise SuscripcionError(
            404, "SUBSCRIPTION_NOT_FOUND", "No tenés intentos de suscripción registrados."
        )
    try:
        await sincronizar(db, suscripcion, cliente, mail_service)
    except (PasarelaNoConfigurada, ErrorPasarela):
        # Se informa el último estado conocido; el webhook lo actualizará.
        logger.warning("No se pudo sincronizar la suscripción", exc_info=True)
    db.refresh(suscripcion)
    db.refresh(usuario)
    estado = estado_intento(db, suscripcion)
    return {
        "id": suscripcion.IdSuscripcionUsuario,
        "estado": estado,
        "modalidad": _modalidad(suscripcion.MesesPeriodo),
        "precioARS": suscripcion.PrecioPeriodoARS,
        "fechaInicio": suscripcion.FechaInicio,
        "fechaFin": suscripcion.FechaFin,
        "fechaProximaRenovacion": suscripcion.FechaFin if estado == INTENTO_ACTIVA else None,
        "planActual": "pro" if usuario.IdPlan == PLAN_PRO else "gratuito",
    }
