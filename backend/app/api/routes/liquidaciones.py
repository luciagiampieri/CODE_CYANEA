from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ParticipanteViaje, Usuario, Viaje
from app.schemas.liquidacion import LiquidacionViajeRead, TransferenciaLiquidacionUpdate
from app.services.liquidacion_service import (
    build_settlement_response,
    marcar_transferencia_realizada,
    rebuild_settlement_plan,
)

router = APIRouter()


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
        return build_settlement_response(db, trip_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/{trip_id}/settlement/rebuild", response_model=LiquidacionViajeRead)
def rebuild_trip_settlement(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_trip_member(db, trip_id, current_user)
    try:
        liquidacion = rebuild_settlement_plan(db, trip_id)
        return build_settlement_response(db, trip_id, liquidacion)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/{trip_id}/settlement/transfers/{transfer_id}", response_model=LiquidacionViajeRead)
def update_trip_settlement_transfer(
    trip_id: int,
    transfer_id: int,
    payload: TransferenciaLiquidacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_trip_member(db, trip_id, current_user)
    try:
        liquidacion = marcar_transferencia_realizada(db, trip_id, transfer_id, payload.Realizada)
        return build_settlement_response(db, trip_id, liquidacion)
    except ValueError as error:
        detail = str(error)
        raise HTTPException(
            status_code=404 if "no encontrada" in detail.lower() else 400,
            detail=detail,
        ) from error
