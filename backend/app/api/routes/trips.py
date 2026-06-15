from datetime import datetime, timedelta
import logging
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.trip import TripCreate, TripRead
from app.services.mail import get_mail_service
from app.services.notifications.invitation_email_sender import (
    InvitationEmailPayload,
    InvitationEmailSender,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=list[TripRead])
def list_trips(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[TripRead]:
    """
    US-16: Devuelve los viajes activos y finalizados donde el usuario
    autenticado es participante.
    """
    viajes = db.scalars(
        select(Viaje)
        .join(ParticipanteViaje, ParticipanteViaje.IdViaje == Viaje.IdViaje)
        .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
        .where(
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            EstadoViaje.Nombre.in_(["activo", "finalizado"]),
        )
        .order_by(Viaje.FechaCreacion.desc())
    ).all()

    return [
        TripRead(
            id=viaje.IdViaje,
            title=viaje.Titulo,
            destination=viaje.Destino,
            status=viaje.EstadoViaje.Nombre,
            currency=viaje.Moneda,
            startDate=viaje.FechaInicio,
            endDate=viaje.FechaFin,
        )
        for viaje in viajes
    ]


@router.post("", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripRead:
    # El administrador siempre es el usuario autenticado
    administrador = current_user
    admin_user_id = current_user.IdUsuario

    participantes_ids = set(payload.participantUserIds) - {admin_user_id}
    if participantes_ids:
        participantes = db.scalars(
            select(Usuario).where(
                Usuario.IdUsuario.in_(participantes_ids), Usuario.Activo.is_(True)
            )
        ).all()
        if len(participantes) != len(participantes_ids):
            raise HTTPException(
                status_code=400, detail="Hay participantes inexistentes o inactivos"
            )

    emails_invitados = set(payload.invitedEmails)
    if emails_invitados:
        usuarios_existentes = db.scalars(
            select(Usuario).where(Usuario.Email.in_(emails_invitados))
        ).all()
        usuarios_por_email = {u.Email.lower(): u for u in usuarios_existentes}

        usuarios_inactivos = [u.Email for u in usuarios_existentes if not u.Activo]
        if usuarios_inactivos:
            raise HTTPException(
                status_code=400,
                detail="Hay invitaciones dirigidas a usuarios registrados inactivos",
            )

        for email in list(emails_invitados):
            usuario_existente = usuarios_por_email.get(email)
            if usuario_existente is None:
                continue
            if usuario_existente.IdUsuario != admin_user_id:
                participantes_ids.add(usuario_existente.IdUsuario)
            emails_invitados.discard(email)

    if administrador.Email.lower() in emails_invitados:
        emails_invitados.discard(administrador.Email.lower())

    participantes_ids = sorted(participantes_ids)

    estado_activo = db.scalar(
        select(EstadoViaje).where(EstadoViaje.Nombre == "activo", EstadoViaje.Activo.is_(True))
    )
    rol_admin = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "administrador", RolParticipante.Activo.is_(True)
        )
    )
    rol_participante = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "participante", RolParticipante.Activo.is_(True)
        )
    )
    estado_aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado", EstadoParticipacion.Activo.is_(True)
        )
    )
    estado_invitado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "invitado", EstadoParticipacion.Activo.is_(True)
        )
    )
    estado_invitacion_pendiente = db.scalar(
        select(EstadoInvitacion).where(
            EstadoInvitacion.Nombre == "pendiente", EstadoInvitacion.Activo.is_(True)
        )
    )

    if not all(
        [
            estado_activo,
            rol_admin,
            rol_participante,
            estado_aceptado,
            estado_invitado,
            estado_invitacion_pendiente,
        ]
    ):
        raise HTTPException(status_code=500, detail="Faltan datos maestros requeridos")

    viaje = Viaje(
        Titulo=payload.title,
        Destino=payload.destination,
        Descripcion=payload.description,
        FechaInicio=payload.startDate,
        FechaFin=payload.endDate,
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda=payload.currency.upper(),
        IdAdministrador=admin_user_id,
    )
    db.add(viaje)
    db.flush()

    ahora = datetime.now()
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=admin_user_id,
            IdRolParticipante=rol_admin.IdRolParticipante,
            IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
            FechaInvitacion=ahora,
            FechaRespuesta=ahora,
            FechaIncorporacion=ahora,
            InvitadoPor=admin_user_id,
        )
    )

    for participante_id in participantes_ids:
        db.add(
            ParticipanteViaje(
                IdViaje=viaje.IdViaje,
                IdUsuario=participante_id,
                IdRolParticipante=rol_participante.IdRolParticipante,
                IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
                InvitadoPor=admin_user_id,
            )
        )

    vencimiento = ahora + timedelta(days=7)
    invitaciones_email: list[InvitationEmailPayload] = []
    for email_invitado in sorted(emails_invitados):
        token_invitacion = token_urlsafe(32)
        db.add(
            InvitacionViaje(
                IdViaje=viaje.IdViaje,
                EmailInvitado=email_invitado,
                NombreInvitado=None,
                TokenInvitacion=token_invitacion,
                FechaVencimiento=vencimiento,
                IdEstadoInvitacion=estado_invitacion_pendiente.IdEstadoInvitacion,
                InvitadoPor=admin_user_id,
            )
        )
        invitaciones_email.append(
            InvitationEmailPayload(
                to_email=email_invitado,
                trip_title=viaje.Titulo,
                trip_destination=viaje.Destino,
                inviter_name=f"{administrador.Nombre} {administrador.Apellido}",
                invitation_token=token_invitacion,
                expiration_at=vencimiento,
            )
        )

    db.commit()
    db.refresh(viaje)

    invitation_sender = InvitationEmailSender(get_mail_service())
    for invitacion in invitaciones_email:
        try:
            invitation_sender.send(invitacion)
        except Exception:
            logger.exception(
                "No se pudo enviar el correo de invitacion",
                extra={"email": invitacion.to_email, "trip_id": viaje.IdViaje},
            )

    return TripRead(
        id=viaje.IdViaje,
        title=viaje.Titulo,
        destination=viaje.Destino,
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
        startDate=viaje.FechaInicio,
        endDate=viaje.FechaFin,
    )