import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.enlace_invitacion import (
    EnlaceInvitacionCreate,
    EnlaceInvitacionRead,
    InvitacionCompartidaRead,
    IncorporacionViajeRead,
)
from app.services import enlaces_invitacion as servicio
from app.services.notifications import (
    dispatch_user_notification,
    TripNotificationEvent,
    NotificationType,
)
from app.services.privacidad import nombre_para_otros
from app.services.websocket_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)


def resumen(enlace):
    activo = servicio.enlace_activo(enlace)
    return EnlaceInvitacionRead(
        url=f"{settings.mail_frontend_base_url.rstrip('/')}/unirse/{enlace.TokenEnlace}"
        if activo
        else None,
        activo=activo,
        fechaVencimiento=enlace.FechaVencimiento if enlace else None,
    )


@router.get("/trips/{trip_id}/enlace-invitacion", response_model=EnlaceInvitacionRead)
def leer(
    trip_id: int,
    response: Response,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    response.headers["Cache-Control"] = "no-store"
    servicio.gestionar_viaje(db, trip_id, usuario)
    return resumen(servicio.obtener_enlace(db, trip_id))


@router.post("/trips/{trip_id}/enlace-invitacion", response_model=EnlaceInvitacionRead)
def crear(
    trip_id: int,
    data: EnlaceInvitacionCreate,
    response: Response,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    response.headers["Cache-Control"] = "no-store"
    viaje = servicio.gestionar_viaje(db, trip_id, usuario)
    return resumen(servicio.generar_enlace(db, viaje, usuario, data.renovar))


@router.delete("/trips/{trip_id}/enlace-invitacion", response_model=EnlaceInvitacionRead)
def revocar(
    trip_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)
):
    servicio.gestionar_viaje(db, trip_id, usuario)
    enlace = servicio.obtener_enlace(db, trip_id)
    if enlace:
        enlace.FechaRevocacion = datetime.now(timezone.utc)
        db.commit()
    return resumen(enlace)


@router.get("/invitaciones/enlaces/{token}", response_model=InvitacionCompartidaRead)
def consultar(token: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    viaje, _ = servicio.resolver_enlace(db, token)
    return InvitacionCompartidaRead(
        titulo=viaje.Titulo,
        administrador=viaje.Administrador.NombreUsuario,
        destinos=[d.Destino.Nombre for d in viaje.Destinos],
        fechaInicio=viaje.FechaInicio,
        fechaFin=viaje.FechaFin,
    )


@router.post("/invitaciones/enlaces/{token}/unirse", response_model=IncorporacionViajeRead)
async def unirse(
    token: str, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)
):
    viaje, ya_participaba = servicio.incorporarse(db, token, usuario)
    if not ya_participaba:
        try:
            await manager.broadcast_to_trip(
                viaje.IdViaje, {"tipo": "participante_acepto", "trip_id": viaje.IdViaje}
            )
        except Exception:
            logger.warning("No se pudo difundir la incorporación al viaje", exc_info=True)
        try:
            await dispatch_user_notification(
                db,
                TripNotificationEvent(
                    notification_type=NotificationType.CAMBIO_VIAJE,
                    tipo="participante_incorporado",
                    titulo="Un participante se unió al viaje",
                    mensaje=f"{nombre_para_otros(usuario)} se unió a '{viaje.Titulo}' mediante el enlace de invitación.",
                    id_viaje=viaje.IdViaje,
                    id_usuario_actor=usuario.IdUsuario,
                    data={"eventType": "member_joined"},
                ),
                [viaje.Administrador],
            )
        except Exception:
            db.rollback()
            logger.warning("No se pudo notificar la incorporación al viaje", exc_info=True)
    return IncorporacionViajeRead(
        idViaje=viaje.IdViaje,
        yaParticipaba=ya_participaba,
        message="Ya formás parte de este viaje."
        if ya_participaba
        else "Te uniste al viaje correctamente.",
    )
