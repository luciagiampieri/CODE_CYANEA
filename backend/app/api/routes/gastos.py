import asyncio
import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.api.routes.itinerary import _autenticar_ws
from app.db.session import get_db, SessionLocal

from app.models import (
    CategoriasGastos,
    DocumentoViaje,
    EstadoParticipacion,
    EstadoTransferenciaLiquidacion,
    Gasto,
    LiquidacionViaje,
    ParticipanteViaje,
    ParticipantesGastos,
    TransferenciaLiquidacion,
    Usuario,
)

from app.schemas.gasto import (
    GastoCreate,
    CategoriasGastosRead,
    ParticipantesGastosRead,
    GastoRead,
    GastoListItemRead,
    EscaneoComprobanteRead,
    GastoUpdate,
    GastoDetalleRead,
    GastoPosibleDuplicadoRead,
    ParticipanteDivisionRead,
)
from app.models.gasto import TipoDivisionEnum
from app.models.viaje import Viaje
from app.services.liquidacion_service import (
    rebuild_settlement_plan,
    transferencias_pendientes_por_participante,
)
from app.services.visibilidad_gastos import (
    condicion_gasto_visible,
    exigir_gasto_visible,
    gasto_visible_para,
    participa_en_el_gasto,
)
from app.services.duplicados_gastos import buscar_posibles_duplicados
from app.services.notificaciones_gastos import (
    notificar_alta_gasto,
    notificar_liquidacion_actualizada,
)
from app.services.notifications import NotificationType, TripNotificationEvent, dispatch_user_notification
from app.services.trip_access import (
    TRIP_FINISHED_CODE,
    get_trip_with_relations,
    is_trip_finished,
    require_trip_access,
    require_trip_edit_access,
    require_trip_not_finished,
)
from app.services.currency import obtener_tipo_cambio
from app.core.config import settings
from app.models.moneda import Moneda
from app.services.receipt_ai import (
    MAX_RECEIPT_BYTES,
    ReceiptExtractor,
    ReceiptScanError,
    construir_resultado,
    get_receipt_extractor,
    validar_esquema,
    validar_documento,
)
from app.services.receipt_ai.base import (
    AI_CONSENT_REQUIRED,
    AI_TIMEOUT,
    AI_UNAVAILABLE,
    MENSAJE_NO_DISPONIBLE,
    MENSAJE_TIEMPO_AGOTADO,
)
from app.services.comprobante_gasto import guardar_comprobante
from app.services.supabase.storage import eliminar_documento, eliminar_documento_storage, obtener_url_publica
from app.services.websocket_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)


def _actor_display_name(usuario: Usuario) -> str:
    return f"{usuario.Nombre} {usuario.Apellido}".strip() or usuario.NombreUsuario


def _validar_participantes_activos(
    db: Session,
    viaje_id: int,
    participantes_ids: list[int],
) -> None:

    if not participantes_ids:
        return

    participantes_validos = (
        db.query(ParticipanteViaje.IdParticipanteViaje)
        .join(
            Usuario,
            Usuario.IdUsuario == ParticipanteViaje.IdUsuario,
        )
        .join(
            EstadoParticipacion,
            EstadoParticipacion.IdEstadoParticipacion
            == ParticipanteViaje.IdEstadoParticipacion,
        )
        .filter(
            ParticipanteViaje.IdViaje == viaje_id,
            ParticipanteViaje.IdParticipanteViaje.in_(participantes_ids),
            Usuario.Activo.is_(True),
            EstadoParticipacion.Nombre == "aceptado",
        )
        .all()
    )

    ids_validos = {id_part for (id_part,) in participantes_validos}

    ids_invalidos = set(participantes_ids) - ids_validos

    if ids_invalidos:
        raise HTTPException(
            status_code=400,
            detail="Uno o más participantes no están activos o no pertenecen al viaje.",
        )


MONEDA_PESOS_ARGENTINOS = "ARS"
CONVERSION_REQUIRED_CODE = "CONVERSION_REQUIRED"
EXPENSE_DELETE_LOCKED_CODE = "EXPENSE_DELETE_LOCKED_BY_PAID_SETTLEMENT"
TIPO_CAMBIO_PRECISION = Decimal("0.000001")


def _cotizacion(origen: str, destino: str, fecha: date) -> Decimal:
    try:
        # Se pasa la fecha del gasto para contemplar registros offline o históricos
        return Decimal(str(obtener_tipo_cambio(origen, destino, fecha=fecha)))
    except Exception:
        # Si el servicio no está disponible, lanzamos 503 (US-85)
        raise HTTPException(
            status_code=503,
            detail="Servicio de cotización no disponible. No se pudo realizar la conversión de moneda.",
        )


def _resolver_conversion(
    data: GastoCreate,
    moneda_gasto: str,
    moneda_base: str,
    fecha_gasto: date,
) -> tuple[Decimal, Decimal]:
    """Devuelve (monto en la moneda base del viaje, tipo de cambio aplicado).

    - Carga manual (US-85): si la moneda difiere de la del viaje, se convierte
      con el servicio de cotización.
    - Gasto confirmado desde un comprobante (US 94): si la moneda no es ARS, el
      usuario informa el monto convertido a pesos argentinos (RN-39) y se usa
      ese valor en lugar de la cotización automática.
    """
    en_otra_moneda = moneda_gasto != MONEDA_PESOS_ARGENTINOS

    if data.MontoConvertidoARS is not None and en_otra_moneda:
        if data.MontoConvertidoARS <= 0:
            raise HTTPException(
                status_code=400,
                detail="El monto convertido a pesos argentinos debe ser mayor a cero.",
            )
        monto_ars = data.MontoConvertidoARS
        if moneda_base == MONEDA_PESOS_ARGENTINOS:
            monto_convertido = monto_ars
        else:
            # Viaje con otra moneda base: se lleva el monto en ARS a esa moneda.
            monto_convertido = monto_ars * _cotizacion(MONEDA_PESOS_ARGENTINOS, moneda_base, fecha_gasto)
        tipo_cambio = (monto_convertido / data.MontoOriginal).quantize(TIPO_CAMBIO_PRECISION)
        return monto_convertido, tipo_cambio

    if data.DesdeComprobante and en_otra_moneda:
        # RN-39: no se confirma un gasto escaneado sin la conversión a ARS.
        raise HTTPException(
            status_code=400,
            detail=(
                f"El comprobante está en {moneda_gasto}. Ingresá el monto convertido "
                "a pesos argentinos (ARS) para registrar el gasto."
            ),
            headers={"X-Error-Code": CONVERSION_REQUIRED_CODE},
        )

    if moneda_gasto != moneda_base:
        tipo_cambio = _cotizacion(moneda_gasto, moneda_base, fecha_gasto)
        return data.MontoOriginal * tipo_cambio, tipo_cambio

    return data.MontoOriginal, Decimal("1.0")


def _viaje_tiene_transferencias_realizadas(db: Session, viaje_id: int) -> bool:
    return (
        db.scalar(
            select(TransferenciaLiquidacion.IdTransferenciaLiquidacion)
            .join(
                LiquidacionViaje,
                LiquidacionViaje.IdLiquidacion == TransferenciaLiquidacion.IdLiquidacion,
            )
            .join(
                EstadoTransferenciaLiquidacion,
                EstadoTransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion
                == TransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion,
            )
            .where(
                LiquidacionViaje.IdViaje == viaje_id,
                EstadoTransferenciaLiquidacion.Nombre == "realizada",
            )
            .limit(1)
        )
        is not None
    )

def _validar_datos_gasto(db: Session, data: GastoCreate | GastoUpdate, viaje_id: int) -> date:
    """Validaciones de los datos de un gasto, compartidas por el alta y la
    edición (US 79). Devuelve la fecha del gasto ya normalizada."""
    fecha_str = str(data.FechaGasto)
    fecha_limpia = fecha_str.split("T")[0]
    fecha_gasto_dt = date.fromisoformat(fecha_limpia)

    if fecha_gasto_dt > date.today():
        raise HTTPException(
            status_code=400,
            detail="La fecha del gasto no puede ser posterior a la fecha actual."
        )

    # RN-21: el monto debe ser numérico (lo garantiza el schema) y mayor a cero.
    if data.MontoOriginal is None or data.MontoOriginal <= 0:
        raise HTTPException(
            status_code=400,
            detail="El monto del gasto debe ser mayor a cero.",
        )

    # Categoría obligatoria. En el alta el schema ya la exige; en la edición
    # puede llegar vacía y se responde 400 con un mensaje claro.
    if data.IdCategoria is None:
        raise HTTPException(status_code=400, detail="Debés seleccionar una categoría.")

    # RN-19: en un gasto compartido el pagador es obligatorio y debe ser un
    # participante activo del viaje. En un gasto personal paga el usuario actual.
    if data.EsCompartido:
        if data.IdPagador is None:
            raise HTTPException(
                status_code=400,
                detail="Debés indicar quién pagó el gasto.",
            )
        _validar_participantes_activos(db, viaje_id, [data.IdPagador])

    return fecha_gasto_dt

def _total_division_personalizada(db: Session, data, viaje_id: int) -> Decimal:
    """Monto sobre el que se reparte una división personalizada (US 79).

    Es el monto original del gasto, salvo en un comprobante en otra moneda
    confirmado en un viaje en ARS (US 94): ahí el formulario divide el monto
    en pesos que ingresó el usuario (`MontoConvertidoARS`).
    """
    moneda_gasto = (data.MonedaOriginal or "").upper()
    if data.MontoConvertidoARS is not None and moneda_gasto != MONEDA_PESOS_ARGENTINOS:
        viaje = db.get(Viaje, viaje_id)
        moneda_base = ((viaje.Moneda if viaje else None) or "USD").upper()
        if moneda_base == MONEDA_PESOS_ARGENTINOS:
            return Decimal(str(data.MontoConvertidoARS))
    return Decimal(str(data.MontoOriginal))


def _convertir_division(
    montos: dict[int, Decimal],
    total_ingresado: Decimal,
    monto_convertido: Decimal,
) -> dict[int, Decimal]:
    """Lleva cada parte de la división a la moneda base del viaje (US 79).

    Usa la misma proporción que el total (monto convertido / monto ingresado)
    y ajusta la diferencia de redondeo en la última parte, así la suma da
    exactamente el monto convertido del gasto.
    """
    centavo = Decimal("0.01")
    objetivo = Decimal(monto_convertido).quantize(centavo, rounding=ROUND_HALF_UP)
    if total_ingresado == objetivo:
        return dict(montos)

    factor = Decimal(monto_convertido) / total_ingresado
    convertidos = {
        id_part: (monto * factor).quantize(centavo, rounding=ROUND_HALF_UP)
        for id_part, monto in montos.items()
    }
    diferencia = objetivo - sum(convertidos.values(), Decimal("0"))
    if diferencia and convertidos:
        ultimo = list(convertidos)[-1]
        convertidos[ultimo] += diferencia
    return convertidos


def _resolver_division(
    db: Session,
    data: GastoCreate | GastoUpdate,
    viaje_id: int,
    monto_convertido: Decimal,
    id_pagador_personal: int,
) -> tuple[int, TipoDivisionEnum | None, list[int], dict]:
    """Calcula pagador, tipo de división, participantes y monto de cada uno.
    Compartida por el alta y la edición (US 79).

    `id_pagador_personal` es quien paga si el gasto no es compartido.
    """
    monto_por_participante = {}
    participantes_ids = []
    tipo_division_final = None

    if not data.EsCompartido:
        participantes_ids = [id_pagador_personal]
        monto_por_participante[id_pagador_personal] = monto_convertido
        return id_pagador_personal, None, participantes_ids, monto_por_participante

    if data.TipoDivision == TipoDivisionEnum.igualitaria:
        tipo_division_final = TipoDivisionEnum.igualitaria

        if data.DividirEntreTodos:
            estado_aceptado = (
                db.query(EstadoParticipacion)
                .filter(
                    EstadoParticipacion.Nombre == "aceptado",
                    EstadoParticipacion.Activo.is_(True)
                )
                .first()
            )

            if not estado_aceptado:
                raise HTTPException(status_code=500, detail="Estado aceptado no configurado")

            participantes = (
                db.query(ParticipanteViaje)
                .join(
                    Usuario,
                    Usuario.IdUsuario == ParticipanteViaje.IdUsuario
                )
                .filter(
                    ParticipanteViaje.IdViaje == viaje_id,
                    ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
                    Usuario.Activo.is_(True)
                )
                .all()
            )
            participantes_ids = [p.IdParticipanteViaje for p in participantes]
        else:
            participantes_ids = data.IdParticipantes
            _validar_participantes_activos(db, viaje_id, participantes_ids)

            if len(participantes_ids) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Para dividir entre ciertos participantes, debés seleccionar al menos 2."
                )

        if len(participantes_ids) == 0:
            raise HTTPException(
                status_code=400,
                detail="El gasto debe tener al menos un participante"
            )

        monto_individual = monto_convertido / len(participantes_ids)
        monto_por_participante = {id_part: monto_individual for id_part in participantes_ids}

    elif data.TipoDivision == TipoDivisionEnum.personalizada:
        tipo_division_final = TipoDivisionEnum.personalizada
        detalles = data.DetalleMontosPersonalizados

        if not detalles:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar detalles de montos personalizados para cada participante."
            )

        total_asignado = Decimal("0")
        montos_ingresados: dict[int, Decimal] = {}

        for item in detalles:
            monto_asignado = Decimal(str(item.MontoAsignado))

            if monto_asignado <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="El monto asignado debe ser mayor a cero."
                )

            participantes_ids.append(item.IdParticipanteViaje)
            montos_ingresados[item.IdParticipanteViaje] = monto_asignado
            total_asignado += monto_asignado

        _validar_participantes_activos(db, viaje_id, participantes_ids)


        total_referencia = _total_division_personalizada(db, data, viaje_id)

        if abs(total_asignado - total_referencia) > Decimal("0.01"):
            raise HTTPException(
                status_code=400,
                detail=f"La suma de los montos asignados ({total_asignado}) no coincide con el monto total del gasto ({total_referencia})."
            )

        monto_por_participante = _convertir_division(
            montos_ingresados, total_referencia, monto_convertido
        )

    return data.IdPagador, tipo_division_final, participantes_ids, monto_por_participante


@router.post("")
async def create_gasto(data: GastoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    viaje = require_trip_edit_access(
        get_trip_with_relations(db, data.IdViaje),
        current_user,
    )

    participante_actual = next(
        p for p in viaje.Participantes if p.IdUsuario == current_user.IdUsuario
    )

    fecha_gasto_dt = _validar_datos_gasto(db, data, viaje.IdViaje)

    moneda_base = (getattr(viaje, "Moneda", None) or "USD").upper()
    moneda_gasto = (data.MonedaOriginal or moneda_base).upper()

    monto_convertido, tipo_cambio = _resolver_conversion(data, moneda_gasto, moneda_base, fecha_gasto_dt)

    # En un gasto personal paga quien lo registra.
    id_pagador, tipo_division_final, participantes_ids, monto_por_participante = _resolver_division(
        db, data, data.IdViaje, monto_convertido, participante_actual.IdParticipanteViaje
    )

    print(f"DEBUG: Guardando gasto: {data.Nombre}, Monto Original: {data.MontoOriginal} {moneda_gasto}, Monto Convertido: {monto_convertido}")

    # Transferencias pendientes antes del gasto, para avisar a quien le cambie
    # a quién transferir o de quién cobrar.
    transferencias_antes = transferencias_pendientes_por_participante(db, data.IdViaje)
      
    gasto = Gasto(
        IdViaje=data.IdViaje,
        Nombre=data.Nombre,
        Monto=monto_convertido,            # Monto convertido a la moneda base (usado para cálculos)
        MontoOriginal=data.MontoOriginal,  # Monto ingresado originalmente
        MonedaOriginal=moneda_gasto,       # Moneda seleccionada
        TipoCambio=tipo_cambio,            # Tasa aplicada
        IdCategoria=data.IdCategoria,
        IdPagador=id_pagador,
        FechaGasto=fecha_gasto_dt,
        DividirEntreTodos=data.DividirEntreTodos,
        TipoDivision=tipo_division_final,
        IdParticipanteCreador=participante_actual.IdParticipanteViaje
    )

    db.add(gasto)
    db.flush() 
        
    for id_part in participantes_ids:
        db.add(
            ParticipantesGastos(
                IdGasto=gasto.IdGasto,
                IdParticipanteViaje=id_part,
                MontoAsignado=monto_por_participante.get(id_part)
            )
        )
    
    db.commit()
    db.refresh(gasto)

    rebuild_settlement_plan(db, data.IdViaje)
    transferencias_despues = transferencias_pendientes_por_participante(db, data.IdViaje)

    # Los demás ven el gasto nuevo y los saldos sin recargar la pantalla.
    await manager.broadcast_to_trip(
        data.IdViaje, {"tipo": "gasto_actualizado", "idGasto": gasto.IdGasto}
    )

    # Personal: nadie. Compartido: división y pagador, y aviso de liquidación
    # actualizada a quien le cambie a quién transferir.
    await notificar_alta_gasto(
        db, viaje, gasto, current_user, transferencias_antes, transferencias_despues
    )

    return {
        "message": "Gasto creado correctamente",
        "IdGasto": gasto.IdGasto,
    }


@router.delete("/{gasto_id}")
async def delete_gasto(
    gasto_id: int,
    eliminar_comprobante: bool = Query(
        default=False,
        description="Si es true y el usuario es dueño del comprobante, también se elimina del repositorio.",
    ),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    gasto = db.scalar(select(Gasto).where(Gasto.IdGasto == gasto_id))
    # Un gasto personal ajeno responde igual que uno inexistente.
    exigir_gasto_visible(gasto, current_user.IdUsuario)

    viaje = require_trip_edit_access(
        get_trip_with_relations(db, gasto.IdViaje),
        current_user,
    )

    if _viaje_tiene_transferencias_realizadas(db, gasto.IdViaje):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede eliminar el gasto porque el viaje ya tiene pagos "
                "registrados en una liquidación."
            ),
            headers={"X-Error-Code": EXPENSE_DELETE_LOCKED_CODE},
        )

    viaje_id = gasto.IdViaje

    # Reglas para borrar también el comprobante: solo si lo subió quien elimina
    # y si el viaje no finalizó (los documentos quedan bloqueados al finalizar).
    documento = (
        db.get(DocumentoViaje, gasto.IdDocumentoComprobante)
        if gasto.IdDocumentoComprobante is not None
        else None
    )
    motivo_conservado = None
    borrar_documento = False
    if documento is not None and eliminar_comprobante:
        if documento.IdUsuarioSubida != current_user.IdUsuario:
            motivo_conservado = "NO_ES_DUENO"
        elif is_trip_finished(viaje):
            motivo_conservado = "VIAJE_FINALIZADO"
        else:
            borrar_documento = True

    ruta_storage = documento.UrlArchivo if borrar_documento else None

    # Foto de las transferencias pendientes antes de borrar, para avisar a
    # quienes les cambie a quién transferir o de quién cobrar.
    transferencias_antes = transferencias_pendientes_por_participante(db, viaje_id)

    db.delete(gasto)
    db.flush()
    if borrar_documento:
        db.delete(documento)
        db.flush()
    rebuild_settlement_plan(db, viaje_id)
    db.commit()
    transferencias_despues = transferencias_pendientes_por_participante(db, viaje_id)

    if ruta_storage:
        try:
            eliminar_documento(ruta_storage)
        except Exception:
            # Si el archivo ya no estaba en el storage, no bloqueamos la eliminación.
            pass
        await manager.broadcast_to_trip(viaje_id, {"tipo": "documento_actualizado"})

    # Los demás dejan de ver el gasto y se actualizan sus saldos.
    await manager.broadcast_to_trip(viaje_id, {"tipo": "gasto_eliminado", "idGasto": gasto_id})

    await notificar_liquidacion_actualizada(
        db, viaje, current_user, transferencias_antes, transferencias_despues
    )

    return {
        "message": "Gasto eliminado correctamente",
        "IdGasto": gasto_id,
        "ComprobanteEliminado": borrar_documento,
        "MotivoComprobanteConservado": motivo_conservado,
    }


@router.post("/{gasto_id}/comprobante")
async def asociar_comprobante_gasto(
    gasto_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Guarda el comprobante escaneado en el repositorio (categoría "Comprobantes")
    y lo asocia al gasto. Solo participantes con permiso de edición (RN-28, RNF-14)."""
    gasto = exigir_gasto_visible(db.get(Gasto, gasto_id), current_user.IdUsuario)

    viaje = require_trip_edit_access(
        get_trip_with_relations(db, gasto.IdViaje),
        current_user,
    )
    require_trip_not_finished(viaje, "los comprobantes")

    if gasto.IdDocumentoComprobante is not None:
        raise HTTPException(
            status_code=409,
            detail="El gasto ya tiene un comprobante asociado.",
        )

    contenido = await archivo.read(MAX_RECEIPT_BYTES + 1)
    try:
        mime = validar_documento(contenido)
    except ReceiptScanError as error:
        raise _error_escaneo(error)

    ruta_subida = None
    try:
        documento = guardar_comprobante(db, gasto, current_user, contenido, mime)
        ruta_subida = documento.UrlArchivo
        nombre_documento = documento.NombreArchivo
        id_documento = documento.IdDocumento
        db.commit()
    except IntegrityError:
        db.rollback()
        if ruta_subida:
            eliminar_documento_storage(ruta_subida)
        raise HTTPException(
            status_code=409,
            detail="Ya existe un documento con ese nombre en este viaje. Intentá nuevamente.",
        )
    except Exception:
        logger.exception("No se pudo guardar el comprobante del gasto %s", gasto_id)
        db.rollback()
        if ruta_subida:
            eliminar_documento_storage(ruta_subida)
        raise HTTPException(
            status_code=502,
            detail="No se pudo guardar el comprobante en el repositorio.",
        )

    await manager.broadcast_to_trip(gasto.IdViaje, {"tipo": "documento_actualizado"})

    return {
        "message": "Comprobante guardado en el repositorio.",
        "IdDocumento": id_documento,
        "NombreArchivo": nombre_documento,
    }


@router.get("/categories", response_model=list[CategoriasGastosRead])
def get_categories(
    db: Session = Depends(get_db)
):
    categorias = db.scalars(
        select(CategoriasGastos)
        .where(CategoriasGastos.Activo.is_(True))
    ).all()

    return [
        CategoriasGastosRead(
            IdCategoria=categoria.IdCategoria,
            Nombre=categoria.Nombre
        )
        for categoria in categorias
    ]


def _error_escaneo(error: ReceiptScanError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail=error.message,
        headers={"X-Error-Code": error.code},
    )


@router.post("/trips/{trip_id}/escanear-comprobante", response_model=EscaneoComprobanteRead)
async def escanear_comprobante(
    trip_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    extractor: ReceiptExtractor = Depends(get_receipt_extractor),
) -> EscaneoComprobanteRead:
    """Extrae con IA los datos de un comprobante para precargar el formulario
    de gasto (US 93).

    No registra nada: el gasto se guarda recién cuando el usuario confirma el
    formulario con POST /gastos (RNF-31).
    """
    # AC1: solo participantes actuales (aceptados) y viaje no finalizado.
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    if is_trip_finished(viaje):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El viaje ya finalizó: no se pueden escanear comprobantes. "
            "Podés cargar el gasto manualmente.",
            headers={"X-Error-Code": TRIP_FINISHED_CODE},
        )

    # AC5: consentimiento explícito antes de enviar la imagen a un servicio externo.
    if not current_user.ConsienteProcesamientoIA:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Para escanear comprobantes tenés que aceptar que la imagen "
            "sea procesada por un servicio externo de inteligencia artificial.",
            headers={"X-Error-Code": AI_CONSENT_REQUIRED},
        )

    # AC3: formato y tamaño (se lee un byte de más para detectar el exceso).
    contenido = await archivo.read(MAX_RECEIPT_BYTES + 1)
    try:
        mime = validar_documento(contenido)
    except ReceiptScanError as error:
        raise _error_escaneo(error)

    categorias = {
        categoria.Nombre: categoria.IdCategoria
        for categoria in db.scalars(
            select(CategoriasGastos).where(CategoriasGastos.Activo.is_(True))
        ).all()
    }
    monedas = {codigo.upper() for codigo in db.scalars(select(Moneda.Codigo)).all()}

    # AC14 / AC15: el servicio externo puede fallar o demorar; nunca bloquea la carga manual.
    try:
        crudo = await asyncio.wait_for(
            extractor.extraer(contenido, mime, list(categorias.keys())),
            timeout=settings.ai_receipt_timeout_seconds + 1,
        )
        # AC6: la respuesta se valida contra el esquema y las reglas de negocio.
        resultado = construir_resultado(validar_esquema(crudo), categorias, monedas)
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=MENSAJE_TIEMPO_AGOTADO,
            headers={"X-Error-Code": AI_TIMEOUT},
        )
    except ReceiptScanError as error:
        raise _error_escaneo(error)
    except Exception:
        # RNF-30: cualquier falla inesperada del servicio externo degrada a carga manual.
        logger.exception("Error inesperado al escanear comprobante con IA")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MENSAJE_NO_DISPONIBLE,
            headers={"X-Error-Code": AI_UNAVAILABLE},
        )

    return EscaneoComprobanteRead(
        Nombre=resultado.Nombre,
        MontoOriginal=resultado.MontoOriginal,
        MonedaOriginal=resultado.MonedaOriginal,
        FechaGasto=resultado.FechaGasto,
        IdCategoria=resultado.IdCategoria,
        CamposBajaConfianza=resultado.CamposBajaConfianza,
    )


@router.get("/trips/{trip_id}", response_model=list[GastoListItemRead])
def list_trip_gastos(
    trip_id: int,
    categoria: int | None = Query(
        default=None,
        description="Filtra por IdCategoria. Si se omite, devuelve todos los gastos.",
    ),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listado de gastos del viaje, del más reciente al más antiguo."""
    viaje = get_trip_with_relations(db, trip_id)
    require_trip_access(viaje, current_user)
    try:
        require_trip_edit_access(viaje, current_user)
        es_participante_actual = True
    except Exception:
        es_participante_actual = False

    query = (
        select(Gasto)
        .options(
            selectinload(Gasto.Categoria),
            selectinload(Gasto.Pagador).selectinload(ParticipanteViaje.Usuario),
            selectinload(Gasto.Comprobante),
            selectinload(Gasto.ParticipanteCreador),
            selectinload(Gasto.ParticipantesAsociados).selectinload(
                ParticipantesGastos.ParticipanteViaje
            ),
        )
        .where(Gasto.IdViaje == trip_id)
        # Los gastos personales solo los ve su dueño (creador o pagador).
        .where(condicion_gasto_visible(current_user.IdUsuario))
        .order_by(Gasto.FechaGasto.desc(), Gasto.FechaCreacion.desc(), Gasto.IdGasto.desc())
    )
    if categoria is not None:
        query = query.where(Gasto.IdCategoria == categoria)

    gastos = db.scalars(query).all()

    def _comprobante_visible(gasto: Gasto) -> bool:
        # Mismas reglas de acceso que el repositorio: público o propio (RN-28).
        comprobante = gasto.Comprobante
        return (
            es_participante_actual
            and comprobante is not None
            and (
                comprobante.EsPublico
                or comprobante.IdUsuarioSubida == current_user.IdUsuario
            )
        )

    return [
        GastoListItemRead(
            IdGasto=gasto.IdGasto,
            Nombre=gasto.Nombre,
            Monto=gasto.Monto,
            MontoOriginal=gasto.MontoOriginal,
            MonedaOriginal=gasto.MonedaOriginal,
            FechaGasto=gasto.FechaGasto,
            IdCategoria=gasto.IdCategoria,
            NombreCategoria=gasto.Categoria.Nombre,
            IdPagador=gasto.IdPagador,
            IdUsuarioPagador=gasto.Pagador.IdUsuario,
            NombrePagador=_actor_display_name(gasto.Pagador.Usuario),
            EsCompartido=gasto.TipoDivision is not None,
            ParticipoEnElGasto=participa_en_el_gasto(gasto, current_user.IdUsuario),
            IdDocumentoComprobante=(
                gasto.IdDocumentoComprobante if _comprobante_visible(gasto) else None
            ),
            EsPropioComprobante=(
                es_participante_actual
                and gasto.Comprobante is not None
                and gasto.Comprobante.IdUsuarioSubida == current_user.IdUsuario
            ),
            UrlComprobante=(
                obtener_url_publica(gasto.Comprobante.UrlArchivo)
                if _comprobante_visible(gasto)
                else None
            ),
            NombreComprobante=(
                gasto.Comprobante.NombreArchivo if _comprobante_visible(gasto) else None
            ),
        )
        for gasto in gastos
    ]


@router.get(
    "/trips/{trip_id}/posibles-duplicados",
    response_model=list[GastoPosibleDuplicadoRead],
)
def get_posibles_duplicados(
    trip_id: int,
    fecha_gasto: date = Query(..., description="Fecha del gasto que se está registrando."),
    monto_original: Decimal = Query(..., gt=0, description="Monto en la moneda ingresada."),
    moneda_original: str = Query(..., min_length=3, max_length=3),
    es_compartido: bool = Query(...),
    id_pagador: int | None = Query(
        default=None,
        description="Participante que pagó. Obligatorio si es compartido; en un gasto personal paga el usuario actual.",
    ),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Gastos existentes que podrían ser el mismo pago que se va a registrar (US 95).

    El formulario lo consulta antes de `POST /gastos`, tanto en la carga manual
    como en la confirmación de un comprobante. No persiste nada ni bloquea el
    alta: si devuelve gastos, el usuario decide si registra igual o cancela.
    Los criterios viven en `app/services/duplicados_gastos.py`.
    """
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    participante_actual = next(
        p for p in viaje.Participantes if p.IdUsuario == current_user.IdUsuario
    )

    if es_compartido and id_pagador is None:
        raise HTTPException(status_code=400, detail="Debés indicar quién pagó el gasto.")

    gastos = buscar_posibles_duplicados(
        db,
        id_viaje=trip_id,
        id_usuario=current_user.IdUsuario,
        fecha_gasto=fecha_gasto,
        monto_original=monto_original,
        moneda_original=moneda_original,
        # En un gasto personal paga quien lo registra (igual que en el alta).
        id_pagador=id_pagador if es_compartido else participante_actual.IdParticipanteViaje,
        es_compartido=es_compartido,
    )

    moneda_viaje = (viaje.Moneda or "USD").upper()
    return [_posible_duplicado_read(gasto, moneda_viaje) for gasto in gastos]


def _posible_duplicado_read(gasto: Gasto, moneda_viaje: str) -> GastoPosibleDuplicadoRead:
    """Mismos datos que el detalle del gasto (US 79), para mostrarlo igual (US 95)."""
    creador = gasto.ParticipanteCreador
    return GastoPosibleDuplicadoRead(
        IdGasto=gasto.IdGasto,
        Nombre=gasto.Nombre,
        Monto=gasto.Monto,
        MontoOriginal=gasto.MontoOriginal,
        MonedaOriginal=gasto.MonedaOriginal,
        MonedaViaje=moneda_viaje,
        FechaGasto=gasto.FechaGasto,
        IdCategoria=gasto.IdCategoria,
        NombreCategoria=gasto.Categoria.Nombre,
        IdPagador=gasto.IdPagador,
        IdUsuarioPagador=gasto.Pagador.IdUsuario,
        NombrePagador=_actor_display_name(gasto.Pagador.Usuario),
        NombreCreador=_actor_display_name(creador.Usuario) if creador is not None else None,
        FechaCreacion=gasto.FechaCreacion,
        EsCompartido=gasto.TipoDivision is not None,
        TipoDivision=gasto.TipoDivision,
        Participantes=[
            ParticipanteDivisionRead(
                IdParticipanteViaje=asignacion.IdParticipanteViaje,
                IdUsuario=asignacion.ParticipanteViaje.IdUsuario,
                Nombre=asignacion.ParticipanteViaje.Usuario.Nombre,
                Apellido=asignacion.ParticipanteViaje.Usuario.Apellido,
                NombreUsuario=asignacion.ParticipanteViaje.Usuario.NombreUsuario,
                MontoAsignado=asignacion.MontoAsignado,
            )
            for asignacion in gasto.ParticipantesAsociados
        ],
    )


@router.get("/trips/{trip_id}/participants", response_model=list[ParticipantesGastosRead])
def get_trip_participants(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )

    estado_aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado",
            EstadoParticipacion.Activo.is_(True)
        )
    )

    if not estado_aceptado:
        raise HTTPException(status_code=500, detail="Estado aceptado no configurado")

    participantes = db.scalars(
        select(ParticipanteViaje)
        .join(Usuario, Usuario.IdUsuario == ParticipanteViaje.IdUsuario)
        .where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
            Usuario.Activo.is_(True)
        )
    ).all()

    return [
        ParticipantesGastosRead(
            IdParticipanteViaje=p.IdParticipanteViaje,
            Nombre=p.Usuario.Nombre,
            Apellido=p.Usuario.Apellido,
            NombreUsuario=p.Usuario.NombreUsuario,
            EsUsuarioActual=p.IdUsuario == current_user.IdUsuario,
        )
        for p in participantes
    ]


TRIP_CANCELLED_CODE = "TRIP_CANCELLED"
EXPENSE_EDIT_FORBIDDEN_CODE = "EXPENSE_EDIT_FORBIDDEN"
EXPENSE_EDIT_LOCKED_CODE = "EXPENSE_EDIT_LOCKED_BY_PAID_SETTLEMENT"
EXPENSE_BEING_EDITED_CODE = "EXPENSE_BEING_EDITED"



def _participacion_aceptada(viaje: Viaje, usuario: Usuario) -> ParticipanteViaje | None:
    return next(
        (
            p
            for p in viaje.Participantes
            if p.IdUsuario == usuario.IdUsuario
            and p.EstadoParticipacion is not None
            and p.EstadoParticipacion.Nombre == "aceptado"
        ),
        None,
    )


def validar_permiso_edicion_gasto(db: Session, viaje: Viaje, gasto: Gasto, usuario: Usuario) -> None:
    """Reglas de la US 79 para poder editar un gasto. Lanza HTTPException si no se puede."""
    estado = viaje.EstadoViaje.Nombre if viaje.EstadoViaje is not None else None
    if estado == "cancelado":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se pueden editar gastos de un viaje cancelado.",
            headers={"X-Error-Code": TRIP_CANCELLED_CODE},
        )

    if is_trip_finished(viaje):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El viaje ya finalizó: los gastos no se pueden editar.",
            headers={"X-Error-Code": TRIP_FINISHED_CODE},
        )

    # Solo el creador original o el pagador actual. Ser parte de la división o
    # administrador del viaje no alcanza. Como se compara contra el pagador
    # actual, al cambiar el pagador el permiso pasa al nuevo automáticamente.
    participacion = _participacion_aceptada(viaje, usuario)
    if participacion is None or participacion.IdParticipanteViaje not in {
        gasto.IdParticipanteCreador,
        gasto.IdPagador,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el creador del gasto o su pagador actual pueden editarlo.",
            headers={"X-Error-Code": EXPENSE_EDIT_FORBIDDEN_CODE},
        )

    if _viaje_tiene_transferencias_realizadas(db, viaje.IdViaje):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede editar el gasto porque el viaje ya tiene pagos "
                "registrados en una liquidación."
            ),
            headers={"X-Error-Code": EXPENSE_EDIT_LOCKED_CODE},
        )


def _requiere_reconversion(gasto: Gasto, data: GastoUpdate, moneda_gasto: str, fecha: date) -> bool:
    """La conversión se recalcula si cambia la moneda, el monto o la fecha
    (la cotización depende de la fecha), o si se informa un monto en ARS."""
    return (
        moneda_gasto != gasto.MonedaOriginal.upper()
        or data.MontoOriginal != gasto.MontoOriginal
        or fecha != gasto.FechaGasto
        or data.MontoConvertidoARS is not None
    )

def mensaje_gasto_en_edicion(db: Session, id_usuario_editor: int) -> str:
    editor = db.get(Usuario, id_usuario_editor)
    quien = f" ({_actor_display_name(editor)})" if editor is not None else ""
    return f"El gasto está siendo editado por otro usuario{quien}. Intentá nuevamente cuando termine."

def _destinatarios_modificacion(gasto: Gasto, id_usuario_actor: int) -> set[int]:
    
    destinatarios = {
        asignacion.ParticipanteViaje.IdUsuario
        for asignacion in gasto.ParticipantesAsociados
    }
    if gasto.ParticipanteCreador is not None:
        destinatarios.add(gasto.ParticipanteCreador.IdUsuario)
    destinatarios.add(gasto.Pagador.IdUsuario)
    destinatarios.discard(id_usuario_actor)
    return destinatarios

@router.put("/{gasto_id}")
async def update_gasto(
    gasto_id: int,
    data: GastoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Guarda la edición de un gasto (US 79)."""
    gasto = exigir_gasto_visible(db.get(Gasto, gasto_id), current_user.IdUsuario)

    viaje = require_trip_access(get_trip_with_relations(db, gasto.IdViaje), current_user)
    validar_permiso_edicion_gasto(db, viaje, gasto, current_user)

    # Edición concurrente: si otro usuario tiene la edición activa, no se guarda.
    id_editor = manager.obtener_editor_gasto(gasto_id)
    if id_editor is not None and id_editor != current_user.IdUsuario:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=mensaje_gasto_en_edicion(db, id_editor),
            headers={"X-Error-Code": EXPENSE_BEING_EDITED_CODE},
        )

    viaje_id = gasto.IdViaje
    fecha_gasto_dt = _validar_datos_gasto(db, data, viaje_id)

    moneda_base = (viaje.Moneda or "USD").upper()
    moneda_gasto = (data.MonedaOriginal or moneda_base).upper()

    if _requiere_reconversion(gasto, data, moneda_gasto, fecha_gasto_dt):
        monto_convertido, tipo_cambio = _resolver_conversion(
            data, moneda_gasto, moneda_base, fecha_gasto_dt
        )
    else:
        monto_convertido, tipo_cambio = gasto.Monto, gasto.TipoCambio

    # En un gasto personal se conserva el pagador actual, salvo que se indique
    # otro: quien edita puede ser el creador y no el pagador.
    id_pagador_personal = gasto.IdPagador
    if not data.EsCompartido and data.IdPagador is not None:
        _validar_participantes_activos(db, viaje_id, [data.IdPagador])
        id_pagador_personal = data.IdPagador

    # En la edición un gasto compartido tiene que indicar cómo se divide: si
    # no, se perdería la división anterior sin reemplazarla.
    if data.EsCompartido and data.TipoDivision is None:
        raise HTTPException(status_code=400, detail="Debés indicar el tipo de división del gasto.")

    id_pagador, tipo_division, participantes_ids, monto_por_participante = _resolver_division(
        db, data, viaje_id, monto_convertido, id_pagador_personal
    )

    nombre_anterior = gasto.Nombre
    # Foto de las transferencias pendientes antes de guardar los cambios.
    transferencias_antes = transferencias_pendientes_por_participante(db, viaje_id)

    try:
        gasto.Nombre = data.Nombre
        gasto.Monto = monto_convertido
        gasto.MontoOriginal = data.MontoOriginal
        gasto.MonedaOriginal = moneda_gasto
        gasto.TipoCambio = tipo_cambio
        gasto.IdCategoria = data.IdCategoria
        gasto.IdPagador = id_pagador
        gasto.FechaGasto = fecha_gasto_dt
        gasto.DividirEntreTodos = data.DividirEntreTodos
        gasto.TipoDivision = tipo_division

        # Se borra la división anterior y se hace flush antes de insertar la
        # nueva: si no, SQLAlchemy inserta primero y choca con la UNIQUE
        # (IdGasto, IdParticipanteViaje).
        gasto.ParticipantesAsociados.clear()
        db.flush()
        for id_part in participantes_ids:
            gasto.ParticipantesAsociados.append(
                ParticipantesGastos(
                    IdParticipanteViaje=id_part,
                    MontoAsignado=monto_por_participante[id_part],
                )
            )
        db.flush()

        # Regenera la liquidación activa y confirma todo junto (hace commit).
        rebuild_settlement_plan(db, viaje_id)
    except Exception:
        db.rollback()
        raise
    transferencias_despues = transferencias_pendientes_por_participante(db, viaje_id)

    # Los cambios se reflejan para todos sin recargar la pantalla.
    await manager.broadcast_to_trip(
        viaje_id,
        {"tipo": "gasto_actualizado", "idGasto": gasto_id},
    )

    # Guardar libera la edición para que otro usuario autorizado pueda editar.
    if await manager.finalizar_edicion_gasto(gasto_id, current_user.IdUsuario):
        await manager.broadcast_to_trip(
            viaje_id,
            {"tipo": "edicion_gasto_liberada", "idGasto": gasto_id},
        )

    # Notificaciones: solo se llega hasta acá si los cambios se guardaron.
    db.refresh(gasto)
    destinatarios_ids = _destinatarios_modificacion(gasto, current_user.IdUsuario)
    if destinatarios_ids:
        destinatarios = db.scalars(
            select(Usuario).where(Usuario.IdUsuario.in_(destinatarios_ids))
        ).all()
        nombre_gasto = (
            f'"{gasto.Nombre}"'
            if gasto.Nombre == nombre_anterior
            else f'"{gasto.Nombre}" (antes "{nombre_anterior}")'
        )
        await dispatch_user_notification(
            db,
            TripNotificationEvent(
                notification_type=NotificationType.GASTO_MODIFICADO,
                tipo="gasto_modificado",
                titulo=f"Gasto modificado en {viaje.Titulo}",
                mensaje=f"{_actor_display_name(current_user)} modificó el gasto {nombre_gasto}.",
                id_viaje=viaje_id,
                id_usuario_actor=current_user.IdUsuario,
                data={
                    "eventType": "expense_updated",
                    "expenseId": gasto_id,
                },
            ),
            list(destinatarios),
        )

    # A los demás solo se les avisa si les cambió a quién transferir o de quién cobrar.
    await notificar_liquidacion_actualizada(
        db,
        viaje,
        current_user,
        transferencias_antes,
        transferencias_despues,
        excluir_usuarios=destinatarios_ids,
    )

    return {
        "message": "Los cambios del gasto se guardaron correctamente.",
        "IdGasto": gasto_id,
    }

# Cada cuántos segundos el cliente debe renovar la edición mientras el
# formulario está abierto.
SEGUNDOS_RENOVACION_EDICION_GASTO = 30


@router.websocket("/ws/{gasto_id}")
async def edicion_gasto_ws(websocket: WebSocket, gasto_id: int, token: str = Query(...)):
    """Edición activa de un gasto (US 79).

    El formulario de edición se conecta al abrirse y se desconecta al cerrarse:
    - al conectar se valida el permiso y se toma la edición; si no se puede,
      se envía `edicion_gasto_rechazada` con el motivo y se cierra;
    - mientras está abierto, el cliente envía `renovar` cada
      SEGUNDOS_RENOVACION_EDICION_GASTO segundos;
    - al desconectarse (cancelar, salir de la pantalla, cerrar la app) se
      libera la edición. Si la desconexión no llega al servidor, la edición
      vence sola por inactividad.
    """
    db = SessionLocal()
    concedida = False
    viaje_id = None
    try:
        await websocket.accept()

        current_user = _autenticar_ws(token, db)
        if current_user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        async def rechazar(codigo: str, mensaje: str) -> None:
            await websocket.send_json({
                "tipo": "edicion_gasto_rechazada",
                "idGasto": gasto_id,
                "codigo": codigo,
                "mensaje": mensaje,
            })
            await websocket.close()

        gasto = db.get(Gasto, gasto_id)
        if gasto is None or not gasto_visible_para(gasto, current_user.IdUsuario):
            await rechazar("EXPENSE_NOT_FOUND", "Gasto no encontrado.")
            return
        viaje_id = gasto.IdViaje

        # Mismas reglas que el PUT: estado del viaje, permiso y liquidación.
        try:
            viaje = require_trip_access(get_trip_with_relations(db, viaje_id), current_user)
            validar_permiso_edicion_gasto(db, viaje, gasto, current_user)
        except HTTPException as error:
            codigo = (error.headers or {}).get("X-Error-Code", "FORBIDDEN")
            await rechazar(codigo, error.detail)
            return

        if not await manager.iniciar_edicion_gasto(gasto_id, current_user.IdUsuario):
            id_editor = manager.obtener_editor_gasto(gasto_id)
            await rechazar(EXPENSE_BEING_EDITED_CODE, mensaje_gasto_en_edicion(db, id_editor))
            return

        concedida = True
        await websocket.send_json({
            "tipo": "edicion_gasto_concedida",
            "idGasto": gasto_id,
            "segundosRenovacion": SEGUNDOS_RENOVACION_EDICION_GASTO,
        })
        await manager.broadcast_to_trip(
            viaje_id,
            {"tipo": "edicion_gasto_iniciada", "idGasto": gasto_id, "idUsuario": current_user.IdUsuario},
        )

        while True:
            mensaje = await websocket.receive_json()
            if mensaje.get("tipo") == "renovar":
                if not await manager.renovar_edicion_gasto(gasto_id, current_user.IdUsuario):
                    # Venció por inactividad y la tomó otro: hay que salir.
                    await websocket.send_json({"tipo": "edicion_gasto_perdida", "idGasto": gasto_id})
                    await websocket.close()
                    return
    except WebSocketDisconnect:
        pass
    finally:
        if concedida and await manager.finalizar_edicion_gasto(gasto_id, current_user.IdUsuario):
            await manager.broadcast_to_trip(
                viaje_id,
                {"tipo": "edicion_gasto_liberada", "idGasto": gasto_id},
            )
        db.close()


@router.get("/{gasto_id}", response_model=GastoDetalleRead)
def get_gasto(
    gasto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> GastoDetalleRead:
    """Detalle de un gasto para consultarlo o precargar el formulario de edición.

    Un gasto compartido lo puede ver cualquier usuario con acceso al viaje,
    aunque no pueda editarlo (US 79): en ese caso `PuedeEditar` es false y
    `MotivoNoEditable` trae el mensaje para mostrar. Un gasto personal solo lo
    ve su dueño; para los demás responde 404 (visibilidad_gastos).
    """
    gasto = db.scalar(
        select(Gasto)
        .options(
            selectinload(Gasto.Categoria),
            selectinload(Gasto.Pagador).selectinload(ParticipanteViaje.Usuario),
            selectinload(Gasto.ParticipanteCreador).selectinload(ParticipanteViaje.Usuario),
            selectinload(Gasto.ParticipantesAsociados)
            .selectinload(ParticipantesGastos.ParticipanteViaje)
            .selectinload(ParticipanteViaje.Usuario),
        )
        .where(Gasto.IdGasto == gasto_id)
    )
    exigir_gasto_visible(gasto, current_user.IdUsuario)

    viaje = require_trip_access(get_trip_with_relations(db, gasto.IdViaje), current_user)

    # Mismas reglas que el PUT y el WebSocket, pero informadas en vez de lanzadas.
    codigo_no_editable = None
    motivo_no_editable = None
    try:
        validar_permiso_edicion_gasto(db, viaje, gasto, current_user)
    except HTTPException as error:
        codigo_no_editable = (error.headers or {}).get("X-Error-Code")
        motivo_no_editable = error.detail

    # Si otro usuario tiene la edición activa, se informa quién.
    id_editor = manager.obtener_editor_gasto(gasto_id)
    nombre_editor = None
    if id_editor is not None:
        editor = db.get(Usuario, id_editor)
        nombre_editor = _actor_display_name(editor) if editor is not None else None

    creador = gasto.ParticipanteCreador

    return GastoDetalleRead(
        IdGasto=gasto.IdGasto,
        IdViaje=gasto.IdViaje,
        Nombre=gasto.Nombre,
        Monto=gasto.Monto,
        MontoOriginal=gasto.MontoOriginal,
        MonedaOriginal=gasto.MonedaOriginal,
        MonedaViaje=(viaje.Moneda or "USD").upper(),
        TipoCambio=gasto.TipoCambio,
        FechaGasto=gasto.FechaGasto,
        IdCategoria=gasto.IdCategoria,
        NombreCategoria=gasto.Categoria.Nombre,
        IdPagador=gasto.IdPagador,
        IdUsuarioPagador=gasto.Pagador.IdUsuario,
        NombrePagador=_actor_display_name(gasto.Pagador.Usuario),
        IdParticipanteCreador=gasto.IdParticipanteCreador,
        NombreCreador=_actor_display_name(creador.Usuario) if creador is not None else None,
        EsCompartido=gasto.TipoDivision is not None,
        TipoDivision=gasto.TipoDivision,
        DividirEntreTodos=gasto.DividirEntreTodos,
        Participantes=[
            ParticipanteDivisionRead(
                IdParticipanteViaje=asignacion.IdParticipanteViaje,
                IdUsuario=asignacion.ParticipanteViaje.IdUsuario,
                Nombre=asignacion.ParticipanteViaje.Usuario.Nombre,
                Apellido=asignacion.ParticipanteViaje.Usuario.Apellido,
                NombreUsuario=asignacion.ParticipanteViaje.Usuario.NombreUsuario,
                MontoAsignado=asignacion.MontoAsignado,
            )
            for asignacion in gasto.ParticipantesAsociados
        ],
        FechaActualizacion=gasto.FechaActualizacion,
        PuedeEditar=codigo_no_editable is None,
        CodigoNoEditable=codigo_no_editable,
        MotivoNoEditable=motivo_no_editable,
        IdUsuarioEditando=id_editor,
        NombreUsuarioEditando=nombre_editor,
    )