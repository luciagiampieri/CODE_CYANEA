from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
 
from app.models.destino_viaje import DestinoViaje
from app.models.dia_cronograma import DiaCronograma
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
 
 
ESTADOS_PARTICIPACION_CON_ACCESO = {"aceptado", "invitado", "salio"}


def get_trip_with_relations(db: Session, trip_id: int) -> Viaje | None:
    return db.scalar(
        select(Viaje)
        .options(
            selectinload(Viaje.Administrador),
            selectinload(Viaje.EstadoViaje),
            selectinload(Viaje.Cronograma).selectinload(DiaCronograma.Actividades),
            selectinload(Viaje.Cronograma).selectinload(DiaCronograma.Ruta),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.Usuario),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.RolParticipante),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.EstadoParticipacion),
            selectinload(Viaje.Invitaciones).selectinload(InvitacionViaje.EstadoInvitacion),
            selectinload(Viaje.Destinos).selectinload(DestinoViaje.Destino),
        )
        .where(Viaje.IdViaje == trip_id)
    )
 
 
def require_trip_access(viaje: Viaje | None, current_user: Usuario) -> Viaje:
    if viaje is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")
 
    if viaje.EstadoViaje.Nombre == "eliminado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El acceso a este viaje ha sido restringido porque fue eliminado.",
        )
 
    participacion = next(
        (
            part
            for part in viaje.Participantes
            if part.IdUsuario == current_user.IdUsuario
        ),
        None,
    )

    puede_ver = (
        viaje.IdAdministrador == current_user.IdUsuario
        or (
            participacion is not None
            and participacion.EstadoParticipacion.Nombre in {"aceptado", "salio", "invitado"}
        )
    )

    if not puede_ver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver este viaje",
        )
    return viaje


def require_trip_edit_access(viaje: Viaje | None, current_user: Usuario) -> Viaje:
    viaje = require_trip_access(viaje, current_user)

    participacion = next(
        (
            part
            for part in viaje.Participantes
            if part.IdUsuario == current_user.IdUsuario
        ),
        None,
    )

    if participacion is None or participacion.EstadoParticipacion.Nombre != "aceptado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para modificar este viaje",
        )

    return viaje