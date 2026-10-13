from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ParticipanteViaje, Usuario, Viaje
from app.schemas.liquidacion import LiquidacionViajeRead, MiSaldoRead, TransferenciaLiquidacionUpdate
from app.services.liquidacion_service import (
    PermisoTransferenciaError,
    build_settlement_response,
    desglose_saldo_usuario,
    informar_transferencia,
    marcar_transferencia_realizada,
    rebuild_settlement_plan,
    rechazar_transferencia,
)
from app.services.websocket_manager import manager
from app.services.notificaciones_gastos import (
    notificar_transferencia_informada,
    notificar_transferencia_rechazada,
)

router = APIRouter()


async def _avisar_liquidacion_actualizada(trip_id: int) -> None:
    """Los demás participantes ven los saldos y transferencias nuevos sin recargar."""
    await manager.broadcast_to_trip(trip_id, {"tipo": "liquidacion_actualizada"})


def _assert_trip_member(db: Session, trip_id: int, current_user: Usuario) -> Viaje:
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    es_admin = viaje.IdAdministrador == current_user.IdUsuario
    es_participante = db.scalar(
        select(ParticipanteViaje).where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
        )
    ) is not None
    if not (es_admin or es_participante):
        raise HTTPException(status_code=403, detail="No formas parte de este viaje")
    return viaje


@router.get("/{trip_id}/settlement", response_model=LiquidacionViajeRead)
def get_trip_settlement(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_trip_member(db, trip_id, current_user)
    try:
        return build_settlement_response(db, trip_id, id_usuario=current_user.IdUsuario)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/{trip_id}/settlement/mi-saldo", response_model=MiSaldoRead)
def get_my_settlement_balance(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """"De dónde sale tu saldo": tus gastos compartidos y transferencias, uno por uno."""
    _assert_trip_member(db, trip_id, current_user)
    try:
        return desglose_saldo_usuario(db, trip_id, current_user.IdUsuario)
    except PermisoTransferenciaError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/{trip_id}/settlement/rebuild", response_model=LiquidacionViajeRead)
async def rebuild_trip_settlement(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_trip_member(db, trip_id, current_user)
    try:
        liquidacion = rebuild_settlement_plan(db, trip_id)
        respuesta = build_settlement_response(
            db, trip_id, liquidacion, id_usuario=current_user.IdUsuario
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    await _avisar_liquidacion_actualizada(trip_id)
    return respuesta


def _error_transferencia(error: Exception) -> HTTPException:
    if isinstance(error, PermisoTransferenciaError):
        return HTTPException(status_code=403, detail=str(error))
    detail = str(error)
    return HTTPException(
        status_code=404 if "no encontrada" in detail.lower() else 400,
        detail=detail,
    )


@router.patch("/{trip_id}/settlement/transfers/{transfer_id}", response_model=LiquidacionViajeRead)
async def update_trip_settlement_transfer(
    trip_id: int,
    transfer_id: int,
    payload: TransferenciaLiquidacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """El acreedor confirma que le llegó la transferencia (Realizada=true) o lo deshace."""
    _assert_trip_member(db, trip_id, current_user)
    try:
        liquidacion = marcar_transferencia_realizada(
            db, trip_id, transfer_id, payload.Realizada, current_user.IdUsuario
        )
        respuesta = build_settlement_response(
            db, trip_id, liquidacion, id_usuario=current_user.IdUsuario
        )
    except (ValueError, PermisoTransferenciaError) as error:
        raise _error_transferencia(error) from error

    await _avisar_liquidacion_actualizada(trip_id)
    return respuesta


@router.post(
    "/{trip_id}/settlement/transfers/{transfer_id}/informar",
    response_model=LiquidacionViajeRead,
)
async def report_trip_settlement_transfer(
    trip_id: int,
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """"Ya transferí": el deudor avisa que pagó y se le pide al acreedor que lo confirme."""
    viaje = _assert_trip_member(db, trip_id, current_user)
    try:
        liquidacion, datos = informar_transferencia(
            db, trip_id, transfer_id, current_user.IdUsuario
        )
        respuesta = build_settlement_response(
            db, trip_id, liquidacion, id_usuario=current_user.IdUsuario
        )
    except (ValueError, PermisoTransferenciaError) as error:
        raise _error_transferencia(error) from error

    await _avisar_liquidacion_actualizada(trip_id)
    await notificar_transferencia_informada(db, viaje, datos)
    return respuesta


@router.post(
    "/{trip_id}/settlement/transfers/{transfer_id}/rechazar",
    response_model=LiquidacionViajeRead,
)
async def reject_trip_settlement_transfer(
    trip_id: int,
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """"No me llegó": el acreedor rechaza el aviso; la deuda vuelve a pendiente."""
    viaje = _assert_trip_member(db, trip_id, current_user)
    try:
        liquidacion, datos = rechazar_transferencia(
            db, trip_id, transfer_id, current_user.IdUsuario
        )
        respuesta = build_settlement_response(
            db, trip_id, liquidacion, id_usuario=current_user.IdUsuario
        )
    except (ValueError, PermisoTransferenciaError) as error:
        raise _error_transferencia(error) from error

    await _avisar_liquidacion_actualizada(trip_id)
    await notificar_transferencia_rechazada(db, viaje, datos)
    return respuesta