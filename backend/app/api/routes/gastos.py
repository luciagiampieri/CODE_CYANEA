import asyncio
import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db

from app.models import CategoriasGastos, ParticipantesGastos, ParticipanteViaje, Usuario, EstadoParticipacion, Gasto 

from app.schemas.gasto import (
    GastoCreate,
    CategoriasGastosRead,
    ParticipantesGastosRead,
    GastoRead,
    GastoListItemRead,
    EscaneoComprobanteRead,
)
from app.models.gasto import TipoDivisionEnum
from app.models.viaje import Viaje
from app.services.liquidacion_service import rebuild_settlement_plan
from app.services.notifications import NotificationType, TripNotificationEvent, dispatch_trip_notification
from app.services.trip_access import (
    TRIP_FINISHED_CODE,
    get_trip_with_relations,
    is_trip_finished,
    require_trip_access,
    require_trip_edit_access,
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


@router.post("")
async def create_gasto(data: GastoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    viaje = require_trip_edit_access(
        get_trip_with_relations(db, data.IdViaje),
        current_user,
    )

    fecha_str = str(data.FechaGasto)
    fecha_limpia = fecha_str.split("T")[0]
    fecha_gasto_dt = date.fromisoformat(fecha_limpia)

    if fecha_gasto_dt > date.today():
        raise HTTPException(
            status_code=400,
            detail="La fecha del gasto no puede ser posterior a la fecha actual."
        )

    # === LÓGICA DE CONVERSIÓN DE MONEDA (US-85) ===
    # Obtenemos la moneda base configurada en el viaje (por defecto USD si no estuviera definida)
    moneda_base = getattr(viaje, "Moneda", "USD") 
    moneda_gasto = (data.MonedaOriginal or moneda_base).upper()

    tipo_cambio = Decimal("1.0")
    monto_convertido = data.MontoOriginal

    if moneda_gasto != moneda_base.upper():
        try:
            # Se pasa la fecha del gasto para contemplar registros offline o históricos
            tasa_obtenida = obtener_tipo_cambio(moneda_gasto, moneda_base, fecha=fecha_gasto_dt)
            tipo_cambio = Decimal(str(tasa_obtenida))
            monto_convertido = data.MontoOriginal * tipo_cambio
        except Exception as e:
            # Si el servicio no está disponible, lanzamos 503 (Criterio de aceptación / Caso de prueba)
            raise HTTPException(
                status_code=503,
                detail="Servicio de cotización no disponible. No se pudo realizar la conversión de moneda."
            )
    else:
        monto_convertido = data.MontoOriginal
        tipo_cambio = Decimal("1.0")
    # ===============================================

    monto_por_participante = {}
    participantes_ids = []
    tipo_division_final = None

    if not data.EsCompartido:
        participante = (
            db.query(ParticipanteViaje)
            .filter(
                ParticipanteViaje.IdViaje == data.IdViaje,
                ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            )
            .first()
        )

        if not participante:
            raise HTTPException(
                status_code=400,
                detail="No se encontró al participante del viaje para el usuario actual."
            )
        id_pagador = participante.IdParticipanteViaje
        tipo_division_final = None
        participantes_ids = [id_pagador]
        monto_por_participante[id_pagador] = monto_convertido

    elif data.TipoDivision == TipoDivisionEnum.igualitaria:
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
                    ParticipanteViaje.IdViaje == data.IdViaje,
                    ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
                    Usuario.Activo.is_(True)
                )
                .all()
            )
            participantes_ids = [p.IdParticipanteViaje for p in participantes]
        else:
            participantes_ids = data.IdParticipantes
            _validar_participantes_activos(db, data.IdViaje, participantes_ids)
            
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
        participantes_ids = []
        monto_por_participante = {}

        for item in detalles:
            monto_asignado = Decimal(str(item.MontoAsignado)) 
    
            if monto_asignado <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"El monto asignado debe ser mayor a cero."
                )

            participantes_ids.append(item.IdParticipanteViaje)
            monto_por_participante[item.IdParticipanteViaje] = monto_asignado
            total_asignado += monto_asignado

        _validar_participantes_activos(db, data.IdViaje, participantes_ids)
        
        if abs(total_asignado - monto_convertido) > Decimal("0.01"):
            raise HTTPException(
                status_code=400,
                detail=f"La suma de los montos asignados ({total_asignado}) no coincide con el monto total convertido del gasto ({monto_convertido})."
            )
        
    print(f"DEBUG: Guardando gasto: {data.Nombre}, Monto Original: {data.MontoOriginal} {moneda_gasto}, Monto Convertido: {monto_convertido}")
        
    gasto = Gasto(
        IdViaje=data.IdViaje,
        Nombre=data.Nombre,
        Monto=monto_convertido,            # Monto convertido a la moneda base (usado para cálculos)
        MontoOriginal=data.MontoOriginal,  # Monto ingresado originalmente
        MonedaOriginal=moneda_gasto,       # Moneda seleccionada
        TipoCambio=tipo_cambio,            # Tasa aplicada
        IdCategoria=data.IdCategoria,
        IdPagador=id_pagador if not data.EsCompartido else data.IdPagador,
        FechaGasto=fecha_gasto_dt,
        DividirEntreTodos=data.DividirEntreTodos,
        TipoDivision=tipo_division_final,
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
    await dispatch_trip_notification(
        db,
        TripNotificationEvent(
            notification_type=NotificationType.NUEVO_GASTO,
            tipo="gasto_creado",
            titulo=f"Nuevo gasto en {viaje.Titulo}",
            mensaje=f"{_actor_display_name(current_user)} registró el gasto {gasto.Nombre}.",
            id_viaje=data.IdViaje,
            id_usuario_actor=current_user.IdUsuario,
            data={
                "eventType": "expense_created",
                "expenseId": gasto.IdGasto,
            },
        ),
    )

    return {
        "message": "Gasto creado correctamente",
        "IdGasto": gasto.IdGasto,
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

    require_trip_access(get_trip_with_relations(db, trip_id), current_user)

    query = (
        select(Gasto)
        .options(
            selectinload(Gasto.Categoria),
            selectinload(Gasto.Pagador).selectinload(ParticipanteViaje.Usuario),
        )
        .where(Gasto.IdViaje == trip_id)
        .order_by(Gasto.FechaGasto.desc(), Gasto.FechaCreacion.desc(), Gasto.IdGasto.desc())
    )
    if categoria is not None:
        query = query.where(Gasto.IdCategoria == categoria)

    gastos = db.scalars(query).all()

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
        )
        for gasto in gastos
    ]


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
            NombreUsuario=p.Usuario.NombreUsuario
        )
        for p in participantes
    ]