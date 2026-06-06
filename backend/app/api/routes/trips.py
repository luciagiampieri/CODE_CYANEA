from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.api.routes.users import get_current_user
from app.schemas.trip import TripCreate, TripRead


router = APIRouter()


@router.get("", response_model=list[TripRead])
def list_trips(db: Session = Depends(get_db)) -> list[TripRead]:
    viajes = db.scalars(select(Viaje).order_by(Viaje.FechaCreacion.desc())).all()

    return [
        TripRead(
            id=viaje.IdViaje,
            title=viaje.Titulo,
            destination=viaje.Destino,
            status=viaje.EstadoViaje.Nombre,
            currency=viaje.Moneda,
        )
        for viaje in viajes
    ]


@router.post("", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(payload: TripCreate, db: Session = Depends(get_db)) -> TripRead:
    admin_user_id = payload.adminUserId
    if admin_user_id is None:
        usuario_actual = get_current_user(db)
        if usuario_actual is None:
            raise HTTPException(status_code=404, detail="No hay usuario creador disponible")
        admin_user_id = usuario_actual.IdUsuario

    administrador = db.get(Usuario, admin_user_id)
    if administrador is None or not administrador.Activo:
        raise HTTPException(status_code=404, detail="Administrador no encontrado")

    participantes_ids = sorted(set(payload.participantUserIds) - {admin_user_id})
    if participantes_ids:
        participantes = db.scalars(
            select(Usuario).where(Usuario.IdUsuario.in_(participantes_ids), Usuario.Activo.is_(True))
        ).all()
        if len(participantes) != len(participantes_ids):
            raise HTTPException(status_code=400, detail="Hay participantes inexistentes o inactivos")

    estado_activo = db.scalar(
        select(EstadoViaje).where(EstadoViaje.Nombre == "activo", EstadoViaje.Activo.is_(True))
    )
    rol_admin = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "administrador",
            RolParticipante.Activo.is_(True),
        )
    )
    rol_participante = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "participante",
            RolParticipante.Activo.is_(True),
        )
    )
    estado_aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado",
            EstadoParticipacion.Activo.is_(True),
        )
    )
    estado_invitado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "invitado",
            EstadoParticipacion.Activo.is_(True),
        )
    )

    if not all([estado_activo, rol_admin, rol_participante, estado_aceptado, estado_invitado]):
        raise HTTPException(status_code=500, detail="Faltan datos maestros requeridos")

    viaje = Viaje(
        Titulo=payload.title,
        Destino=payload.destination,
        Descripcion=payload.description,
        FechaInicio=payload.startDate,
        FechaFin=payload.endDate,
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda=payload.currency.upper(),
        IdAdministrador=administrador.IdUsuario,
    )
    db.add(viaje)
    db.flush()

    ahora = datetime.now()
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=administrador.IdUsuario,
            IdRolParticipante=rol_admin.IdRolParticipante,
            IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
            FechaInvitacion=ahora,
            FechaRespuesta=ahora,
            FechaIncorporacion=ahora,
            InvitadoPor=administrador.IdUsuario,
        )
    )

    for participante_id in participantes_ids:
        db.add(
            ParticipanteViaje(
                IdViaje=viaje.IdViaje,
                IdUsuario=participante_id,
                IdRolParticipante=rol_participante.IdRolParticipante,
                IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
                InvitadoPor=administrador.IdUsuario,
            )
        )

    db.commit()
    db.refresh(viaje)

    return TripRead(
        id=viaje.IdViaje,
        title=viaje.Titulo,
        destination=viaje.Destino,
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
    )
