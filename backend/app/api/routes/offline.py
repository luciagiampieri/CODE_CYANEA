from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.offline import AccesoOfflineRead
from app.services.trip_access import resolve_trip_status

router = APIRouter(tags=["offline"])


@router.get("/offline/access", response_model=AccesoOfflineRead)
def obtener_acceso_offline(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> AccesoOfflineRead:
    viajes = db.scalars(
        select(Viaje)
        .options(selectinload(Viaje.EstadoViaje))
        .join(ParticipanteViaje, ParticipanteViaje.IdViaje == Viaje.IdViaje)
        .join(
            EstadoParticipacion,
            EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
        )
        .where(
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            EstadoParticipacion.Nombre == "aceptado",
        )
    ).all()

    hoy = date.today()
    return AccesoOfflineRead(
        IdsViajes=sorted(
            viaje.IdViaje
            for viaje in viajes
            if resolve_trip_status(viaje, hoy) == "activo"
        )
    )