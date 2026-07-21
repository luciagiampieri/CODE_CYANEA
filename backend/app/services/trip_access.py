from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
 
from app.models.destino_viaje import DestinoViaje
from app.models.dia_cronograma import DiaCronograma
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
 
 
def get_trip_with_relations(db: Session, trip_id: int) -> Viaje | None:
    return db.scalar(
        select(Viaje)
        .options(
            selectinload(Viaje.Administrador),
            selectinload(Viaje.EstadoViaje),
            selectinload(Viaje.Cronograma).selectinload(DiaCronograma.Actividades),
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
 
    if viaje.EstadoViaje.Nombre == "cancelado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El acceso a este viaje ha sido restringido porque fue eliminado.",
        )
 
    puede_ver = (
        viaje.IdAdministrador == current_user.IdUsuario
        or any(part.IdUsuario == current_user.IdUsuario for part in viaje.Participantes)
    )
    if not puede_ver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver este viaje",
        )
    return viaje